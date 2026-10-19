import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_CONFIG, NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_WORLD } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
function advance(session: LocalSession, count: number) { for (let index = 0; index < count; index++) session.step(SIMULATION_CONFIG.fixedStep); }
async function setup() { const session = await LocalSession.create(); resources.push(session); session.start(); advance(session, 180); return session; }
function walkTo(session: LocalSession, x: number, z: number) {
  for (let step = 0; step < 300; step++) {
    const position = session.getSnapshot().player.position;
    const dx = x - position.x, dz = z - position.z;
    if (Math.hypot(dx, dz) < 0.1) return;
    session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: dx, moveY: -dz });
  }
  throw new Error('Cannot reach test destination');
}
async function collectWood() {
  const session = await setup();
  walkTo(session, -2.4, 2);
  const tree = TEST_WORLD.trees[0]!;
  for (let hit = 0; hit < 4; hit++) {
    const player = session.getSnapshot().player.position;
    const yaw = Math.atan2(tree.position.x - player.x, tree.position.z - player.z);
    expect(session.sendCommand({ type: 'use-item', yaw, requestId: 'chop-' + hit }).accepted).toBe(true);
    advance(session, 42);
  }
  walkTo(session, -3.6, 3);
  for (const item of session.getSnapshot().gameplay.loot) expect(session.sendCommand({ type: 'pickup', targetId: item.id, requestId: 'pickup-' + item.id }).accepted).toBe(true);
  walkTo(session, -1.5, CAMPFIRE_CONFIG.position.z);
  return session;
}

describe('campfire with local session and real physics', () => {
  it('harvests wood, fuels by interaction once, extinguishes and relights without granting health', async () => {
    const session = await collectWood();
    const slot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === 'wood');
    session.sendCommand({ type: 'select-slot', slot, requestId: 'wood-in-hand' });
    session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, cameraYaw: Math.PI / 2 });
    expect(session.getSnapshot().gameplay.interaction?.kind).toBe('campfire');
    const before = session.getSnapshot();
    const command = { type: 'interact' as const, requestId: 'fuel-interact' };
    expect(session.sendCommand(command).accepted).toBe(true);
    expect(session.sendCommand(command).duplicate).toBe(true);
    const fuelled = session.getSnapshot();
    expect(fuelled.gameplay.campfire.fuelSeconds).toBeCloseTo(before.gameplay.campfire.fuelSeconds + 30);
    expect(fuelled.gameplay.inventory.slots[slot]?.amount).toBe(2);
    expect(fuelled.vitals).toEqual(before.vitals);
    advance(session, 90 * 60);
    expect(session.getSnapshot().gameplay.campfire).toMatchObject({ lit: false, safeRadius: 0, playerInside: false });
    const id = session.getSnapshot().gameplay.inventory.slots[slot]!.id;
    expect(session.sendCommand({ type: 'fuel-fire', slot, expectedItemId: id, requestId: 'relight' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.campfire).toMatchObject({ lit: true, fuelSeconds: 30, safeRadius: 5, playerInside: true });
    expect(session.getSnapshot().gameplay.inventory.slots[slot]?.amount).toBe(1);
    advance(session, Math.ceil((400 - session.getSnapshot().simulationTime) / SIMULATION_CONFIG.fixedStep));
    expect(session.sendCommand({ type: 'fuel-fire', slot, expectedItemId: id, requestId: 'last-wood' }).accepted).toBe(true);
    advance(session, 60);
    expect(session.getSnapshot().gameplay.campfire.playerInside).toBe(true);
    expect(session.getSnapshot().vitals.health).toBeLessThan(100);
    advance(session, 20 * 60);
    const ended = session.getSnapshot();
    expect(ended.status).toBe('ended');
    expect(ended.gameplay.campfire.fuelSeconds).toBeGreaterThan(0);
    expect(session.sendCommand({ type: 'fuel-fire', slot, expectedItemId: id, requestId: 'dead-fuel' }).reason).toBe('dead');
    session.start();
    advance(session, 60);
    expect(session.getSnapshot()).toEqual(ended);
  });

  it('keeps fuel burning in inventory, freezes it on pause and leaves snapshots readable after destroy', async () => {
    const session = await collectWood();
    session.pause();
    const before = session.getSnapshot();
    advance(session, 1000);
    expect(session.getSnapshot()).toEqual(before);
    const wood = before.gameplay.inventory.slots[1]!;
    expect(session.sendCommand({ type: 'fuel-fire', slot: 1, expectedItemId: wood.id, requestId: 'paused-fuel' }).reason).toBe('paused');
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: vi.fn(), destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    game.toggleInventory();
    scheduler.advance(0);
    for (let frame = 1; frame <= 60; frame++) scheduler.advance(frame * 1000 / 60);
    expect(game.input.enabled).toBe(false);
    expect(session.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(before.gameplay.campfire.fuelSeconds - 1);
    const command = { type: 'fuel-fire' as const, slot: 1, expectedItemId: wood.id, requestId: 'ui-fuel' };
    expect(game.sendCommand(command).accepted).toBe(true);
    expect(game.sendCommand(command).duplicate).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots[1]?.amount).toBe(2);
    game.pause();
    const paused = session.getSnapshot();
    scheduler.advance(5000);
    advance(session, 60);
    expect(session.getSnapshot()).toEqual(paused);
    game.destroy();
    expect(() => session.getSnapshot()).not.toThrow();
    const fresh = await setup();
    expect(fresh.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(57);
    expect(fresh.getSnapshot().gameplay.inventory.slots.filter(Boolean)).toHaveLength(1);
  });

  it('blocks walking through the base and dropping a stack inside it', async () => {
    const session = await setup();
    for (let step = 0; step < 120; step++) session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveY: -1 });
    const position = session.getSnapshot().player.position;
    expect(position.z).toBeLessThan(CAMPFIRE_CONFIG.position.z - CAMPFIRE_CONFIG.radius);
    expect(session.getSnapshot().player.grounded).toBe(true);
    expect(session.sendCommand({ type: 'drop-item', slot: 0, yaw: 0, requestId: 'into-fire' }).reason).toBe('blocked');
    expect(session.getSnapshot().gameplay.inventory.slots[0]?.itemId).toBe('axe');
  });
});
