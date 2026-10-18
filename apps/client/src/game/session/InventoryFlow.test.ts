import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
function advance(session: LocalSession, count: number) { for (let i = 0; i < count; i++) session.step(SIMULATION_CONFIG.fixedStep); }
async function setup(settle = true) {
  const session = await LocalSession.create();
  resources.push(session);
  session.start();
  if (settle) advance(session, 180);
  return session;
}

describe('inventory flow with real session and physics', () => {
  it('drops and picks up the same tool once, keeping its instance ID', async () => {
    const session = await setup();
    const axe = session.getSnapshot().gameplay.inventory.slots[0]!;
    const drop = { type: 'drop-item' as const, slot: 0, yaw: 0, requestId: 'drop' };
    expect(session.sendCommand(drop).accepted).toBe(true);
    expect(session.sendCommand(drop)).toEqual({ accepted: true, duplicate: true });
    expect(session.getSnapshot().gameplay.equippedItem).toBe('none');
    expect(session.getSnapshot().gameplay.loot).toHaveLength(1);
    expect(session.getSnapshot().gameplay.loot[0]?.id).toBe(axe.id);
    expect(session.sendCommand({ ...drop, requestId: 'empty-drop' }).reason).toBe('missing');
    const pickup = { type: 'pickup' as const, targetId: axe.id, requestId: 'pickup' };
    expect(session.sendCommand(pickup).accepted).toBe(true);
    expect(session.sendCommand(pickup).duplicate).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots[0]).toEqual(axe);
    expect(session.getSnapshot().gameplay.equippedItem).toBe('axe');
    expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
  });

  it('preserves a tool when the drop path is blocked by a wall', async () => {
    const session = await setup();
    for (let i = 0; i < 80; i++) session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: 1 });
    const before = session.getSnapshot().gameplay.inventory;
    expect(session.sendCommand({ type: 'drop-item', slot: 0, yaw: Math.PI / 2, requestId: 'wall' }).reason).toBe('blocked');
    expect(session.getSnapshot().gameplay.inventory).toEqual(before);
    expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
    expect(session.sendCommand({ type: 'drop-item', slot: 0, yaw: Math.PI, requestId: 'clear' }).accepted).toBe(true);
  });

  it('rejects airborne, paused and invalid transfers without removing the tool', async () => {
    const session = await setup(false);
    expect(session.sendCommand({ type: 'drop-item', slot: 0, yaw: 0, requestId: 'air' }).reason).toBe('blocked');
    expect(session.sendCommand({ type: 'move-item', from: 0, to: 99, requestId: 'invalid' }).reason).toBe('invalid');
    session.pause();
    expect(session.sendCommand({ type: 'move-item', from: 0, to: 4, requestId: 'paused' }).reason).toBe('paused');
    expect(session.getSnapshot().gameplay.inventory.slots[0]?.itemId).toBe('axe');
    expect(session.getSnapshot().gameplay.loot).toHaveLength(0);
  });

  it('blocks inventory changes during recovery and derives the hand from its slot', async () => {
    const session = await setup();
    session.sendCommand({ type: 'use-item', yaw: 0, requestId: 'attack' });
    expect(session.sendCommand({ type: 'move-item', from: 0, to: 4, requestId: 'move-busy' }).reason).toBe('busy');
    expect(session.sendCommand({ type: 'drop-item', slot: 0, yaw: 0, requestId: 'drop-busy' }).reason).toBe('busy');
    advance(session, 42);
    const move = { type: 'move-item' as const, from: 0, to: 4, requestId: 'move' };
    expect(session.sendCommand(move).accepted).toBe(true);
    expect(session.sendCommand(move).duplicate).toBe(true);
    expect(session.getSnapshot().gameplay.equippedItem).toBe('none');
    session.sendCommand({ type: 'select-slot', slot: 4, requestId: 'select' });
    expect(session.getSnapshot().gameplay.equippedItem).toBe('axe');
  });

  it('opens inventory ahead of combat input, keeps time running and clears old controls', async () => {
    const session = await setup();
    session.pause();
    const scheduler = new FakeScheduler();
    const onInventory = vi.fn();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler, undefined, undefined, onInventory);
    resources.push(game);
    game.start();
    const before = session.getSnapshot();
    game.input.setMove('test', 1, 0);
    game.input.setHeld('Primary', 'test', true);
    game.input.setHeld('Inventory', 'test', true);
    scheduler.advance(0);
    scheduler.advance(20);
    expect(onInventory).toHaveBeenLastCalledWith(true);
    expect(game.input.enabled).toBe(false);
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    expect(session.getSnapshot().player.position.x).toBe(before.player.position.x);
    expect(session.getSnapshot().simulationTime).toBeGreaterThan(before.simulationTime);
    expect(game.sendCommand({ type: 'move-item', from: 0, to: 4, requestId: 'ui-move' }).accepted).toBe(true);
    game.input.setHeld('Primary', 'ui-click', true);
    game.closeInventory();
    scheduler.advance(40);
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    expect(game.input.consumeFrame().move).toEqual({ x: 0, y: 0 });
    game.input.setHeld('Hotbar5', 'test', true);
    scheduler.advance(60);
    expect(session.getSnapshot().gameplay.inventory.activeSlot).toBe(4);
    game.input.setHeld('Drop', 'test', true);
    scheduler.advance(80);
    expect(session.getSnapshot().gameplay.loot[0]?.itemId).toBe('axe');
    game.toggleInventory();
    game.pause();
    expect(onInventory).toHaveBeenLastCalledWith(false);
    expect(game.input.enabled).toBe(false);
  });
});
