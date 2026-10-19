import { describe, expect, it } from 'vitest';
import { CAMPFIRE_LEVELS, TEST_MATERIAL_NODES, TEST_WORLD, type ItemId, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => null, canPlaceWorkbench: () => true, addWorkbenchCollider: () => {} };

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
