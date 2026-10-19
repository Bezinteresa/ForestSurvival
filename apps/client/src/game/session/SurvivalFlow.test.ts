import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIMULATION_CONFIG, TEST_BERRY_BUSHES, type ItemStack } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
const bush = TEST_BERRY_BUSHES[0]!;
function advance(session: LocalSession, frames: number) { for (let index = 0; index < frames; index++) session.step(SIMULATION_CONFIG.fixedStep); }
async function setup() { const session = await LocalSession.create(); resources.push(session); session.start(); advance(session, 180); return session; }
function berryStack(session: LocalSession): ItemStack { return session.getSnapshot().gameplay.inventory.slots.find((entry) => entry?.itemId === 'berries')!; }

describe('survival loop with real local session', () => {
  it('gathers and eats once per request, refuses wasting food and applies LMB to selected food', async () => {
    const session = await setup();
    const gather = { type: 'gather' as const, targetId: bush.id, requestId: 'gather' };
    expect(session.sendCommand(gather).accepted).toBe(true);
    expect(session.sendCommand(gather).duplicate).toBe(true);
    session.sendCommand({ ...gather, requestId: 'second-berry' });
    expect(berryStack(session).amount).toBe(2);
    expect(session.getSnapshot().gameplay.bushes[0]?.remaining).toBe(1);
    const stack = berryStack(session);
    const eat = { type: 'consume-item' as const, slot: 1, expectedItemId: stack.id, requestId: 'eat' };
    expect(session.sendCommand(eat).accepted).toBe(true);
    expect(session.sendCommand(eat).duplicate).toBe(true);
    expect(berryStack(session).amount).toBe(1);
    expect(session.getSnapshot().vitals.hunger).toBe(100);
    expect(session.sendCommand({ ...eat, requestId: 'full' }).reason).toBe('satiated');
    expect(berryStack(session).amount).toBe(1);
    advance(session, 60);
    session.sendCommand({ type: 'select-slot', slot: 1, requestId: 'food-slot' });
    const yaw = session.getSnapshot().player.yaw;
    expect(session.sendCommand({ type: 'use-item', yaw: 0, requestId: 'primary' }).accepted).toBe(true);
    expect(session.getSnapshot().player.yaw).toBe(yaw);
    expect(session.getSnapshot().gameplay.inventory.slots[1]).toBeNull();
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    expect(session.getSnapshot().vitals.hunger).toBe(100);
  });

  it('preserves food through drop, pickup and storage before consuming one unit', async () => {
    const session = await setup();
    for (let index = 0; index < 3; index++) expect(session.sendCommand({ type: 'gather', targetId: bush.id, requestId: 'g-' + index }).accepted).toBe(true);
    const food = berryStack(session);
    expect(session.sendCommand({ type: 'drop-item', slot: 1, yaw: 0, requestId: 'drop' }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.loot[0]?.amount).toBe(3);
    expect(session.sendCommand({ type: 'pickup', targetId: food.id, requestId: 'pickup' }).accepted).toBe(true);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'deposit', slot: 1, expectedItemId: food.id, requestId: 'store' }).accepted).toBe(true);
    const stored = session.getSnapshot().gameplay.storage.inventory.slots.findIndex((entry) => entry?.id === food.id);
    expect(session.sendCommand({ type: 'transfer-item', direction: 'withdraw', slot: stored, expectedItemId: food.id, requestId: 'withdraw' }).accepted).toBe(true);
    expect(berryStack(session)).toEqual(food);
    session.sendCommand({ type: 'consume-item', slot: 1, expectedItemId: food.id, requestId: 'eat' });
    expect(berryStack(session).amount).toBe(2);
    expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
    expect(session.getSnapshot().gameplay.bushes[0]?.remaining).toBe(0);
  });

  it('freezes survival during pause and rejects paused eating without consuming stock', async () => {
    const session = await setup();
    session.sendCommand({ type: 'gather', targetId: bush.id, requestId: 'gather' });
    const food = berryStack(session);
    session.pause();
    const before = session.getSnapshot();
    advance(session, 1000);
    expect(session.getSnapshot()).toEqual(before);
    expect(session.sendCommand({ type: 'consume-item', slot: 1, expectedItemId: food.id, requestId: 'paused-eat' }).reason).toBe('paused');
    expect(berryStack(session).amount).toBe(1);
    session.start();
    advance(session, 60);
    expect(session.getSnapshot().vitals.hunger).toBeLessThan(before.vitals.hunger);
  });

  it('ends once, closes inventory, cancels a windup, stops input and starts a fresh run', async () => {
    const session = await setup();
    // The unheated first night costs 50 HP; starvation then finishes the run at 410 s.
    advance(session, Math.round(409.9 / SIMULATION_CONFIG.fixedStep) - 180);
    expect(session.getSnapshot().vitals.health).toBeCloseTo(0.5, 3);
    session.sendCommand({ type: 'use-item', yaw: 0, requestId: 'last-swing' });
    session.pause();
    const ended = vi.fn();
    session.subscribe((snapshot) => { if (snapshot.status === 'ended') ended(); });
    const scheduler = new FakeScheduler();
    const inventoryChanged = vi.fn();
    const game = new Game(session, { render: vi.fn(), destroy: () => {} }, scheduler, undefined, undefined, inventoryChanged);
    resources.push(game);
    game.start();
    game.toggleInventory();
    const before = session.getSnapshot().simulationTime;
    scheduler.advance(0);
    for (let frame = 1; frame <= 20; frame++) scheduler.advance(frame * 1000 / 60);
    const finished = session.getSnapshot();
    expect(finished.status).toBe('ended');
    expect(finished.vitals).toMatchObject({ health: 0, hunger: 0, dead: true, deathReason: 'starvation' });
    expect(finished.simulationTime).toBeGreaterThan(before);
    expect(finished.gameplay.attack.phase).toBe('idle');
    expect(finished.gameplay.interaction).toBeNull();
    expect(inventoryChanged).toHaveBeenLastCalledWith(false);
    expect(game.input.enabled).toBe(false);
    expect(scheduler.pending.size).toBe(0);
    expect(ended).toHaveBeenCalledTimes(1);
    for (const command of [{ type: 'reset-player' as const, requestId: 'no-reset' }, { type: 'gather' as const, targetId: bush.id, requestId: 'no-gather' }]) expect(session.sendCommand(command).reason).toBe('dead');
    game.start();
    session.start();
    session.pause();
    advance(session, 120);
    expect(session.getSnapshot()).toEqual(finished);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(scheduler.pending.size).toBe(0);
    const restarted = await setup();
    expect(restarted.getSnapshot().vitals).toMatchObject({ health: 100, dead: false, deathAt: null });
    expect(restarted.getSnapshot().gameplay.bushes[0]?.remaining).toBe(3);
    expect(restarted.getSnapshot().gameplay.inventory.slots.filter(Boolean)).toHaveLength(1);
  });
});
