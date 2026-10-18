import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_CONFIG, SIMULATION_CONFIG } from '@forest-survival/shared';
import { PhysicsWorld } from '../world/PhysicsWorld';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });

async function createSession(): Promise<LocalSession> {
  const session = await LocalSession.create();
  resources.push(session);
  return session;
}

describe('Rapier collision integration', () => {
  it('lands the kinematic capsule on the floor', async () => {
    const physics = await PhysicsWorld.create();
    resources.push(physics);
    for (let i = 0; i < 180; i++) physics.step(SIMULATION_CONFIG.fixedStep);
    const player = physics.getPlayerSnapshot();
    expect(player.grounded).toBe(true);
    expect(player.position.y).toBeCloseTo(PLAYER_CONFIG.halfHeight + PLAYER_CONFIG.radius + PLAYER_CONFIG.collisionOffset, 2);
    expect(physics.getDebugGeometry().vertices.length).toBeGreaterThan(0);
  });

  it('blocks horizontal movement through a solid wall', async () => {
    const physics = await PhysicsWorld.create();
    resources.push(physics);
    for (let i = 0; i < 180; i++) physics.step(SIMULATION_CONFIG.fixedStep);
    for (let i = 0; i < 240; i++) physics.step(SIMULATION_CONFIG.fixedStep, { x: 5 * SIMULATION_CONFIG.fixedStep, z: 0 });
    const position = physics.getPlayerSnapshot().position;
    expect(position.x).toBeGreaterThan(3);
    expect(position.x).toBeLessThan(3.36);
    expect(position.y).toBeGreaterThan(0.85);
  });
});

describe('local session', () => {
  it('freezes simulation while paused and isolates state snapshots', async () => {
    const session = await createSession();
    session.start();
    for (let i = 0; i < 30; i++) session.step(SIMULATION_CONFIG.fixedStep);
    session.pause();
    const snapshot = session.getSnapshot();
    for (let i = 0; i < 60; i++) session.step(SIMULATION_CONFIG.fixedStep);
    expect(session.getSnapshot()).toEqual(snapshot);
    (snapshot.player.position as { x: number }).x = 1000;
    expect(session.getSnapshot().player.position.x).toBe(0);
  });

  it('does not reapply a repeated reset command', async () => {
    const session = await createSession();
    session.start();
    for (let i = 0; i < 60; i++) session.step(SIMULATION_CONFIG.fixedStep);
    expect(session.sendCommand({ type: 'reset-player', requestId: 'same-request' })).toEqual({ accepted: true });
    for (let i = 0; i < 10; i++) session.step(SIMULATION_CONFIG.fixedStep);
    const before = session.getSnapshot();
    expect(before.player.position.y).toBeLessThan(PLAYER_CONFIG.spawn.y);
    expect(session.sendCommand({ type: 'reset-player', requestId: 'same-request' })).toEqual({ accepted: true, duplicate: true });
    expect(session.getSnapshot()).toEqual(before);
  });

  it('removes subscriptions and prevents reuse of a destroyed session', async () => {
    const session = await createSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    session.start();
    expect(listener).toHaveBeenCalledTimes(1);
    session.destroy();
    session.destroy();
    session.start();
    expect(session.getSnapshot().status).toBe('stopped');
    expect(session.sendCommand({ type: 'reset-player', requestId: 'late' }).accepted).toBe(false);
  });

  it('can create and destroy successive games without accumulating frame loops', async () => {
    const scheduler = new FakeScheduler();
    for (let run = 0; run < 10; run++) {
      const session = await createSession();
      const view = { render: vi.fn(), destroy: vi.fn() };
      const game = new Game(session, view, scheduler);
      game.start();
      game.start();
      expect(scheduler.pending.size).toBe(1);
      scheduler.advance(run * 1000);
      scheduler.advance(run * 1000 + 100);
      expect(view.render).toHaveBeenCalled();
      game.pause();
      expect(scheduler.pending.size).toBe(0);
      game.start();
      expect(scheduler.pending.size).toBe(1);
      game.destroy();
      game.destroy();
      expect(scheduler.pending.size).toBe(0);
      expect(view.destroy).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot().status).toBe('stopped');
    }
  });
});
