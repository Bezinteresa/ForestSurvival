import { describe, expect, it } from 'vitest';
import { WORKBENCH_LEVELS, type PlayerSnapshot } from '@forest-survival/shared';
import { PlayerVitals } from '../player/PlayerVitals';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from './GameplayWorld';
import { Workbench } from './Workbench';

const player: PlayerSnapshot = { id: 'player', position: { x: 0.6, y: 0.92, z: -3 }, yaw: 0, grounded: true };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => ({ x: 0.6, y: 0.23, z: -1.8 }), canPlaceWorkbench: () => true, addWorkbenchCollider: () => {} };
function materials() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 3 }], [3, { id: 'scrap', itemId: 'scrap', amount: 3 }]]); }

describe('workbench levels and its item recipes', () => {
  it('rejects upgrades before construction and invalid levels without paying', () => {
    const bench = new Workbench(), bag = materials(), before = bag.snapshot();
    expect(bench.upgrade(1, bag, player, queries).reason).toBe('station-required');
    for (const level of [0, 4, -1, 1.5, NaN, Infinity]) expect(bench.upgrade(level, bag, player, queries).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
    expect(bench.snapshot(true)).toMatchObject({ level: 0, nextUpgrade: null, maxLevel: 3 });
  });

  it('buys sequential levels, preserves the full price on stale/missing requests and stops at three', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    const built = bag.snapshot();
    expect(bench.upgrade(2, bag, player, queries).reason).toBe('stale');
    expect(bench.upgrade(1, bag, player, queries).reason).toBe('insufficient-materials');
    expect(bag.snapshot()).toEqual(built);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    expect(bench.upgrade(1, bag, player, queries).accepted).toBe(true);
    expect(bench.snapshot(true)).toMatchObject({ level: 2, nextUpgrade: { level: 3, cost: WORKBENCH_LEVELS[3].cost } });
    const before = bag.snapshot();
    expect(bench.upgrade(1, bag, player, queries).reason).toBe('stale');
    expect(bench.upgrade(2, bag, player, queries).reason).toBe('insufficient-materials');
    expect(bag.snapshot()).toEqual(before);
    bag.insert({ id: 'wood-3', itemId: 'wood', amount: 1 });
    expect(bench.upgrade(2, bag, player, queries).accepted).toBe(true);
    const max = bag.snapshot();
    expect(bench.snapshot(true)).toMatchObject({ level: 3, nextUpgrade: null });
    expect(bench.upgrade(2, bag, player, queries).reason).toBe('stale');
    expect(bench.upgrade(3, bag, player, queries).reason).toBe('max-level');
    expect(bag.snapshot()).toEqual(max);
    expect(bag.getStack(0)?.id).toBe('axe');
  });

  it('rechecks range, height and visibility for each upgrade without partial spending', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    bag.insert({ id: 'more-wood', itemId: 'wood', amount: 3 });
    const before = bag.snapshot();
    expect(bench.upgrade(1, bag, { ...player, position: { x: -10, y: 0.92, z: -3 } }, queries).reason).toBe('out-of-range');
    expect(bench.upgrade(1, bag, { ...player, position: { ...player.position, y: 5 } }, queries).reason).toBe('out-of-range');
    expect(bench.upgrade(1, bag, player, { hasLineOfSight: () => false }).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
    const snapshot = bench.snapshot(true);
    (snapshot.nextUpgrade!.cost as { wood: number }).wood = 99;
    expect(bench.snapshot(true).nextUpgrade?.cost.wood).toBe(2);
  });

  it('unlocks the compass only at level two and offers no tools or backpack', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    const before = bag.snapshot();
    expect(bench.craft('compass', bag, player, queries).reason).toBe('station-level');
    for (const id of ['reinforced-axe', 'reinforced-pickaxe', 'expanded-backpack']) expect(bench.craft(id, bag, player, queries).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    expect(bench.upgrade(1, bag, player, queries).accepted).toBe(true);
    bag.insert({ id: 'scrap-2', itemId: 'scrap', amount: 1 });
    expect(bench.craft('compass', bag, player, queries).accepted).toBe(true);
    expect(bag.snapshot().slots.find((stack) => stack?.itemId === 'compass')).toEqual({ id: 'camp-workbench/crafted/0', itemId: 'compass', amount: 1 });
  });

  it('fits the compass into the slot its price releases in a full bag, keeping every other stack', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    bench.upgrade(1, bag, player, queries);
    bag.insert({ id: 'scrap-2', itemId: 'scrap', amount: 3 });
    bag.insert({ id: 'food', itemId: 'berries', amount: 5 });
    expect(bag.snapshot().slots.every(Boolean)).toBe(true);
    expect(bench.craft('compass', bag, player, queries).accepted).toBe(true);
    expect(bag.count('scrap')).toBe(2);
    expect(bag.snapshot().slots.find((stack) => stack?.itemId === 'compass')).toMatchObject({ id: 'camp-workbench/crafted/0' });
  });

  it('applies found reinforced tool damage/timing and keeps level/ID through drop, pickup and storage', () => {
    const bag = materials();
    const world = new GameplayWorld(queries, [{ id: 'tree', position: { x: 2, y: 0, z: 0 }, radius: 0.4, trunkHeight: 2.4 }], bag, [{ id: 'rock', kind: 'rock', position: { x: 6, y: 0, z: 0 }, radius: 0.65, height: 1.2 }]);
    expect(world.buildWorkbench(player, 0).accepted).toBe(true);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    expect(world.upgradeWorkbench(1, player, 0).accepted).toBe(true);
    // Reinforced tools are found beyond the fog; simulate the pickup.
    expect(bag.insert({ id: 'supply-axe-02', itemId: 'axe', amount: 1, level: 2 }).accepted).toBe(true);
    const axeSlot = bag.snapshot().slots.findIndex((stack) => stack?.level === 2);
    world.selectSlot(axeSlot, 0);
    const miner = { ...player, position: { x: 2, y: 0.92, z: -1.6 } };
    expect(world.useItem('cut-1', 0, 0).accepted).toBe(true);
    expect(world.upgradeWorkbench(2, player, 0.1).reason).toBe('busy');
    world.update(0.19, miner, 0);
    expect(world.getSnapshot(0.19).resources.find((entry) => entry.id === 'tree')?.health).toBe(50);
    expect(world.useItem('too-fast', 0, 0.52).reason).toBe('busy');
    expect(world.useItem('cut-2', 0, 0.54).accepted).toBe(true);
    world.update(0.73, miner, 0);
    expect(world.getSnapshot(0.73).resources.find((entry) => entry.id === 'tree')?.exhausted).toBe(true);
    const axe = bag.getStack(axeSlot)!;
    expect(world.drop(axeSlot, player, 0, 2).accepted).toBe(true);
    expect(world.pickup(axe.id, player, 2).accepted).toBe(true);
    const returned = bag.snapshot().slots.findIndex((stack) => stack?.id === axe.id);
    expect(world.transfer('deposit', returned, axe.id, player, 2).accepted).toBe(true);
    expect(world.getSnapshot(2).storage.inventory.slots).toContainEqual(axe);
    expect(bag.insert({ id: 'supply-pickaxe-02', itemId: 'pickaxe', amount: 1, level: 2 }).accepted).toBe(true);
    const pickSlot = bag.snapshot().slots.findIndex((stack) => stack?.itemId === 'pickaxe');
    world.selectSlot(pickSlot, 2);
    const quarry = { ...player, position: { x: 6, y: 0.92, z: -1.6 } };
    world.useItem('mine-1', 0, 2); world.update(2.19, quarry, 0);
    expect(world.getSnapshot(2.19).resources.find((entry) => entry.id === 'rock')?.health).toBe(30);
    world.useItem('mine-2', 0, 2.54); world.update(2.73, quarry, 0);
    expect(world.getSnapshot(2.73).resources.find((entry) => entry.id === 'rock')?.exhausted).toBe(true);
  });
});

describe('found large backpack', () => {
  it('widens a full bag once from its slot, keeps other stacks and selection and accepts additional slots', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1, level: 2 }], [1, { id: 'pack', itemId: 'large-backpack', amount: 1 }], [2, { id: 'scrap', itemId: 'scrap', amount: 3 }], [3, { id: 'food', itemId: 'berries', amount: 5 }], [4, { id: 'coal', itemId: 'coal', amount: 3 }]]);
    bag.select(4);
    expect(bag.applyBackpackItem(1, 'other').reason).toBe('stale');
    expect(bag.applyBackpackItem(2, 'scrap').reason).toBe('invalid');
    expect(bag.applyBackpackItem(1, 'pack').accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ level: 2, activeSlot: 4 });
    expect(bag.snapshot().slots).toHaveLength(8);
    expect(bag.getStack(1)).toBeNull();
    expect(bag.getStack(0)).toEqual({ id: 'axe', itemId: 'axe', amount: 1, level: 2 });
    expect(bag.move(0, 7).accepted).toBe(true);
    expect(bag.select(7).accepted).toBe(true);
    expect(bag.equippedItem).toBe('axe');
  });

  it('refuses a second backpack without spending it, also through the world use command', () => {
    const bag = new Inventory(5, [[0, { id: 'pack-a', itemId: 'large-backpack', amount: 1 }], [1, { id: 'pack-b', itemId: 'large-backpack', amount: 1 }]]);
    const world = new GameplayWorld(queries, [], bag, []);
    const vitals = new PlayerVitals();
    expect(world.consumeItem(0, 'pack-a', vitals, 0).accepted).toBe(true);
    const before = bag.snapshot();
    expect(world.consumeItem(1, 'pack-b', vitals, 0).reason).toBe('max-level');
    expect(bag.snapshot()).toEqual(before);
    expect(world.getSnapshot(0).feedback?.text).toBe('Рюкзак уже расширен.');
  });
});
