import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_CONFIG, NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_MATERIAL_NODES, TEST_WORLD } from '@forest-survival/shared';
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
async function collectWood(withPickaxe = false) {
  const session = await setup();
  if (withPickaxe) expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: 0, expectedItemId: 'starter-pickaxe', requestId: 'take-pickaxe' }).accepted).toBe(true);
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
  it('buys a level using normally gathered materials, excludes storage and rejects repeated or stale purchases', async () => {
    const session = await collectWood(true);
    const pickaxe = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === 'pickaxe');
    session.sendCommand({ type: 'select-slot', slot: pickaxe, requestId: 'pickaxe-in-hand' });
    const rock = TEST_MATERIAL_NODES[0]!;
    walkTo(session, -1.5, 5);
    walkTo(session, 1.2, 5);
    for (let hit = 0; hit < 3; hit++) {
      const player = session.getSnapshot().player.position;
      expect(session.sendCommand({ type: 'use-item', yaw: Math.atan2(rock.position.x - player.x, rock.position.z - player.z), requestId: 'mine-' + hit }).accepted).toBe(true);
      advance(session, 42);
    }
    walkTo(session, rock.position.x, rock.position.z);
    for (const item of session.getSnapshot().gameplay.loot) expect(session.sendCommand({ type: 'pickup', targetId: item.id, requestId: 'pickup-' + item.id }).accepted).toBe(true);
    walkTo(session, 1.2, 5);
    walkTo(session, -1.5, 5);
    walkTo(session, -1.5, -1);
    const stoneSlot = session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === 'stone');
    const stone = session.getSnapshot().gameplay.inventory.slots[stoneSlot]!;
    expect(session.sendCommand({ type: 'transfer-item', direction: 'deposit', slot: stoneSlot, expectedItemId: stone.id, requestId: 'store-stone' }).accepted).toBe(true);
    walkTo(session, -1.5, 2.8);
    const stored = session.getSnapshot();
    expect(session.sendCommand({ type: 'upgrade-fire', expectedLevel: 1, requestId: 'no-stone-in-bag' }).reason).toBe('insufficient-materials');
    expect(session.getSnapshot().gameplay.inventory).toEqual(stored.gameplay.inventory);
    expect(session.getSnapshot().gameplay.storage).toEqual(stored.gameplay.storage);
    walkTo(session, -1.5, -1);
    const storedSlot = session.getSnapshot().gameplay.storage.inventory.slots.findIndex((stack) => stack?.id === stone.id);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: storedSlot, expectedItemId: stone.id, requestId: 'withdraw-stone' }).accepted).toBe(true);
    walkTo(session, -1.5, 2.8);
    const before = session.getSnapshot();
    expect(before.gameplay.debugTools).toBe(false);
    expect(before.gameplay.campfire.lit).toBe(true);
    const command = { type: 'upgrade-fire' as const, expectedLevel: 1 as const, requestId: 'buy-level' };
    expect(session.sendCommand(command).accepted).toBe(true);
    expect(session.sendCommand(command).duplicate).toBe(true);
    const upgraded = session.getSnapshot();
    expect(upgraded.gameplay.campfire).toMatchObject({ level: 2, safeRadius: 7, fuelSeconds: before.gameplay.campfire.fuelSeconds });
    expect(upgraded.gameplay.inventory.slots.filter(Boolean)).toEqual(before.gameplay.inventory.slots.filter((stack) => stack?.itemId === 'axe' || stack?.itemId === 'pickaxe'));
    expect(upgraded.vitals).toEqual(before.vitals);
    expect(session.sendCommand({ ...command, requestId: 'stale-buy' }).reason).toBe('stale');
    expect(session.getSnapshot().gameplay.inventory).toEqual(upgraded.gameplay.inventory);
    expect(session.sendCommand({ type: 'upgrade-fire', expectedLevel: 2, requestId: 'no-price' }).reason).toBe('insufficient-materials');
    walkTo(session, -6, 2.8);
    expect(session.getSnapshot().gameplay.campfire.playerInside).toBe(true);
    expect(session.sendCommand({ type: 'upgrade-fire', expectedLevel: 2, requestId: 'far-buy' }).reason).toBe('out-of-range');
    session.pause();
    const fuel = session.getSnapshot().gameplay.campfire.fuelSeconds;
    expect(session.sendCommand({ type: 'upgrade-fire', expectedLevel: 2, requestId: 'paused-buy' }).reason).toBe('paused');
    session.sendCommand({ type: 'reset-player', requestId: 'reset-position' });
    expect(session.getSnapshot().gameplay.campfire).toMatchObject({ level: 2, fuelSeconds: fuel, zoneRadius: 7 });
    const fresh = await setup();
    expect(fresh.getSnapshot().gameplay.campfire).toMatchObject({ level: 1, zoneRadius: 5 });
    expect(fresh.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(57);
  });

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
    expect(session.sendCommand({ type: 'upgrade-fire', expectedLevel: 1, requestId: 'dead-upgrade' }).reason).toBe('dead');
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
