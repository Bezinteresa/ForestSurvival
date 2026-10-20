import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_BERRY_BUSHES, TEST_CARROT_PATCHES, type ItemStack } from '@forest-survival/shared';
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
  it('reaches all four wild carrot patches and gathers exactly their finite stock into the ordinary backpack', async () => {
    const session = await setup();
    function walk(x: number, z: number) {
      for (let step = 0; step < 500; step++) {
        const p = session.getSnapshot().player.position, dx = x - p.x, dz = z - p.z;
        if (Math.hypot(dx, dz) < 0.1) return;
        session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: dx, moveY: -dz });
      }
      throw new Error('Unreachable carrot route ' + x + ',' + z);
    }
    const paths = [
      [[-2.7, 1.4], [-3.3, 1]],
      [[-2.7, 1.4], [-2.7, -3.5], [0, -3.5], [0, -6.5], [2, -7]],
      [[4, -8.8], [9, -8.8], [10, -4], [10, 2], [10, 5.5]],
      [[11.5, 9.5], [8, 11.5], [5, 12], [0, 12.5], [-8, 12.5], [-10, 13.5]],
    ] as const;
    for (const [index, patch] of TEST_CARROT_PATCHES.entries()) {
      for (const [x, z] of paths[index]!) walk(x, z);
      const p = session.getSnapshot().player.position;
      const yaw = Math.atan2(patch.position.x - p.x, patch.position.z - p.z);
      session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, cameraYaw: Math.PI - yaw });
      expect(session.getSnapshot().gameplay.interaction).toMatchObject({ id: patch.id, kind: 'carrot' });
      for (let item = 0; item < patch.stock; item++) expect(session.sendCommand({ type: 'interact', requestId: patch.id + '-' + item }).accepted).toBe(true);
      expect(session.sendCommand({ type: 'gather', targetId: patch.id, requestId: patch.id + '-depleted' }).reason).toBe('missing');
    }
    const snapshot = session.getSnapshot();
    expect(snapshot.gameplay.carrots.map((patch) => patch.remaining)).toEqual([0, 0, 0, 0]);
    expect(snapshot.gameplay.inventory.slots.reduce((sum, item) => sum + (item?.itemId === 'carrot' ? item.amount : 0), 0)).toBe(12);
    expect(snapshot.gameplay.inventory.slots).toHaveLength(5);
    expect(snapshot.vitals.dead).toBe(false);
  });
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
