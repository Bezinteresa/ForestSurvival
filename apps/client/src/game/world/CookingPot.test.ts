import { describe, expect, it } from 'vitest';
import { POT_RECIPES, buildingBox, type BuildingSnapshot, type ItemCost, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { PlayerVitals } from '../player/PlayerVitals';
import { CookingPot } from './CookingPot';
import { GameplayWorld } from './GameplayWorld';

const plan = { kind: 'cooking-pot' as const, siteId: 'pot-plot-1', rotation: 0 as const };
const building: BuildingSnapshot = { ...buildingBox(plan)!, ...plan };
const player: PlayerSnapshot = { id: 'player', position: { x: 1.6, y: 0.92, z: 0.9 }, yaw: 0, grounded: true };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => null, canPlaceWorkbench: () => true, addWorkbenchCollider: () => {}, canPlaceBuilding: () => true, activateBuildingCollider: () => {} };
function ingredients() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'meat', itemId: 'raw-meat', amount: 3 }], [2, { id: 'berries-a', itemId: 'berries', amount: 1 }], [3, { id: 'berries-b', itemId: 'berries', amount: 4 }]]); }
function next(pot: CookingPot) { return pot.snapshot(building, true, true).nextBatchId!; }

describe('cooking pot transactions', () => {
  it('cooks three carrots from separate stacks into one stew and preserves all carrots on an incomplete price', () => {
    const pot = new CookingPot(), first = next(pot);
    const missing = new Inventory(5, [[0, { id: 'two-carrots', itemId: 'carrot', amount: 2 }]]), before = missing.snapshot();
    expect(pot.start('carrot-stew', first, missing, building, player, queries, true).reason).toBe('insufficient-materials');
    expect(missing.snapshot()).toEqual(before);
    expect(next(pot)).toBe(first);
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'carrot-a', itemId: 'carrot', amount: 1 }], [2, { id: 'carrot-b', itemId: 'carrot', amount: 3 }], [3, { id: 'berries', itemId: 'berries', amount: 3 }]]);
    bag.select(2);
    expect(pot.start('carrot-stew', first, bag, building, player, queries, true).accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ activeSlot: 2, slots: [{ id: 'axe', itemId: 'axe', amount: 1 }, null, { id: 'carrot-b', itemId: 'carrot', amount: 1 }, { id: 'berries', itemId: 'berries', amount: 3 }, null] });
    pot.step(19.9);
    expect(pot.collect(first, bag, building, player, queries).reason).toBe('nothing-cooked');
    pot.step(0.1);
    expect(pot.snapshot(building, true, false).cooking).toMatchObject({ outputItemId: 'carrot-stew', durationSeconds: 20, ready: true });
    expect(pot.collect(first, new Inventory(1), building, player, queries).reason).toBe('inventory-full');
    expect(pot.collect(first, bag, building, player, queries).accepted).toBe(true);
    expect(bag.getStack(1)).toEqual({ id: first + '/output', itemId: 'carrot-stew', amount: 1 });
    expect(pot.collect(first, bag, building, player, queries).reason).toBe('stale');
    expect(bag.count('carrot-stew')).toBe(1);
  });
  it('spends ingredients across stacks atomically and preserves leftovers, tools and the active slot', () => {
    const pot = new CookingPot(), bag = ingredients(); bag.select(3);
    expect(pot.start('meat-soup', next(pot), bag, building, player, queries, true).accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ activeSlot: 3, slots: [{ id: 'axe', itemId: 'axe', amount: 1 }, { id: 'meat', itemId: 'raw-meat', amount: 2 }, null, { id: 'berries-b', itemId: 'berries', amount: 3 }, null] });
    const before = bag.snapshot(), batch = pot.snapshot(building, true, true);
    expect(pot.start('meat-soup', next(pot), bag, building, player, queries, true).reason).toBe('cooking-busy');
    expect(bag.snapshot()).toEqual(before);
    expect(pot.snapshot(building, true, true)).toEqual(batch);
  });

  it('refuses missing ingredients, invalid recipes, absent stations, stale batches, obstruction, distance and cold without payment', () => {
    const pot = new CookingPot(), bag = new Inventory(5, [[0, { id: 'meat', itemId: 'raw-meat', amount: 1 }], [1, { id: 'berries', itemId: 'berries', amount: 1 }]]);
    const before = bag.snapshot(), first = next(pot);
    expect(pot.start('meat-soup', first, bag, building, player, queries, true).reason).toBe('insufficient-materials');
    for (const id of ['unknown', '__proto__', 'constructor']) expect(pot.start(id, first, bag, building, player, queries, true).reason).toBe('invalid');
    expect(pot.start('meat-soup', first, bag, undefined, player, queries, true).reason).toBe('station-required');
    expect(pot.start('meat-soup', 'old', bag, building, player, queries, true).reason).toBe('stale');
    expect(pot.start('meat-soup', first, bag, building, { ...player, position: { x: 10, y: 0.92, z: 0 } }, queries, true).reason).toBe('out-of-range');
    expect(pot.start('meat-soup', first, bag, building, player, { hasLineOfSight: () => false }, true).reason).toBe('blocked');
    expect(pot.start('meat-soup', first, bag, building, player, queries, false).reason).toBe('fire-out');
    expect(bag.snapshot()).toEqual(before);
    expect(pot.snapshot(building, true, true)).toMatchObject({ nextBatchId: first, cooking: null });
    for (const cost of [{}, { berries: 0 }, { berries: -1 }, { berries: 1.5 }, { berries: Infinity }, { constructor: 1 }]) expect(bag.spendItems(cost as ItemCost).reason).toBe('invalid');
    expect(bag.spendMaterials({ berries: 1 } as ItemCost).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
  });

  it('retains the ready batch in a full backpack and protects old start/collect IDs after a new batch', () => {
    const pot = new CookingPot(), bag = ingredients(), first = next(pot);
    pot.start('meat-soup', first, bag, building, player, queries, true);
    expect(pot.collect(first, bag, building, player, queries).reason).toBe('nothing-cooked');
    for (const dt of [NaN, Infinity, -1, 0]) pot.step(dt);
    expect(pot.snapshot(building, true, true).cooking?.progressSeconds).toBe(0);
    pot.step(POT_RECIPES['meat-soup'].seconds);
    const full = new Inventory(1, [[0, { id: 'stone', itemId: 'stone', amount: 3 }]]);
    expect(pot.collect(first, full, building, player, queries).reason).toBe('inventory-full');
    expect(full.count('stone')).toBe(3);
    const ready = pot.snapshot(building, true, false);
    expect(ready.cooking?.ready).toBe(true);
    expect(pot.collect('old', bag, building, player, queries).reason).toBe('stale');
    expect(pot.collect(first, bag, building, player, { hasLineOfSight: () => false }).reason).toBe('blocked');
    expect(pot.collect(first, bag, building, { ...player, position: { x: 10, y: 0.92, z: 0 } }, queries).reason).toBe('out-of-range');
    expect(pot.collect(first, bag, building, player, queries).accepted).toBe(true);
    expect(bag.snapshot().slots.find((item) => item?.itemId === 'meat-soup')?.id).toBe(first + '/output');
    const second = next(pot); expect(second).not.toBe(first);
    expect(pot.start('meat-soup', first, bag, building, player, queries, true).reason).toBe('stale');
    expect(pot.start('meat-soup', second, bag, building, player, queries, true).accepted).toBe(true);
    pot.step(18);
    expect(pot.collect(first, bag, building, player, queries).reason).toBe('stale');
    const empty = new Inventory(5, []);
    expect(pot.collect(second, empty, building, player, queries).accepted).toBe(true);
    expect(empty.getStack(0)?.id).toBe(second + '/output');
    (ready.cooking as { progressSeconds: number }).progressSeconds = -1;
    expect(pot.snapshot(building, true, false).cooking).toBeNull();
  });

  it('shares actual burn time with grilling, freezes at fuel exhaustion and resumes without an extra fuel charge', () => {
    const bag = new Inventory(8, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 3 }], [3, { id: 'scrap', itemId: 'scrap', amount: 2 }], [4, { id: 'meat', itemId: 'raw-meat', amount: 2 }], [5, { id: 'berries', itemId: 'berries', amount: 2 }], [6, { id: 'fuel', itemId: 'wood', amount: 1 }]]);
    const world = new GameplayWorld(queries, [], bag, [], false, []);
    expect(world.buildWorkbench({ ...player, position: { x: 0.6, y: 0.92, z: -3 } }, 0).accepted).toBe(true);
    expect(world.placeBuilding(plan, player, 0).accepted).toBe(true);
    world.step(55);
    const first = world.getSnapshot(55).cookingPot.nextBatchId!;
    expect(world.cookPot('meat-soup', first, player, 55).accepted).toBe(true);
    expect(world.cookItem(4, 'meat', player, 55).accepted).toBe(true);
    world.step(10);
    expect(world.getSnapshot(65).cookingPot).toMatchObject({ heated: false, cooking: { progressSeconds: 5, ready: false } });
    expect(world.getSnapshot(65).campfire).toMatchObject({ fuelSeconds: 0, cooking: { progressSeconds: 5 } });
    const before = world.getSnapshot(65).cookingPot.cooking;
    world.step(30);
    expect(world.getSnapshot(95).cookingPot.cooking).toEqual(before);
    expect(world.fuelFire(6, 'fuel', player, 95).accepted).toBe(true);
    world.step(13);
    expect(world.getSnapshot(108).cookingPot.cooking?.ready).toBe(true);
    expect(world.getSnapshot(108).campfire).toMatchObject({ fuelSeconds: 17, cooking: { ready: true } });
    expect(world.collectPot(first, player, 108).accepted).toBe(true);
    expect(world.collectCooked(player, 108).accepted).toBe(true);
    const soup = bag.snapshot().slots.findIndex((item) => item?.itemId === 'meat-soup');
    expect(world.consumeItem(soup, bag.getStack(soup)!.id, new PlayerVitals(), 108).reason).toBe('satiated');
    expect(bag.count('meat-soup')).toBe(1);
    const vitals = new PlayerVitals({ health: 60, hunger: 10 });
    expect(world.consumeItem(soup, bag.getStack(soup)!.id, vitals, 108).accepted).toBe(true);
    expect(vitals.snapshot()).toMatchObject({ health: 85, hunger: 80 });
    expect(bag.count('meat-soup')).toBe(0);
  });

  it('blocks pot commands during an attack and only opens the targeted pot with E', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 3 }], [3, { id: 'scrap', itemId: 'scrap', amount: 2 }]]);
    const world = new GameplayWorld(queries, [], bag, [], false, []);
    world.buildWorkbench({ ...player, position: { x: 0.6, y: 0.92, z: -3 } }, 0);
    world.placeBuilding(plan, player, 0);
    world.update(0, player, 0);
    expect(world.getSnapshot(0).interaction?.kind).toBe('cooking-pot');
    expect(world.interact(player, 0, 0).accepted).toBe(true);
    expect(world.getSnapshot(0).cookingPot.cooking).toBeNull();
    const before = bag.snapshot(); world.useItem('attack', 0, 0);
    expect(world.cookPot('meat-soup', next(new CookingPot()), player, 0).reason).toBe('busy');
    expect(world.collectPot('old', player, 0).reason).toBe('busy');
    expect(bag.snapshot()).toEqual(before);
    world.end(); expect(world.getSnapshot(0).cookingPot.inReach).toBe(false);
  });
});
