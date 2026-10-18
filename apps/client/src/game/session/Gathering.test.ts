import { afterEach, describe, expect, it } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, RESOURCE_CONFIG, SIMULATION_CONFIG, TEST_WORLD, type PlayerControlFrame } from '@forest-survival/shared';
import { LocalSession } from './LocalSession';
import { PhysicsWorld } from '../world/PhysicsWorld';

const dt = SIMULATION_CONFIG.fixedStep;
const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });

function advance(session: LocalSession, frames: number, input: PlayerControlFrame = NEUTRAL_PLAYER_INPUT) {
  for (let i = 0; i < frames; i++) session.step(dt, input);
}

async function approachTree() {
  const session = await LocalSession.create();
  resources.push(session);
  session.start();
  advance(session, 180);
  advance(session, 50, { ...NEUTRAL_PLAYER_INPUT, moveX: -1, moveY: -1 });
  const tree = TEST_WORLD.trees[0]!;
  const position = session.getSnapshot().player.position;
  const yaw = Math.atan2(tree.position.x - position.x, tree.position.z - position.z);
  return { session, tree, yaw };
}

describe('complete gathering flow with real Rapier', () => {
  it('walks to a tree, chops it, removes its collider and collects wood once', async () => {
    const { session, tree, yaw } = await approachTree();
    for (let hit = 0; hit < 4; hit++) {
      const command = { type: 'use-item' as const, yaw, requestId: 'hit-' + hit };
      expect(session.sendCommand(command).accepted).toBe(true);
      expect(session.sendCommand(command)).toEqual({ accepted: true, duplicate: true });
      expect(session.sendCommand({ ...command, requestId: 'spam-' + hit }).reason).toBe('busy');
      advance(session, 42);
    }
    let snapshot = session.getSnapshot();
    expect(snapshot.gameplay.resources.find((entry) => entry.id === tree.id)?.exhausted).toBe(true);
    expect(snapshot.gameplay.loot).toHaveLength(RESOURCE_CONFIG.woodPerTree);
    const position = snapshot.player.position;
    const dx = tree.position.x - position.x, dz = tree.position.z - position.z;
    const distance = Math.hypot(dx, dz);
    advance(session, 20, { ...NEUTRAL_PLAYER_INPUT, moveX: dx / distance, moveY: -dz / distance });
    snapshot = session.getSnapshot();
    expect(Math.hypot(snapshot.player.position.x - tree.position.x, snapshot.player.position.z - tree.position.z)).toBeLessThan(0.4);
    for (const item of snapshot.gameplay.loot) {
      const command = { type: 'pickup' as const, targetId: item.id, requestId: 'pickup-' + item.id };
      expect(session.sendCommand(command).accepted).toBe(true);
      expect(session.sendCommand(command)).toEqual({ accepted: true, duplicate: true });
      expect(session.sendCommand({ ...command, requestId: 'again-' + item.id }).reason).toBe('missing');
    }
    expect(session.getSnapshot().gameplay.bag.wood).toBe(3);
    expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
    const restarted = await LocalSession.create();
    resources.push(restarted);
    expect(restarted.getSnapshot().gameplay.bag.wood).toBe(0);
    expect(restarted.getSnapshot().gameplay.resources.every((entry) => !entry.exhausted)).toBe(true);
  });

  it('does not damage a distant tree or complete a windup during pause', async () => {
    const session = await LocalSession.create();
    resources.push(session);
    session.start();
    advance(session, 180);
    session.sendCommand({ type: 'use-item', yaw: 0, requestId: 'far' });
    advance(session, 42);
    expect(session.getSnapshot().gameplay.resources.every((entry) => entry.health === entry.maxHealth)).toBe(true);
    const { session: near, yaw, tree } = await approachTree();
    near.sendCommand({ type: 'use-item', yaw, requestId: 'pause-hit' });
    advance(near, 6);
    near.pause();
    const before = near.getSnapshot();
    advance(near, 120);
    expect(near.getSnapshot()).toEqual(before);
    expect(near.sendCommand({ type: 'use-item', yaw, requestId: 'while-paused' }).reason).toBe('paused');
    near.start();
    advance(near, 8);
    expect(near.getSnapshot().gameplay.resources.find((entry) => entry.id === tree.id)?.health).toBe(75);
  });

  it('uses real wall visibility and ignores only the intended target collider', async () => {
    const physics = await PhysicsWorld.create();
    resources.push(physics);
    expect(physics.hasLineOfSight({ x: 3, y: 1, z: 0 }, { x: 5, y: 1, z: 0 })).toBe(false);
    // Keep the clear path outside the new stone node at (2.5, 4).
    expect(physics.hasLineOfSight({ x: 3, y: 1, z: 4.8 }, { x: 5, y: 1, z: 4.8 })).toBe(true);
    const origin = { x: -2.6, y: 1, z: 3 }, target = { x: -4, y: 1.2, z: 3 };
    expect(physics.hasLineOfSight(origin, target)).toBe(false);
    expect(physics.hasLineOfSight(origin, target, 'tree-01')).toBe(true);
    physics.removeEntityCollider('tree-01');
    physics.step(dt);
    expect(physics.hasLineOfSight(origin, target)).toBe(true);
  });
});
