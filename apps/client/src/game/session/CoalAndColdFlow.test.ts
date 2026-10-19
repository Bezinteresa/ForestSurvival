import { afterEach, describe, expect, it } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_MATERIAL_NODES } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
const dt = SIMULATION_CONFIG.fixedStep;
function advance(session: LocalSession, frames: number) { for (let frame = 0; frame < frames; frame++) session.step(dt); }
function advanceTo(session: LocalSession, time: number) {
  while (time - session.getSnapshot().simulationTime > 1e-8) {
    if (session.getSnapshot().status !== 'running') throw new Error('Run ended before the target time');
    session.step(Math.min(dt, time - session.getSnapshot().simulationTime));
  }
}
async function setup() {
  const session = await LocalSession.create();
  resources.push(session);
  session.start();
  advance(session, 180);
  return session;
}
function walkTo(session: LocalSession, x: number, z: number) {
  for (let step = 0; step < 350; step++) {
    const position = session.getSnapshot().player.position;
    const dx = x - position.x, dz = z - position.z;
    if (Math.hypot(dx, dz) < 0.1) return;
    session.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveX: dx, moveY: -dz });
  }
  throw new Error('Cannot reach test destination');
}
async function collectCoal() {
  const session = await setup();
  expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: 0, expectedItemId: 'starter-pickaxe', requestId: 'take-pickaxe' }).accepted).toBe(true);
  walkTo(session, 0, -7);
  walkTo(session, 3.3, -7);
  const coal = TEST_MATERIAL_NODES.find((node) => node.id === 'coal-01')!;
  const hit = (requestId: string) => {
    const player = session.getSnapshot().player.position;
    expect(session.sendCommand({ type: 'use-item', yaw: Math.atan2(coal.position.x - player.x, coal.position.z - player.z), requestId }).accepted).toBe(true);
    advance(session, 42);
  };
  hit('axe-on-coal');
  expect(session.getSnapshot().gameplay.resources.find((node) => node.id === coal.id)?.health).toBe(90);
  expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
  session.sendCommand({ type: 'select-slot', slot: 1, requestId: 'pickaxe-in-hand' });
  for (let hitIndex = 0; hitIndex < 3; hitIndex++) hit('mine-coal-' + hitIndex);
  expect(session.getSnapshot().gameplay.resources.find((node) => node.id === coal.id)?.exhausted).toBe(true);
  walkTo(session, coal.position.x, coal.position.z);
  for (const item of session.getSnapshot().gameplay.loot) {
    expect(item.itemId).toBe('coal');
    expect(session.sendCommand({ type: 'pickup', targetId: item.id, requestId: 'pickup-' + item.id }).accepted).toBe(true);
  }
  expect(session.getSnapshot().gameplay.inventory.slots[2]).toMatchObject({ itemId: 'coal', amount: 3 });
  return session;
}
function returnToCamp(session: LocalSession) {
  walkTo(session, 0, -7);
  walkTo(session, 0, -0.5);
  walkTo(session, 1.4, -0.5);
  walkTo(session, 1.4, 2.8);
}

describe('coal and night cold with real local physics', () => {
  it('mines, drops, stores and fuels normally gathered coal once per request, keeping the first night warm', async () => {
    const session = await collectCoal();
    const coal = session.getSnapshot().gameplay.inventory.slots[2]!;
    expect(session.sendCommand({ type: 'drop-item', slot: 2, yaw: Math.PI, requestId: 'drop-coal' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.loot[0]).toMatchObject({ id: coal.id, amount: 3, itemId: 'coal' });
    expect(session.sendCommand({ type: 'pickup', targetId: coal.id, requestId: 'recover-coal' }).accepted).toBe(true);
    walkTo(session, 0, -7);
    walkTo(session, 0, -0.5);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'deposit', slot: 2, expectedItemId: coal.id, requestId: 'store-coal' }).accepted).toBe(true);
    const storedSlot = session.getSnapshot().gameplay.storage.inventory.slots.findIndex((stack) => stack?.id === coal.id);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: storedSlot, expectedItemId: coal.id, requestId: 'withdraw-coal' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots[2]).toEqual(coal);
    walkTo(session, 1.4, -0.5);
    walkTo(session, 1.4, 2.8);
    session.sendCommand({ type: 'select-slot', slot: 2, requestId: 'coal-in-hand' });
    session.step(dt, { ...NEUTRAL_PLAYER_INPUT, cameraYaw: -Math.PI / 2 });
    expect(session.getSnapshot().gameplay.interaction?.kind).toBe('campfire');
    const before = session.getSnapshot();
    const interact = { type: 'interact' as const, requestId: 'coal-interact' };
    expect(session.sendCommand(interact).accepted).toBe(true);
    expect(session.sendCommand(interact).duplicate).toBe(true);
    expect(session.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(before.gameplay.campfire.fuelSeconds + 60, 6);
    expect(session.getSnapshot().gameplay.inventory.slots[2]?.amount).toBe(2);
    expect(session.getSnapshot().vitals).toEqual(before.vitals);
    const fuel = { type: 'fuel-fire' as const, slot: 2, expectedItemId: coal.id, requestId: 'second-coal' };
    expect(session.sendCommand(fuel).accepted).toBe(true);
    const full = session.getSnapshot();
    expect(session.sendCommand({ ...fuel, requestId: 'coal-does-not-fit' }).reason).toBe('fire-full');
    expect(session.getSnapshot().gameplay.inventory).toEqual(full.gameplay.inventory);
    expect(session.getSnapshot().gameplay.campfire.fuelSeconds).toBe(full.gameplay.campfire.fuelSeconds);
    advanceTo(session, 179.5);
    expect(session.sendCommand({ ...fuel, requestId: 'last-coal' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots[2]).toBeNull();
    advanceTo(session, 241);
    expect(session.getSnapshot()).toMatchObject({ status: 'running', vitals: { health: 100, cold: { exposed: false, exposureSeconds: 0 } }, gameplay: { campfire: { fuelSeconds: 0, lit: false } }, clock: { physicalCycles: 1, phase: 'day' } });
  });

  it('splits dusk, the grace deadline and dawn exactly and resets exposure for a fresh run', async () => {
    const session = await setup();
    advanceTo(session, 179.99);
    session.step(0.02);
    expect(session.getSnapshot().vitals.health).toBe(100);
    expect(session.getSnapshot().vitals.cold.exposureSeconds).toBeCloseTo(0.01, 6);
    advanceTo(session, 189.99);
    session.step(0.02);
    expect(session.getSnapshot().vitals.health).toBeCloseTo(99.99, 6);
    advanceTo(session, 239.99);
    session.step(0.02);
    expect(session.getSnapshot().clock.phase).toBe('day');
    expect(session.getSnapshot().vitals.health).toBeCloseTo(50, 6);
    expect(session.getSnapshot().vitals.cold).toMatchObject({ exposed: false, exposureSeconds: 0, freezing: false });
    advance(session, 60);
    expect(session.getSnapshot().vitals.health).toBeCloseTo(50, 6);
    const fresh = await setup();
    expect(fresh.getSnapshot().vitals).toMatchObject({ health: 100, cold: { exposed: false, exposureSeconds: 0 } });
    expect(fresh.getSnapshot().gameplay.resources.find((node) => node.id === 'coal-01')).toMatchObject({ health: 90, exhausted: false });
  });

  it('ends once from cold with food still available and rejects all attempts to resume the dead run', async () => {
    const session = await setup();
    expect(session.sendCommand({ type: 'gather', targetId: 'berries-01', requestId: 'save-berry' }).accepted).toBe(true);
    const food = session.getSnapshot().gameplay.inventory.slots[1]!;
    advanceTo(session, 399);
    expect(session.sendCommand({ type: 'consume-item', slot: 1, expectedItemId: food.id, requestId: 'eat-before-starving' }).accepted).toBe(true);
    advanceTo(session, 479.99);
    let endings = 0;
    session.subscribe((snapshot) => { if (snapshot.status === 'ended') endings++; });
    session.step(0.02);
    const ended = session.getSnapshot();
    expect(ended.status).toBe('ended');
    expect(ended.vitals.deathReason).toBe('cold');
    expect(ended.vitals.deathAt).toBeCloseTo(480, 5);
    expect(ended.vitals.hunger).toBeGreaterThan(0);
    expect(ended.gameplay.attack.phase).toBe('idle');
    expect(endings).toBe(1);
    expect(session.sendCommand({ type: 'reset-player', requestId: 'reset-after-cold-death' }).reason).toBe('dead');
    session.start();
    advance(session, 60);
    expect(session.getSnapshot()).toEqual(ended);
    expect(endings).toBe(1);
  });

  it('splits fuel exhaustion, freezes exposure in pause, keeps cold in inventory and stops it on refuelling or returning', async () => {
    const session = await collectCoal();
    returnToCamp(session);
    const coal = session.getSnapshot().gameplay.inventory.slots[2]!;
    const fuel = { type: 'fuel-fire' as const, slot: 2, expectedItemId: coal.id, requestId: 'late-day-coal' };
    advanceTo(session, 130.005);
    expect(session.sendCommand(fuel).accepted).toBe(true);
    advanceTo(session, 189.995);
    expect(session.getSnapshot().vitals.health).toBe(100);
    expect(session.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(0.01, 6);
    session.step(0.02);
    expect(session.getSnapshot().vitals.cold.exposureSeconds).toBeCloseTo(0.01, 6);
    session.pause();
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    game.pause();
    const paused = session.getSnapshot();
    advance(session, 60);
    scheduler.advance(1000);
    expect(session.getSnapshot()).toEqual(paused);
    game.start();
    game.toggleInventory();
    scheduler.advance(1000);
    for (let frame = 1; frame <= 660; frame++) scheduler.advance(1000 + frame * 1000 / 60);
    const freezing = session.getSnapshot();
    expect(freezing.vitals.health).toBeCloseTo(98.99, 5);
    expect(freezing.vitals.cold.freezing).toBe(true);
    expect(game.input.enabled).toBe(false);
    const relight = { ...fuel, requestId: 'inventory-relight' };
    expect(game.sendCommand(relight).accepted).toBe(true);
    expect(game.sendCommand(relight).duplicate).toBe(true);
    expect(session.getSnapshot().vitals).toMatchObject({ health: freezing.vitals.health, cold: { exposureSeconds: 0, exposed: false, freezing: false } });
    expect(session.getSnapshot().gameplay.inventory.slots[2]?.amount).toBe(1);
    game.pause();
    session.start();
    walkTo(session, 1.4, 8);
    expect(session.getSnapshot().gameplay.campfire.lit).toBe(true);
    expect(session.getSnapshot().gameplay.campfire.playerInside).toBe(false);
    expect(session.getSnapshot().vitals.cold.exposed).toBe(true);
    advance(session, 12 * 60);
    expect(session.getSnapshot().vitals.health).toBeLessThan(freezing.vitals.health);
    walkTo(session, 1.4, 2.8);
    const returned = session.getSnapshot();
    expect(returned.vitals.cold).toMatchObject({ exposed: false, exposureSeconds: 0 });
    expect(returned.vitals.health).toBeLessThan(freezing.vitals.health);
    advance(session, 60);
    expect(session.getSnapshot().vitals.health).toBe(returned.vitals.health);
  });
});
