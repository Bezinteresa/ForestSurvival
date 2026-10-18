import { describe, expect, it, vi } from 'vitest';
import type { MaterialNodeDefinition, PlayerSnapshot, TreeDefinition } from '@forest-survival/shared';
import { GameplayWorld } from '../world/GameplayWorld';
import { Inventory } from '../items/Inventory';

const player: PlayerSnapshot = { id: 'local-player', position: { x: 0, y: 0.92, z: 0 }, grounded: true, yaw: 0 };
const node: MaterialNodeDefinition = { id: 'rock', kind: 'rock', position: { x: 0, y: 0, z: 1.7 }, radius: 0.6, height: 1.2 };
const tree: TreeDefinition = { id: 'tree', position: { x: 0, y: 0, z: 1.7 }, radius: 0.4, trunkHeight: 2.4 };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => ({ x: 0, y: 0.23, z: 1 }) }; }
function hit(world: GameplayWorld, time: number) {
  expect(world.useItem('hit-' + time, 0, time).accepted).toBe(true);
  world.update(time + 0.19, player, 0);
  world.update(time + 0.66, player, 0);
}

describe('material nodes and tool upgrades', () => {
  it('rejects an axe on stone and produces exactly three stone items after three pickaxe hits', () => {
    const visibility = queries();
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'pick', itemId: 'pickaxe', amount: 1 }]]);
    const world = new GameplayWorld(visibility, [], bag, [node]);
    hit(world, 0);
    expect(world.getSnapshot(0.7).resources[0]?.health).toBe(90);
    expect(world.getSnapshot(0.7).feedback?.text).toContain('Кирка');
    world.selectSlot(1, 0.7);
    for (let index = 1; index <= 3; index++) hit(world, index * 0.7);
    const snapshot = world.getSnapshot(3);
    expect(snapshot.resources[0]?.exhausted).toBe(true);
    expect(snapshot.loot.map((item) => item.itemId)).toEqual(['stone', 'stone', 'stone']);
    expect(new Set(snapshot.loot.map((item) => item.id)).size).toBe(3);
    expect(visibility.removeEntityCollider).toHaveBeenCalledExactlyOnceWith(node.id);
    hit(world, 3.5);
    expect(world.getSnapshot(4.2).loot).toHaveLength(3);
  });

  it('produces two scrap items using a pickaxe and preserves a tree against that tool', () => {
    const bag = new Inventory(5, [[0, { id: 'pick', itemId: 'pickaxe', amount: 1 }]]);
    const scrap = new GameplayWorld(queries(), [], bag, [{ ...node, kind: 'scrap-pile' }]);
    hit(scrap, 0);
    expect(scrap.getSnapshot(0.7).resources[0]?.health).toBe(30);
    hit(scrap, 0.7);
    expect(scrap.getSnapshot(1.4).loot.map((item) => item.itemId)).toEqual(['scrap', 'scrap']);
    const trees = new GameplayWorld(queries(), [tree], bag);
    hit(trees, 0);
    expect(trees.getSnapshot(0.7).resources[0]?.health).toBe(100);
  });

  it('still applies visibility checks to the correct tool', () => {
    const visibility = queries();
    visibility.hasLineOfSight.mockReturnValue(false);
    const bag = new Inventory(5, [[0, { id: 'pick', itemId: 'pickaxe', amount: 1 }]]);
    const world = new GameplayWorld(visibility, [], bag, [node]);
    hit(world, 0);
    expect(world.getSnapshot(0.7).resources[0]?.health).toBe(90);
    expect(world.getSnapshot(0.7).loot).toHaveLength(0);
  });

  it('uses two level-two axe hits and its shorter recovery without allowing mid-swing upgrades', () => {
    const world = new GameplayWorld(queries(), [tree], new Inventory(), [], true);
    expect(world.debugUpgrade('tool', 0, 2, 0).accepted).toBe(true);
    world.useItem('first', 0, 0);
    expect(world.debugUpgrade('backpack', 0, 2, 0.1).reason).toBe('busy');
    world.update(0.18, player, 0);
    expect(world.getSnapshot(0.18).resources[0]?.health).toBe(50);
    expect(world.useItem('spam', 0, 0.52).reason).toBe('busy');
    world.update(0.54, player, 0);
    expect(world.useItem('second', 0, 0.54).accepted).toBe(true);
    world.update(0.73, player, 0);
    expect(world.getSnapshot(0.73).resources[0]?.exhausted).toBe(true);
    expect(world.getSnapshot(0.73).loot).toHaveLength(3);
    const normal = new GameplayWorld(queries(), [tree]);
    normal.useItem('base', 0, 0);
    normal.update(0.54, player, 0);
    expect(normal.useItem('base-too-early', 0, 0.54).reason).toBe('busy');
  });

  it('keeps an upgraded tool instance and level when dropped and picked up', () => {
    const world = new GameplayWorld(queries(), [], new Inventory(5, [[0, { id: 'pick', itemId: 'pickaxe', amount: 1 }]]), [], true);
    world.debugUpgrade('tool', 0, 2, 0);
    expect(world.drop(0, player, 0, 0).accepted).toBe(true);
    expect(world.getSnapshot(0).loot[0]?.level).toBe(2);
    expect(world.pickup('pick', player, 0.1).accepted).toBe(true);
    expect(world.getSnapshot(0.1).inventory.slots[0]).toEqual({ id: 'pick', itemId: 'pickaxe', amount: 1, level: 2 });
  });

  it('adds backpack slots without adding or changing any carried item', () => {
    const bag = new Inventory(5, Array.from({ length: 5 }, (_, slot) => [slot, { id: 'wood-' + slot, itemId: 'wood' as const, amount: 3 }] as const));
    const before = bag.snapshot().slots;
    expect(bag.insert({ id: 'stone', itemId: 'stone', amount: 3 }).reason).toBe('inventory-full');
    expect(bag.upgradeBackpack(2).accepted).toBe(true);
    expect(bag.snapshot().slots).toHaveLength(8);
    expect(bag.snapshot().slots.slice(0, 5)).toEqual(before);
    expect(bag.count('wood')).toBe(15);
    expect(bag.insert({ id: 'stone', itemId: 'stone', amount: 3 }).accepted).toBe(true);
    const after = bag.snapshot();
    expect(bag.upgradeBackpack(2).accepted).toBe(false);
    expect(bag.snapshot()).toEqual(after);
  });
});
