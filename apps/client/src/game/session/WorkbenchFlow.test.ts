import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_WORLD, TEST_MATERIAL_NODES, WORKBENCH_CONFIG, type SessionCommand } from '@forest-survival/shared';
import { LocalSession } from './LocalSession';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { PhysicsWorld } from '../world/PhysicsWorld';
import { DEFAULT_CONTROL_SETTINGS } from '../input/ControlSettings';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
function advance(session: LocalSession, steps: number) { for (let index = 0; index < steps; index++) session.step(SIMULATION_CONFIG.fixedStep); }
function walk(session: LocalSession, x: number, z: number) {
  for (let step = 0; step < 500; step++) {
    const p = session.getSnapshot().player.position, dx = x - p.x, dz = z - p.z;
    if (Math.hypot(dx, dz) < 0.1) return;
    session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: dx, moveY: -dz });
  }
  throw new Error('Unreachable test point ' + x + ',' + z);
}
async function setup() { const session = await LocalSession.create(); resources.push(session); session.start(); advance(session, 180); return session; }
let sequence = 0;
function send(session: LocalSession, command: Omit<SessionCommand, 'requestId'> & Record<string, unknown>) { return session.sendCommand({ ...command, requestId: 'flow-' + (++sequence) } as SessionCommand); }
function harvest(session: LocalSession, id: string) {
  const resource = session.getSnapshot().gameplay.resources.find((entry) => entry.id === id)!;
  const slot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === resource.requiredTool);
  expect(send(session, { type: 'select-slot', slot }).accepted).toBe(true);
  const hits = resource.kind === 'tree' ? 4 : 3;
  for (let hit = 0; hit < hits; hit++) {
    const p = session.getSnapshot().player.position;
    expect(send(session, { type: 'use-item', yaw: Math.atan2(resource.position.x - p.x, resource.position.z - p.z) }).accepted).toBe(true);
    advance(session, 42);
  }
  expect(session.getSnapshot().gameplay.resources.find((entry) => entry.id === id)?.exhausted).toBe(true);
}
function pickup(session: LocalSession, prefix: string, amount = Infinity) {
  for (const item of session.getSnapshot().gameplay.loot.filter((entry) => entry.id.startsWith(prefix + '/')).slice(0, amount)) expect(send(session, { type: 'pickup', targetId: item.id }).accepted).toBe(true);
}
async function gather() {
  const session = await setup();
  expect(send(session, { type: 'transfer-item', direction: 'withdraw', slot: 0, expectedItemId: 'starter-pickaxe' }).accepted).toBe(true);
  walk(session, -2.4, 2);
  harvest(session, TEST_WORLD.trees[0]!.id);
  walk(session, -3.6, 3);
  pickup(session, 'tree-01');
  walk(session, -1.5, 5);
  walk(session, 1.2, 5);
  harvest(session, TEST_MATERIAL_NODES[0]!.id);
  walk(session, 2.5, 4);
  pickup(session, 'rock-01');
  walk(session, 1.2, 5);
  walk(session, -1.5, 5);
  walk(session, -1.5, 0);
  walk(session, 0.6, -2);
  return session;
}

describe('ordinary workbench session with Rapier', () => {
  it('gathers and buys both station levels and the backpack without debug, preserves identity and protects repeated commands', async () => {
    const session = await gather();
    expect(send(session, { type: 'build-workbench' }).accepted).toBe(true);
    const initialTools = session.getSnapshot().gameplay.inventory.slots.filter((stack) => stack?.itemId === 'axe' || stack?.itemId === 'pickaxe');
    const inventory = session.getSnapshot().gameplay.inventory;
    expect(send(session, { type: 'upgrade-workbench', expectedLevel: 1 }).reason).toBe('insufficient-materials');
    expect(session.getSnapshot().gameplay.inventory).toEqual(inventory);
    walk(session, 0, 0); walk(session, -1.5, 5); walk(session, -8.5, 6.5);
    harvest(session, 'tree-04'); walk(session, -9.6, 7); pickup(session, 'tree-04');
    walk(session, -9, 0); harvest(session, 'scrap-02'); walk(session, -9, -2); pickup(session, 'scrap-02');
    walk(session, -8, -3); walk(session, 0.6, -3);
    const first = { type: 'upgrade-workbench' as const, expectedLevel: 1 as const, requestId: 'station-two' };
    const fire = session.getSnapshot().gameplay.campfire;
    expect(session.sendCommand(first).accepted).toBe(true);
    expect(session.sendCommand(first)).toMatchObject({ accepted: true, duplicate: true });
    expect(session.getSnapshot().gameplay.campfire).toEqual(fire);
    expect(send(session, { type: 'upgrade-workbench', expectedLevel: 1 }).reason).toBe('stale');
    expect(session.getSnapshot().gameplay.workbench.level).toBe(2);
    expect(send(session, { type: 'craft-item', recipeId: 'expanded-backpack' }).reason).toBe('station-level');
    walk(session, -8, -3); walk(session, -8, -6.4);
    harvest(session, 'tree-03'); walk(session, -8, -7.8); pickup(session, 'tree-03', 2);
    walk(session, -10.5, -9); harvest(session, 'scrap-04'); walk(session, -12, -10); pickup(session, 'scrap-04', 1);
    walk(session, -8, -10); walk(session, -8, -3); walk(session, 0.6, -3);
    const second = { type: 'upgrade-workbench' as const, expectedLevel: 2 as const, requestId: 'station-three' };
    expect(session.sendCommand(second).accepted).toBe(true);
    expect(session.sendCommand(second).duplicate).toBe(true);
    expect(send(session, { type: 'upgrade-workbench', expectedLevel: 2 }).reason).toBe('stale');
    expect(send(session, { type: 'upgrade-workbench', expectedLevel: 3 }).reason).toBe('max-level');
    expect(session.getSnapshot().gameplay.inventory.slots).toHaveLength(5);
    walk(session, -11.4, -3); harvest(session, 'tree-07'); walk(session, -12.6, -3); pickup(session, 'tree-07', 2);
    walk(session, -13.5, 3); harvest(session, 'scrap-06'); walk(session, -15, 4); pickup(session, 'scrap-06');
    walk(session, -8, 2); walk(session, 0, 0); walk(session, 0.6, -3);
    const bag = { type: 'craft-item' as const, recipeId: 'expanded-backpack', requestId: 'bag-eight' };
    expect(session.sendCommand(bag).accepted).toBe(true);
    expect(session.sendCommand(bag)).toMatchObject({ accepted: true, duplicate: true });
    const upgraded = session.getSnapshot().gameplay.inventory;
    expect(upgraded).toMatchObject({ level: 2 });
    expect(upgraded.slots).toHaveLength(8);
    for (const tool of initialTools) expect(upgraded.slots).toContainEqual(tool);
    expect(send(session, { type: 'craft-item', recipeId: 'expanded-backpack' }).reason).toBe('max-level');
    expect(session.getSnapshot().gameplay.inventory).toEqual(upgraded);
    session.pause();
    expect(send(session, { type: 'upgrade-workbench', expectedLevel: 3 }).reason).toBe('paused');
    session.sendCommand({ type: 'reset-player', requestId: 'keep-three' });
    expect(session.getSnapshot().gameplay.workbench.level).toBe(3);
    expect(session.getSnapshot().gameplay.inventory.level).toBe(2);
    session.destroy();
    expect(() => session.getSnapshot()).not.toThrow();
    const fresh = await setup();
    expect(fresh.getSnapshot().gameplay.workbench).toMatchObject({ built: false, level: 0 });
    expect(fresh.getSnapshot().gameplay.inventory).toMatchObject({ level: 1 });
  });

  it('gathers the build cost, rejects an occupied site, builds once, crafts, transports the result and restarts cleanly', async () => {
    const session = await gather();
    expect(session.getSnapshot().gameplay.debugTools).toBe(false);
    const woodSlot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === 'wood');
    const wood = session.getSnapshot().gameplay.inventory.slots[woodSlot]!;
    expect(send(session, { type: 'transfer-item', direction: 'deposit', slot: woodSlot, expectedItemId: wood.id }).accepted).toBe(true);
    expect(send(session, { type: 'build-workbench' }).reason).toBe('insufficient-materials');
    const storedWood = session.getSnapshot().gameplay.storage.inventory.slots.findIndex((stack) => stack?.id === wood.id);
    expect(send(session, { type: 'transfer-item', direction: 'withdraw', slot: storedWood, expectedItemId: wood.id }).accepted).toBe(true);
    walk(session, WORKBENCH_CONFIG.position.x, WORKBENCH_CONFIG.position.z);
    const occupied = session.getSnapshot().gameplay.inventory;
    expect(send(session, { type: 'build-workbench' }).reason).toBe('blocked');
    expect(session.getSnapshot().gameplay.inventory).toEqual(occupied);
    walk(session, 0.6, -2);
    const before = session.getSnapshot();
    const build = { type: 'build-workbench' as const, requestId: 'build-once' };
    expect(session.sendCommand(build).accepted).toBe(true);
    expect(session.sendCommand(build)).toMatchObject({ accepted: true, duplicate: true });
    expect(send(session, { type: 'build-workbench' }).reason).toBe('already-built');
    expect(session.getSnapshot().simulationTime).toBe(before.simulationTime);
    expect(session.getSnapshot().gameplay.workbench).toMatchObject({ level: 1, built: true, inReach: true });
    expect(session.getSnapshot().gameplay.inventory.slots.filter(Boolean).map((stack) => stack?.itemId)).toEqual(['axe', 'pickaxe', 'stone']);
    // Mine a second tree and return by the same free path; no item/debug injection.
    walk(session, 0, 0);
    walk(session, -1.5, 5);
    walk(session, -8.5, 6.5);
    harvest(session, 'tree-04');
    walk(session, -9.6, 7);
    pickup(session, 'tree-04');
    walk(session, -8.5, 5);
    walk(session, -1.5, 5);
    walk(session, -1.5, 0);
    walk(session, 0.6, -2);
    const recipe = { type: 'craft-item' as const, recipeId: 'basic-axe', requestId: 'craft-once' };
    expect(session.sendCommand(recipe).accepted).toBe(true);
    expect(session.sendCommand(recipe)).toMatchObject({ accepted: true, duplicate: true });
    const crafted = session.getSnapshot().gameplay.inventory.slots.find((stack) => stack?.id === 'camp-workbench/crafted/0')!;
    expect(crafted).toMatchObject({ itemId: 'axe', level: 1, amount: 1 });
    const slot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.id === crafted.id);
    expect(send(session, { type: 'drop-item', slot, yaw: Math.PI }).accepted).toBe(true);
    expect(send(session, { type: 'pickup', targetId: crafted.id }).accepted).toBe(true);
    walk(session, -0.5, -2);
    const movedSlot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.id === crafted.id);
    expect(send(session, { type: 'transfer-item', direction: 'deposit', slot: movedSlot, expectedItemId: crafted.id }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.storage.inventory.slots).toContainEqual(crafted);
    session.pause();
    expect(send(session, { type: 'craft-item', recipeId: 'basic-axe' }).reason).toBe('paused');
    session.sendCommand({ type: 'reset-player', requestId: 'reset' });
    expect(session.getSnapshot().gameplay.workbench.built).toBe(true);
    session.destroy();
    expect(() => session.getSnapshot()).not.toThrow();
    const fresh = await setup();
    expect(fresh.getSnapshot().gameplay.workbench).toMatchObject({ built: false, level: 0 });
  });

  it('opens the workbench with E ahead of a simultaneous attack and keeps simulation running in UI', async () => {
    const session = await setup();
    walk(session, 0.6, -3);
    session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, cameraYaw: Math.PI / 2 });
    expect(session.getSnapshot().gameplay.interaction?.kind).toBe('workbench');
    session.pause();
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: vi.fn(), destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    game.camera.look({ mouse: { x: Math.PI / 2 / DEFAULT_CONTROL_SETTINGS.mouseSensitivity, y: 0 }, touch: { x: 0, y: 0 } }, DEFAULT_CONTROL_SETTINGS);
    game.input.setHeld('Interact', 'test', true);
    game.input.setHeld('Primary', 'test', true);
    scheduler.advance(0);
    scheduler.advance(20);
    expect(game.input.enabled).toBe(false);
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    const time = session.getSnapshot().simulationTime;
    for (let frame = 2; frame <= 62; frame++) scheduler.advance(frame * 1000 / 60);
    expect(session.getSnapshot().simulationTime).toBeGreaterThan(time + 0.9);
    game.closeInventory();
    expect(game.input.enabled).toBe(true);
  });

  it('immediately obstructs rays and item drops after construction, then stops walking through the table', async () => {
    const physics = await PhysicsWorld.create();
    resources.push(physics);
    for (let step = 0; step < 180; step++) physics.step(SIMULATION_CONFIG.fixedStep);
    const a = { x: 0.8, y: 0.7, z: -3 }, b = { x: 3.1, y: 0.7, z: -3 };
    expect(physics.hasLineOfSight(a, b)).toBe(true);
    expect(physics.canPlaceWorkbench()).toBe(true);
    physics.addWorkbenchCollider();
    expect(physics.hasLineOfSight(a, b)).toBe(false);
    expect(physics.hasLineOfSight(a, WORKBENCH_CONFIG.position, WORKBENCH_CONFIG.id)).toBe(true);
    expect(physics.canPlaceWorkbench()).toBe(false);
    const fakePlayer = { ...physics.getPlayerSnapshot(), position: { x: 0.8, y: 0.92, z: -3 }, yaw: Math.PI / 2, grounded: true };
    expect(physics.findDropPosition(fakePlayer, Math.PI / 2)).toBeNull();
    for (let step = 0; step < 42; step++) physics.step(SIMULATION_CONFIG.fixedStep, { x: 0, z: -0.07 });
    for (let step = 0; step < 60; step++) physics.step(SIMULATION_CONFIG.fixedStep, { x: 0.07, z: 0 });
    expect(physics.getPlayerSnapshot().position.x).toBeLessThan(1);
  });
});
