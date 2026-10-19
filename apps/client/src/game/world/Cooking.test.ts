import { describe, expect, it, vi } from 'vitest';
import { COOKING_RECIPES, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { Campfire } from './Campfire';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
const far: PlayerSnapshot = { ...player, position: { x: 0, y: 0.92, z: 8 } };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => null }; }
function meatBag() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'meat', itemId: 'raw-meat', amount: 2 }], [2, { id: 'wood', itemId: 'wood', amount: 1 }]]); }
const COOK_SECONDS = COOKING_RECIPES['raw-meat'].seconds;

describe('campfire cooking spot', () => {
  it('spends one raw item, cooks for the configured burn time and hands out one cooked item', () => {
    const fire = new Campfire();
    const bag = meatBag();
    expect(fire.startCooking(bag, 1, 'meat', player, queries()).accepted).toBe(true);
    expect(bag.count('raw-meat')).toBe(1);
    expect(fire.snapshot(player, true).cooking).toEqual({ inputItemId: 'raw-meat', outputItemId: 'cooked-meat', progressSeconds: 0, durationSeconds: COOK_SECONDS, ready: false });
    fire.step(COOK_SECONDS - 0.5);
    expect(fire.collectCooked(bag, player, queries()).reason).toBe('nothing-cooked');
    fire.step(0.5);
    expect(fire.snapshot(player, true).cooking?.ready).toBe(true);
    expect(fire.collectCooked(bag, player, queries()).accepted).toBe(true);
    expect(bag.count('cooked-meat')).toBe(1);
    expect(fire.snapshot(player, true).cooking).toBeNull();
    expect(fire.collectCooked(bag, player, queries()).reason).toBe('nothing-cooked');
  });

  it('rejects without spending anything: wrong item, stale slot, busy spot, cold fire and distance', () => {
    const fire = new Campfire();
    const bag = meatBag();
    const before = bag.snapshot();
    expect(fire.startCooking(bag, 2, 'wood', player, queries()).reason).toBe('not-cookable');
    expect(fire.startCooking(bag, 1, 'other', player, queries()).reason).toBe('stale');
    expect(fire.startCooking(bag, 1, 'meat', far, queries()).reason).toBe('out-of-range');
    const hidden = queries(); hidden.hasLineOfSight.mockReturnValue(false);
    expect(fire.startCooking(bag, 1, 'meat', player, hidden).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
    expect(fire.startCooking(bag, 1, 'meat', player, queries()).accepted).toBe(true);
    const busy = bag.snapshot();
    expect(fire.startCooking(bag, 1, 'meat', player, queries()).reason).toBe('cooking-busy');
    expect(bag.snapshot()).toEqual(busy);
    const cold = new Campfire();
    cold.step(60);
    const coldBag = meatBag();
    expect(cold.startCooking(coldBag, 1, 'meat', player, queries()).reason).toBe('fire-out');
    expect(coldBag.count('raw-meat')).toBe(2);
  });

  it('cooks only while the fire burns: progress stops at burn-out and resumes after relighting', () => {
    const fire = new Campfire();
    const bag = meatBag();
    fire.step(55);
    expect(fire.startCooking(bag, 1, 'meat', player, queries()).accepted).toBe(true);
    fire.step(10);
    expect(fire.snapshot(player, true).cooking?.progressSeconds).toBeCloseTo(5, 8);
    fire.step(30);
    expect(fire.snapshot(player, true).cooking).toMatchObject({ progressSeconds: 5, ready: false });
    expect(fire.addFuel(bag, 2, 'wood', player, queries()).accepted).toBe(true);
    fire.step(COOK_SECONDS - 5);
    expect(fire.snapshot(player, true).cooking?.ready).toBe(true);
  });

  it('keeps ready food on the fire when the backpack is full and gives every result its own ID', () => {
    const fire = new Campfire();
    const full = new Inventory(1, [[0, { id: 'meat', itemId: 'raw-meat', amount: 1 }]]);
    expect(fire.startCooking(full, 0, 'meat', player, queries()).accepted).toBe(true);
    expect(full.insert({ id: 'stone', itemId: 'stone', amount: 1 }).accepted).toBe(true);
    fire.step(COOK_SECONDS);
    expect(fire.collectCooked(full, player, queries()).reason).toBe('inventory-full');
    expect(fire.snapshot(player, true).cooking?.ready).toBe(true);
    const bag = new Inventory(5, [[0, { id: 'meat', itemId: 'raw-meat', amount: 2 }]]);
    expect(fire.collectCooked(bag, player, queries()).accepted).toBe(true);
    expect(fire.startCooking(bag, 0, 'meat', player, queries()).accepted).toBe(true);
    fire.step(COOK_SECONDS);
    expect(fire.collectCooked(bag, player, queries()).accepted).toBe(true);
    expect(bag.snapshot().slots.find((stack) => stack?.itemId === 'cooked-meat')).toMatchObject({ id: 'campfire/cooked/0', amount: 2 });
  });

  it('routes E on the fire: ready food first, then cooking the selected raw item, otherwise fuel', () => {
    const bag = meatBag();
    const world = new GameplayWorld(queries(), [], bag, [], false, []);
    bag.select(1);
    world.update(0, player, 0);
    expect(world.interact(player, 0, 0).accepted).toBe(true);
    expect(world.getSnapshot(0).campfire.cooking?.inputItemId).toBe('raw-meat');
    world.step(COOK_SECONDS);
    world.update(COOK_SECONDS, player, 0);
    expect(world.getSnapshot(COOK_SECONDS).interaction?.label).toContain('готово');
    expect(world.interact(player, COOK_SECONDS, 0).accepted).toBe(true);
    expect(bag.count('cooked-meat')).toBe(1);
    expect(bag.count('raw-meat')).toBe(1);
    bag.select(2);
    const fuel = world.getSnapshot(COOK_SECONDS).campfire.fuelSeconds;
    expect(world.interact(player, COOK_SECONDS, 0).accepted).toBe(true);
    expect(world.getSnapshot(COOK_SECONDS).campfire.fuelSeconds).toBeCloseTo(fuel + 30, 8);
  });
});
