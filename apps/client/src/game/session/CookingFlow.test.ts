import { afterEach, describe, expect, it } from 'vitest';
import { COOKING_RECIPES, CONSUMABLE_DEFINITIONS, NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, TEST_MATERIAL_NODES, TEST_SUPPLIES } from '@forest-survival/shared';
import type { PlayerVitals } from '../player/PlayerVitals';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
function advance(session: LocalSession, count: number) { for (let index = 0; index < count; index++) session.step(SIMULATION_CONFIG.fixedStep); }
function walkTo(session: LocalSession, x: number, z: number) {
  for (let step = 0; step < 600; step++) {
    const position = session.getSnapshot().player.position;
    const dx = x - position.x, dz = z - position.z;
    if (Math.hypot(dx, dz) < 0.1) return;
    session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: dx, moveY: -dz });
  }
  throw new Error('Cannot reach test destination');
}
const slotOf = (session: LocalSession, itemId: string) => session.getSnapshot().gameplay.inventory.slots.findIndex((stack) => stack?.itemId === itemId);

describe('hunting, cooking and healing with real physics', () => {
  it('hunts a hare, cooks its meat on the lit fire and eats it for both effects at once', async () => {
    const session = await LocalSession.create();
    resources.push(session);
    session.start();
    advance(session, 60);
    const hare = TEST_MATERIAL_NODES.find((node) => node.kind === 'hare' && node.id === 'hare-01')!;
    walkTo(session, -6, 1);
    walkTo(session, hare.position.x + 1.4, hare.position.z);
    const player = session.getSnapshot().player.position;
    expect(session.sendCommand({ type: 'use-item', yaw: Math.atan2(hare.position.x - player.x, hare.position.z - player.z), requestId: 'hunt' }).accepted).toBe(true);
    advance(session, 42);
    const hunted = session.getSnapshot().gameplay;
    expect(hunted.resources.find((entry) => entry.id === hare.id)).toMatchObject({ exhausted: true, requiredTool: null });
    expect(hunted.loot.map((item) => item.itemId)).toEqual(['raw-meat', 'raw-meat']);
    walkTo(session, hare.position.x, hare.position.z);
    for (const item of session.getSnapshot().gameplay.loot) expect(session.sendCommand({ type: 'pickup', targetId: item.id, requestId: 'meat-' + item.id }).accepted).toBe(true);
    expect(session.getSnapshot().gameplay.inventory.slots.find((stack) => stack?.itemId === 'raw-meat')?.amount).toBe(2);

    walkTo(session, -6, 1);
    walkTo(session, -1.5, 1);
    walkTo(session, -1.5, 2.8);
    const raw = session.getSnapshot().gameplay.inventory.slots[slotOf(session, 'raw-meat')]!;
    expect(session.sendCommand({ type: 'cook-item', slot: slotOf(session, 'raw-meat'), expectedItemId: raw.id, requestId: 'cook' }).accepted).toBe(true);
    expect(session.sendCommand({ type: 'cook-item', slot: slotOf(session, 'raw-meat'), expectedItemId: raw.id, requestId: 'cook' }).duplicate).toBe(true);
    expect(session.sendCommand({ type: 'cook-item', slot: slotOf(session, 'raw-meat'), expectedItemId: raw.id, requestId: 'cook-again' }).reason).toBe('cooking-busy');
    expect(session.getSnapshot().gameplay.inventory.slots.find((stack) => stack?.itemId === 'raw-meat')?.amount).toBe(1);
    expect(session.sendCommand({ type: 'collect-cooked', requestId: 'too-early' }).reason).toBe('nothing-cooked');
    session.pause();
    advance(session, 600);
    expect(session.getSnapshot().gameplay.campfire.cooking?.progressSeconds).toBeLessThan(COOKING_RECIPES['raw-meat'].seconds);
    session.start();
    advance(session, Math.ceil(COOKING_RECIPES['raw-meat'].seconds / SIMULATION_CONFIG.fixedStep) + 1);
    expect(session.getSnapshot().gameplay.campfire.cooking?.ready).toBe(true);
    expect(session.sendCommand({ type: 'collect-cooked', requestId: 'collect' }).accepted).toBe(true);
    expect(session.sendCommand({ type: 'collect-cooked', requestId: 'collect' }).duplicate).toBe(true);
    expect(slotOf(session, 'cooked-meat')).toBeGreaterThanOrEqual(0);

    (session as unknown as { vitals: PlayerVitals }).vitals.takeDamage(40, session.getSnapshot().simulationTime);
    const before = session.getSnapshot().vitals;
    const cooked = session.getSnapshot().gameplay.inventory.slots[slotOf(session, 'cooked-meat')]!;
    expect(session.sendCommand({ type: 'consume-item', slot: slotOf(session, 'cooked-meat'), expectedItemId: cooked.id, requestId: 'eat' }).accepted).toBe(true);
    const after = session.getSnapshot().vitals;
    expect(after.health - before.health).toBeCloseTo(CONSUMABLE_DEFINITIONS['cooked-meat'].health, 6);
    expect(after.hunger).toBeCloseTo(Math.min(100, before.hunger + CONSUMABLE_DEFINITIONS['cooked-meat'].hunger), 6);
    expect(slotOf(session, 'cooked-meat')).toBe(-1);
  });

  it('places found supplies only when the client asks for them, and a new session restores them', async () => {
    const plain = await LocalSession.create();
    resources.push(plain);
    expect(plain.getSnapshot().gameplay.loot).toHaveLength(0);
    const supplied = await LocalSession.create({ supplies: TEST_SUPPLIES });
    resources.push(supplied);
    expect(supplied.getSnapshot().gameplay.loot.map((item) => [item.id, item.itemId, item.amount])).toEqual(TEST_SUPPLIES.map((item) => [item.id, item.itemId, item.amount]));
  });
});
