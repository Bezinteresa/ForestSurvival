import { describe, expect, it } from 'vitest';
import { BED_SITES, BUILD_SITES, FARM_SITES, CAMPFIRE_LEVELS, TEST_MATERIAL_NODES, TEST_WORLD, type ItemId, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => null, canPlaceWorkbench: () => true, addWorkbenchCollider: () => {}, canPlaceBuilding: () => true, activateBuildingCollider: () => {} };

describe('six-level campfire resource progression', () => {
  it('harvests the configured map with starter tools and buys all levels in a five-slot bag without debug', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'pick', itemId: 'pickaxe', amount: 1 }]]);
    const world = new GameplayWorld(queries, TEST_WORLD.trees, bag, TEST_MATERIAL_NODES);
    let now = 0;
    // Exercise ordinary hits and drops; movement/navigation is tested separately with Rapier.
    for (const node of world.getSnapshot(now).resources) {
      world.selectSlot(node.kind === 'tree' ? 0 : 1, now);
      const miner = { ...player, position: { ...node.position, y: 0.92, z: node.position.z - 1.6 } };
      for (let hit = 0; hit < (node.kind === 'tree' ? 4 : node.kind === 'scrap-pile' ? 2 : 3); hit++) {
        expect(world.useItem('mine-' + now, 0, now).accepted).toBe(true);
        world.update(now + 0.19, miner, 0);
        world.update(now + 0.66, miner, 0);
        now += 0.7;
      }
      expect(world.getSnapshot(now).resources.find((entry) => entry.id === node.id)?.exhausted).toBe(true);
    }
    const fuel = world.getSnapshot(now).campfire.fuelSeconds;
    for (const target of [2, 3, 4, 5, 6] as const) {
      const empty = bag.snapshot();
      expect(world.upgradeFire((target - 1) as 1 | 2 | 3 | 4 | 5, player, now).reason).toBe('insufficient-materials');
      expect(bag.snapshot()).toEqual(empty);
      for (const [material, amount] of Object.entries(CAMPFIRE_LEVELS[target].cost)) {
        const drops = world.getSnapshot(now).loot.filter((item) => item.itemId === material).slice(0, amount);
        expect(drops).toHaveLength(amount);
        for (const drop of drops) expect(world.pickup(drop.id, { ...player, position: { ...drop.position, y: 0.92 } }, now).accepted).toBe(true);
      }
      const before = bag.snapshot();
      expect(world.upgradeFire((target - 1) as 1 | 2 | 3 | 4 | 5, player, now).accepted).toBe(true);
      expect(world.getSnapshot(now).campfire).toMatchObject({ level: target, maxLevel: 6, zoneRadius: 5 + (target - 1) * 2, fuelSeconds: fuel });
      expect(bag.snapshot().slots.filter(Boolean)).toHaveLength(2);
      expect(world.upgradeFire((target - 1) as 1 | 2 | 3 | 4 | 5, player, now).reason).toBe('stale');
      expect(before.slots).toHaveLength(5);
    }
    const before = bag.snapshot();
    expect(world.upgradeFire(6, player, now).reason).toBe('max-level');
    expect(bag.snapshot()).toEqual(before);
    expect(world.getSnapshot(now).campfire.nextUpgrade).toBeNull();
    for (const material of ['wood', 'stone', 'scrap', 'coal'] as ItemId[]) {
      expect(world.getSnapshot(now).loot.filter((drop) => drop.itemId === material).length).toBeGreaterThanOrEqual(3);
    }
    const collect = (itemId: ItemId, amount: number) => {
      const drops = world.getSnapshot(now).loot.filter((drop) => drop.itemId === itemId).slice(0, amount);
      expect(drops).toHaveLength(amount);
      for (const drop of drops) expect(world.pickup(drop.id, { ...player, position: { ...drop.position, y: 0.92 } }, now).accepted).toBe(true);
    };
    const builder = { ...player, position: { x: 0.6, y: 0.92, z: -3 } };
    collect('wood', 3); collect('stone', 1);
    expect(world.buildWorkbench(builder, now).accepted).toBe(true);
    collect('wood', 1); collect('stone', 1);
    expect(world.craftItem('basic-axe', builder, now).accepted).toBe(true);
    collect('wood', 1); collect('scrap', 1);
    expect(world.craftItem('basic-pickaxe', builder, now).accepted).toBe(true);
    expect(world.getSnapshot(now).workbench).toMatchObject({ built: true, level: 1 });
    // Store spare basic tools so the ordinary five-slot bag can carry upgrade prices.
    for (const id of ['camp-workbench/crafted/0', 'camp-workbench/crafted/1']) {
      const slot = bag.snapshot().slots.findIndex((stack) => stack?.id === id);
      expect(world.transfer('deposit', slot, id, builder, now).accepted).toBe(true);
    }
    collect('wood', 2); collect('scrap', 1);
    expect(world.upgradeWorkbench(1, builder, now).accepted).toBe(true);
    collect('wood', 2); collect('stone', 1); collect('scrap', 2);
    expect(world.upgradeWorkbench(2, builder, now).accepted).toBe(true);
    expect(bag.snapshot().slots).toHaveLength(5);
    collect('wood', 3); collect('scrap', 2);
    expect(world.craftItem('expanded-backpack', builder, now).accepted).toBe(true);
    expect(bag.snapshot()).toMatchObject({ level: 2, slots: Array(8).fill(null).map((_, index) => index < 2 ? expect.anything() : null) });
    for (const recipe of ['reinforced-axe', 'reinforced-pickaxe']) {
      collect('wood', 1); collect('scrap', 2);
      expect(world.craftItem(recipe, builder, now).accepted).toBe(true);
    }
    expect(world.getSnapshot(now).workbench).toMatchObject({ built: true, level: 3, nextUpgrade: null });
    const remaining = (itemId: ItemId) => world.getSnapshot(now).loot.filter((item) => item.itemId === itemId).reduce((sum, item) => sum + item.amount, 0);
    expect(['wood', 'stone', 'scrap', 'coal'].map((id) => remaining(id as ItemId))).toEqual([31, 3, 12, 6]);
    // Six crates are the most expensive way to fill the general plots. Even then all four beds fit the budget.
    for (const site of BUILD_SITES) {
      collect('wood', 3); collect('scrap', 1);
      const near = { ...player, position: { ...site.position, y: 0.92, z: site.position.z - 2 } };
      expect(world.placeBuilding({ kind: 'storage', siteId: site.id, rotation: 0 }, near, now).accepted).toBe(true);
    }
    for (const site of BED_SITES) {
      collect('wood', 2); collect('scrap', 1);
      const near = { ...player, position: { ...site.position, y: 0.92, z: site.position.z - 2 } };
      expect(world.placeBuilding({ kind: 'bed', siteId: site.id, rotation: 0 }, near, now).accepted).toBe(true);
    }
    expect(world.getSnapshot(now).bedIds).toHaveLength(4);
    expect(['wood', 'stone', 'scrap', 'coal'].map((id) => remaining(id as ItemId))).toEqual([5, 3, 2, 6]);
    collect('stone', 2); collect('scrap', 2);
    expect(world.placeBuilding({ kind: 'cooking-pot', siteId: 'pot-plot-1', rotation: 0 }, player, now).accepted).toBe(true);
    expect(world.getSnapshot(now).cookingPot.built).toBe(true);
    expect(['wood', 'stone', 'scrap', 'coal'].map((id) => remaining(id as ItemId))).toEqual([5, 1, 0, 6]);
    for (const site of FARM_SITES) {
      collect('wood', 2);
      expect(world.placeBuilding({ kind: 'farm', siteId: site.id, rotation: 0 }, { ...player, position: { ...site.position, y: 0.92, z: site.position.z - 2 } }, now).accepted).toBe(true);
    }
    expect(world.getSnapshot(now).farms).toHaveLength(2);
    expect(['wood', 'stone', 'scrap', 'coal'].map((id) => remaining(id as ItemId))).toEqual([1, 1, 0, 6]);
    expect(world.isWarm({ x: 14.99, y: 0.92, z: 2.8 })).toBe(true);
    expect(world.isWarm({ x: 15.01, y: 0.92, z: 2.8 })).toBe(false);
    world.step(60);
    expect(world.getSnapshot(now).campfire).toMatchObject({ level: 6, zoneRadius: 15, safeRadius: 0 });
    const coal = world.getSnapshot(now).loot.find((drop) => drop.itemId === 'coal')!;
    world.pickup(coal.id, { ...player, position: { ...coal.position, y: 0.92 } }, now);
    const slot = bag.snapshot().slots.findIndex((stack) => stack?.itemId === 'coal');
    expect(world.fuelFire(slot, bag.getStack(slot)!.id, player, now).accepted).toBe(true);
    expect(world.getSnapshot(now).campfire).toMatchObject({ level: 6, safeRadius: 15, fuelSeconds: 60 });
  });
});
