import { describe, expect, it, vi } from 'vitest';
import { CRAFT_RECIPES, WORKBENCH_CONFIG, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { Workbench } from './Workbench';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0.8, y: 0.92, z: -2 }, yaw: Math.PI / 2, grounded: true };
const visible = { hasLineOfSight: () => true };
function materials() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 3 }], [3, { id: 'scrap', itemId: 'scrap', amount: 3 }]]); }
function placement() { return { canPlaceWorkbench: () => true, addWorkbenchCollider: vi.fn() }; }

describe('workbench building and recipes', () => {
  it('builds once, takes its full cost, preserves other item IDs and returns isolated snapshots', () => {
    const bench = new Workbench(), bag = materials(), physics = placement();
    expect(bench.craft('basic-axe', bag, player, visible).reason).toBe('station-required');
    expect(bench.build(bag, player, visible, physics).accepted).toBe(true);
    expect([bag.count('wood'), bag.count('stone'), bag.count('scrap')]).toEqual([0, 2, 3]);
    const before = bag.snapshot();
    expect(bench.build(bag, player, visible, physics).reason).toBe('already-built');
    expect(bag.snapshot()).toEqual(before);
    expect(physics.addWorkbenchCollider).toHaveBeenCalledTimes(1);
    const snapshot = bench.snapshot(true);
    (snapshot.position as { x: number }).x = 100;
    expect(bench.snapshot(true)).toMatchObject({ built: true, level: 1, position: WORKBENCH_CONFIG.position });
  });

  it('preserves all materials and geometry on missing ingredients, occupied place, distance, height and occlusion', () => {
    const bench = new Workbench(), physics = placement();
    const bag = new Inventory(5, [[0, { id: 'wood', itemId: 'wood', amount: 3 }]]);
    const before = bag.snapshot();
    expect(bench.build(bag, player, visible, physics).reason).toBe('insufficient-materials');
    expect(bench.build(bag, { ...player, position: { x: 10, y: 0.92, z: -2 } }, visible, physics).reason).toBe('out-of-range');
    expect(bench.build(bag, { ...player, position: { ...player.position, y: 5 } }, visible, physics).reason).toBe('out-of-range');
    expect(bench.build(bag, player, { hasLineOfSight: () => false }, physics).reason).toBe('blocked');
    expect(bench.build(bag, player, visible, { ...physics, canPlaceWorkbench: () => false }).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
    expect(bench.snapshot(true).built).toBe(false);
    expect(physics.addWorkbenchCollider).not.toHaveBeenCalled();
  });

  it('gates unknown and advanced recipes and rechecks distance/visibility on each craft', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, visible, placement());
    const before = bag.snapshot();
    for (const id of ['unknown', '__proto__', 'constructor']) expect(bench.craft(id, bag, player, visible).reason).toBe('invalid');
    expect(bench.craft('reinforced-axe', bag, player, visible).reason).toBe('station-level');
    expect(bench.craft('basic-pickaxe', bag, { ...player, position: { x: -8, y: 0.92, z: 0 } }, visible).reason).toBe('out-of-range');
    expect(bench.craft('basic-pickaxe', bag, player, { hasLineOfSight: () => false }).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
  });

  it('crafts distinct level-one instances without consuming an ID on failure', () => {
    const bench = new Workbench(), bag = materials();
    bench.build(bag, player, visible, placement());
    expect(bench.craft('basic-pickaxe', bag, player, visible).reason).toBe('insufficient-materials');
    bag.insert({ id: 'more-wood', itemId: 'wood', amount: 3 });
    bag.upgradeBackpack(2);
    for (let index = 0; index < 2; index++) expect(bench.craft('basic-pickaxe', bag, player, visible).accepted).toBe(true);
    const crafted = bag.snapshot().slots.filter((stack) => stack?.itemId === 'pickaxe');
    expect(crafted.map((stack) => stack?.id)).toEqual(['camp-workbench/crafted/0', 'camp-workbench/crafted/1']);
    expect(crafted.every((stack) => stack?.level === 1)).toBe(true);
    expect([bag.count('wood'), bag.count('scrap')]).toEqual([1, 1]);
  });

  it('rejects build/craft during a swing and items lying on the construction site', () => {
    const bag = materials();
    const world = new GameplayWorld({ ...visible, ...placement(), removeEntityCollider: () => {}, findDropPosition: () => ({ ...WORKBENCH_CONFIG.position, y: 0.23 }) }, [], bag);
    world.update(0, player, player.yaw);
    expect(world.useItem('hit', player.yaw, 0).accepted).toBe(true);
    expect(world.buildWorkbench(player, 0.1).reason).toBe('busy');
    expect(world.craftItem('basic-axe', player, 0.1).reason).toBe('busy');
    expect(world.drop(0, player, player.yaw, 1).accepted).toBe(true);
    const before = bag.snapshot();
    expect(world.buildWorkbench(player, 1).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
    expect(world.pickup('axe', player, 1).accepted).toBe(true);
    expect(world.buildWorkbench(player, 1).accepted).toBe(true);
  });

  it('fits the build and both basic recipes into the map budget left after six campfire levels', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'pick', itemId: 'pickaxe', amount: 1 }], [2, { id: 'wood', itemId: 'wood', amount: 3 }], [3, { id: 'stone', itemId: 'stone', amount: 3 }], [4, { id: 'scrap', itemId: 'scrap', amount: 3 }]]);
    const bench = new Workbench();
    expect(bench.build(bag, player, visible, placement()).accepted).toBe(true);
    bag.insert({ id: 'wood-2', itemId: 'wood', amount: 2 });
    bag.remove(0); // Store a spare tool before crafting in the five-slot bag.
    expect(bench.craft('basic-axe', bag, player, visible).accepted).toBe(true);
    bag.remove(0); // Store the new axe before crafting the next result.
    expect(bench.craft('basic-pickaxe', bag, player, visible).accepted).toBe(true);
    expect(bag.count('stone')).toBe(1);
    expect(bag.count('scrap')).toBe(2);
    expect(CRAFT_RECIPES['basic-pickaxe'].output.level).toBe(1);
  });
});

describe('atomic craft inventory exchange', () => {
  it('uses slots released by the price and keeps active slot and backpack level', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 1 }], [2, { id: 'stone', itemId: 'stone', amount: 1 }], [3, { id: 'coal', itemId: 'coal', amount: 3 }], [4, { id: 'food', itemId: 'berries', amount: 5 }]]);
    bag.select(4);
    bag.upgradeBackpack(2);
    expect(bag.craft({ wood: 1, stone: 1 }, { id: 'result', itemId: 'axe', amount: 1, level: 1 }).accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ activeSlot: 4, level: 2 });
    expect(bag.getStack(1)?.id).toBe('result');
    expect(bag.getStack(0)?.id).toBe('axe');
  });

  it('rolls back the price if no result fits, the last ingredient is missing, or output is invalid', () => {
    const bag = new Inventory(3, [[0, { id: 'wood', itemId: 'wood', amount: 3 }], [1, { id: 'stone', itemId: 'stone', amount: 3 }], [2, { id: 'food', itemId: 'berries', amount: 5 }]]);
    const before = bag.snapshot();
    expect(bag.craft({ wood: 1, stone: 1 }, { id: 'result', itemId: 'axe', amount: 1 }).reason).toBe('inventory-full');
    expect(bag.craft({ wood: 1, scrap: 1 }, { id: 'result', itemId: 'axe', amount: 1 }).reason).toBe('insufficient-materials');
    expect(bag.craft({ wood: 1 }, { id: 'wood', itemId: 'axe', amount: 1 }).reason).toBe('invalid');
    expect(bag.craft({ wood: 1 }, { id: 'bad', itemId: 'axe', amount: 2 }).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
    expect(bag.craft({ wood: 3, stone: 1 }, { id: 'result', itemId: 'axe', amount: 1 }).accepted).toBe(true);
    expect(bag.getStack(0)?.id).toBe('result');
  });
});
