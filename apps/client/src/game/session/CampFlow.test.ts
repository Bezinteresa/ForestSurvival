import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMP_STORAGE, NEUTRAL_PLAYER_INPUT, PLAYER_CONFIG, SIMULATION_CONFIG, TEST_MATERIAL_NODES, type ItemStack, type PlayerControlFrame } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { DEFAULT_CONTROL_SETTINGS } from '../input/ControlSettings';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
function advance(session: LocalSession, frames: number, input: PlayerControlFrame = NEUTRAL_PLAYER_INPUT) { for (let index = 0; index < frames; index++) session.step(SIMULATION_CONFIG.fixedStep, input); }
async function setup(debugTools = false) {
  const session = await LocalSession.create({ debugTools });
  resources.push(session);
  session.start();
  advance(session, 180);
  return session;
}
function carried(session: LocalSession): ItemStack[] { return session.getSnapshot().gameplay.inventory.slots.filter((entry): entry is ItemStack => entry !== null); }

describe('camp and materials with real Rapier', () => {
  it('takes a pickaxe, mines stone, collects it and deposits it into camp once', async () => {
    const session = await setup();
    expect(session.getSnapshot().gameplay.storage.inReach).toBe(true);
    const take = { type: 'transfer-item' as const, direction: 'withdraw' as const, slot: 0, expectedItemId: 'starter-pickaxe', requestId: 'take' };
    expect(session.sendCommand(take).accepted).toBe(true);
    expect(session.sendCommand(take).duplicate).toBe(true);
    expect(carried(session).filter((stack) => stack.itemId === 'pickaxe')).toHaveLength(1);
    const node = TEST_MATERIAL_NODES[0]!;
    const distance = Math.hypot(node.position.x, node.position.z);
    advance(session, 50, { ...NEUTRAL_PLAYER_INPUT, moveX: node.position.x / distance, moveY: -node.position.z / distance });
    const position = session.getSnapshot().player.position;
    expect(Math.hypot(position.x - node.position.x, position.z - node.position.z)).toBeGreaterThan(0.9);
    const yaw = Math.atan2(node.position.x - position.x, node.position.z - position.z);
    session.sendCommand({ type: 'select-slot', slot: 1, requestId: 'pick-slot' });
    for (let index = 0; index < 3; index++) {
      expect(session.sendCommand({ type: 'use-item', yaw, requestId: 'mine-' + index }).accepted).toBe(true);
      advance(session, 42);
    }
    expect(session.getSnapshot().gameplay.resources.find((entry) => entry.id === node.id)?.exhausted).toBe(true);
    expect(session.getSnapshot().gameplay.loot).toHaveLength(3);
    advance(session, 16, { ...NEUTRAL_PLAYER_INPUT, moveX: Math.sin(yaw), moveY: -Math.cos(yaw) });
    const after = session.getSnapshot().player.position;
    expect(Math.hypot(after.x - node.position.x, after.z - node.position.z)).toBeLessThan(0.4);
    for (const item of session.getSnapshot().gameplay.loot) expect(session.sendCommand({ type: 'pickup', targetId: item.id, requestId: 'collect-' + item.id }).accepted).toBe(true);
    const returnDistance = Math.hypot(after.x, after.z);
    advance(session, Math.ceil(returnDistance / (PLAYER_CONFIG.walkSpeed * SIMULATION_CONFIG.fixedStep)), { ...NEUTRAL_PLAYER_INPUT, moveX: -after.x / returnDistance, moveY: after.z / returnDistance });
    expect(session.getSnapshot().gameplay.storage.inReach).toBe(true);
    const slot = session.getSnapshot().gameplay.inventory.slots.findIndex((entry) => entry?.itemId === 'stone');
    const stone = session.getSnapshot().gameplay.inventory.slots[slot]!;
    const deposit = { type: 'transfer-item' as const, direction: 'deposit' as const, slot, expectedItemId: stone.id, requestId: 'deposit' };
    expect(session.sendCommand(deposit).accepted).toBe(true);
    expect(session.sendCommand(deposit).duplicate).toBe(true);
    expect(carried(session).filter((entry) => entry.itemId === 'stone')).toHaveLength(0);
    expect(session.getSnapshot().gameplay.storage.inventory.slots.filter((entry) => entry?.itemId === 'stone').reduce((sum, entry) => sum + (entry?.amount ?? 0), 0)).toBe(3);
    const restarted = await setup();
    expect(restarted.getSnapshot().gameplay.storage.inventory.slots[0]?.id).toBe('starter-pickaxe');
    expect(restarted.getSnapshot().gameplay.resources.every((entry) => !entry.exhausted)).toBe(true);
  });

  it('rejects transfers during an attack, from far away and from stale slots', async () => {
    const session = await setup();
    const request = { type: 'transfer-item' as const, direction: 'withdraw' as const, slot: 0, expectedItemId: 'starter-pickaxe', requestId: 'busy' };
    session.sendCommand({ type: 'use-item', yaw: 0, requestId: 'attack' });
    expect(session.sendCommand(request).reason).toBe('busy');
    advance(session, 42);
    expect(session.sendCommand({ ...request, expectedItemId: 'stale', requestId: 'stale' }).reason).toBe('stale');
    advance(session, 60, { ...NEUTRAL_PLAYER_INPUT, moveX: 1 });
    const before = session.getSnapshot().gameplay;
    expect(session.sendCommand({ ...request, requestId: 'far' }).reason).toBe('out-of-range');
    expect(session.getSnapshot().gameplay.inventory).toEqual(before.inventory);
    expect(session.getSnapshot().gameplay.storage.inventory).toEqual(before.storage.inventory);
  });

  it('refuses upgrades by default and preserves an enabled test upgrade through storage', async () => {
    const normal = await setup();
    const upgrade = { type: 'debug-upgrade' as const, target: 'tool' as const, slot: 0, level: 2 as const, requestId: 'upgrade' };
    expect(normal.sendCommand(upgrade).reason).toBe('forbidden');
    expect(normal.getSnapshot().gameplay.debugTools).toBe(false);
    const session = await setup(true);
    expect(session.sendCommand(upgrade).accepted).toBe(true);
    expect(session.sendCommand(upgrade).duplicate).toBe(true);
    session.sendCommand({ type: 'debug-upgrade', target: 'backpack', slot: 0, level: 2, requestId: 'bag' });
    expect(session.getSnapshot().gameplay.inventory.slots).toHaveLength(8);
    expect(session.getSnapshot().gameplay.inventory.level).toBe(2);
    const axe = session.getSnapshot().gameplay.inventory.slots[0]!;
    session.sendCommand({ type: 'transfer-item', direction: 'deposit', slot: 0, expectedItemId: axe.id, requestId: 'deposit-upgraded' });
    const stored = session.getSnapshot().gameplay.storage.inventory.slots.findIndex((entry) => entry?.id === axe.id);
    expect(stored).toBeGreaterThanOrEqual(0);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: stored, expectedItemId: axe.id, requestId: 'return-upgraded' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots[0]).toEqual({ ...axe, level: 2 });
    const beforeDestroy = session.getSnapshot().gameplay;
    session.destroy();
    expect(session.getSnapshot().status).toBe('stopped');
    expect(session.getSnapshot().gameplay).toEqual(beforeDestroy);
  });

  it('opens the camp interface with Interact before applying a simultaneous attack', async () => {
    const session = await setup();
    session.pause();
    const scheduler = new FakeScheduler();
    const changed = vi.fn();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler, undefined, undefined, changed);
    resources.push(game);
    game.start();
    const yaw = Math.atan2(CAMP_STORAGE.position.x, -CAMP_STORAGE.position.z);
    game.camera.look({ mouse: { x: yaw / DEFAULT_CONTROL_SETTINGS.mouseSensitivity, y: 0 }, touch: { x: 0, y: 0 } }, DEFAULT_CONTROL_SETTINGS);
    scheduler.advance(0);
    scheduler.advance(20);
    expect(session.getSnapshot().gameplay.interaction?.kind).toBe('storage');
    game.input.setHeld('Interact', 'test', true);
    game.input.setHeld('Primary', 'test', true);
    scheduler.advance(40);
    expect(changed).toHaveBeenLastCalledWith(true);
    expect(game.input.enabled).toBe(false);
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    const unchanged = session.getSnapshot().gameplay.storage.inventory;
    game.closeInventory();
    expect(session.getSnapshot().gameplay.storage.inventory).toEqual(unchanged);
  });
});
