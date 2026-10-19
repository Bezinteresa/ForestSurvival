import { describe, expect, it } from 'vitest';
import { WORKBENCH_LEVELS, type MaterialCost, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from './GameplayWorld';
import { Workbench } from './Workbench';

const player: PlayerSnapshot = { id: 'player', position: { x: 0.6, y: 0.92, z: -3 }, yaw: 0, grounded: true };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => ({ x: 0.6, y: 0.23, z: -1.8 }), canPlaceWorkbench: () => true, addWorkbenchCollider: () => {} };
function materials() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 3 }], [3, { id: 'scrap', itemId: 'scrap', amount: 3 }]]); }

describe('workbench levels and real equipment recipes', () => {
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

  it('unlocks reinforced tools only at level two and the backpack only at three', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    const before = bag.snapshot();
    for (const id of ['reinforced-axe', 'reinforced-pickaxe', 'expanded-backpack']) expect(bench.craft(id, bag, player, queries).reason).toBe('station-level');
    expect(bag.snapshot()).toEqual(before);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    bench.upgrade(1, bag, player, queries);
    expect(bench.craft('expanded-backpack', bag, player, queries).reason).toBe('station-level');
    expect(bench.craft('reinforced-axe', bag, player, queries).accepted).toBe(true);
    bag.insert({ id: 'wood-3', itemId: 'wood', amount: 1 });
    bag.insert({ id: 'scrap-2', itemId: 'scrap', amount: 2 });
    expect(bench.craft('reinforced-pickaxe', bag, player, queries).accepted).toBe(true);
    const tools = bag.snapshot().slots.filter((stack) => stack?.id.startsWith('camp-workbench/crafted/'));
    expect(tools).toEqual([{ id: 'camp-workbench/crafted/0', itemId: 'axe', amount: 1, level: 2 }, { id: 'camp-workbench/crafted/1', itemId: 'pickaxe', amount: 1, level: 2 }]);
  });

  it('keeps full materials and the result ID when an unlocked reinforced tool cannot fit', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, queries, queries);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    bench.upgrade(1, bag, player, queries);
    bag.insert({ id: 'wood-3', itemId: 'wood', amount: 2 });
    bag.insert({ id: 'scrap-2', itemId: 'scrap', amount: 1 });
    bag.insert({ id: 'food', itemId: 'berries', amount: 5 });
    const before = bag.snapshot();
    expect(bench.craft('reinforced-pickaxe', bag, player, queries).reason).toBe('inventory-full');
    expect(bag.snapshot()).toEqual(before);
    bag.remove(4);
    expect(bench.craft('reinforced-pickaxe', bag, player, queries).accepted).toBe(true);
    expect(bag.snapshot().slots.find((stack) => stack?.itemId === 'pickaxe')).toMatchObject({ id: 'camp-workbench/crafted/0', level: 2 });
  });

  it('applies crafted tool damage/timing and keeps level/ID through drop, pickup and storage', () => {
    const bag = materials();
    const world = new GameplayWorld(queries, [{ id: 'tree', position: { x: 2, y: 0, z: 0 }, radius: 0.4, trunkHeight: 2.4 }], bag, [{ id: 'rock', kind: 'rock', position: { x: 6, y: 0, z: 0 }, radius: 0.65, height: 1.2 }]);
    expect(world.buildWorkbench(player, 0).accepted).toBe(true);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 3 });
    expect(world.upgradeWorkbench(1, player, 0).accepted).toBe(true);
    expect(world.craftItem('reinforced-axe', player, 0).accepted).toBe(true);
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
    bag.insert({ id: 'wood-3', itemId: 'wood', amount: 1 });
    bag.insert({ id: 'scrap-2', itemId: 'scrap', amount: 2 });
    expect(world.craftItem('reinforced-pickaxe', player, 2).accepted).toBe(true);
    const pickSlot = bag.snapshot().slots.findIndex((stack) => stack?.itemId === 'pickaxe');
    world.selectSlot(pickSlot, 2);
    const quarry = { ...player, position: { x: 6, y: 0.92, z: -1.6 } };
    world.useItem('mine-1', 0, 2); world.update(2.19, quarry, 0);
    expect(world.getSnapshot(2.19).resources.find((entry) => entry.id === 'rock')?.health).toBe(30);
    world.useItem('mine-2', 0, 2.54); world.update(2.73, quarry, 0);
    expect(world.getSnapshot(2.73).resources.find((entry) => entry.id === 'rock')?.exhausted).toBe(true);
  });
});

describe('backpack recipe transaction', () => {
  it('expands a full bag once, preserves other stacks/active selection and accepts additional slots', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1, level: 2 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'scrap', itemId: 'scrap', amount: 3 }], [3, { id: 'food', itemId: 'berries', amount: 5 }], [4, { id: 'coal', itemId: 'coal', amount: 3 }]]);
    bag.select(4);
    expect(bag.craftBackpack({ wood: 1, scrap: 1 }, 2).accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ level: 2, activeSlot: 4 });
    expect(bag.snapshot().slots).toHaveLength(8);
    expect(bag.getStack(0)).toEqual({ id: 'axe', itemId: 'axe', amount: 1, level: 2 });
    expect(bag.getStack(3)?.amount).toBe(5);
    const before = bag.snapshot();
    expect(bag.craftBackpack({ wood: 1, scrap: 1 }, 2).reason).toBe('max-level');
    expect(bag.snapshot()).toEqual(before);
    expect(bag.move(0, 7).accepted).toBe(true);
    expect(bag.select(7).accepted).toBe(true);
    expect(bag.equippedItem).toBe('axe');
    expect(bag.getStack(7)?.level).toBe(2);
  });

  it('keeps capacity, level and ingredients on failed or invalid payment', () => {
    const bag = materials(), before = bag.snapshot();
    for (const cost of [{ wood: 3, scrap: 4 }, { wood: 0 }, {}] as MaterialCost[]) expect(bag.craftBackpack(cost, 2).accepted).toBe(false);
    expect(bag.craftBackpack({ wood: 1 }, 1).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
  });
});
