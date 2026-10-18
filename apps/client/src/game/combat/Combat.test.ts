import { describe, expect, it, vi } from 'vitest';
import { AXE_CONFIG, RESOURCE_CONFIG, TRAINING_DUMMY, type DamageInfo, type PlayerSnapshot, type TreeDefinition } from '@forest-survival/shared';
import { AttackController } from './AttackController';
import { DamageReceiver } from './DamageReceiver';
import { selectTarget } from './TargetQuery';
import { GameplayWorld } from '../world/GameplayWorld';
import { Inventory } from '../items/Inventory';

const player: PlayerSnapshot = { id: 'local-player', position: { x: 0, y: 0.92, z: 0 }, grounded: true, yaw: 0 };
const tree: TreeDefinition = { id: 'test-tree', position: { x: 0, y: 0, z: 1.5 }, radius: 0.4, trunkHeight: 2.4 };

function setup(slots: number = 5, trees: readonly TreeDefinition[] = [tree]) {
  const visibility = { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: vi.fn(() => ({ x: 0, y: 0.23, z: 1 })) };
  return { world: new GameplayWorld(visibility, trees, new Inventory(slots)), visibility };
}

function fell(world: GameplayWorld) {
  for (let i = 0; i < 4; i++) {
    const time = i * 0.7;
    expect(world.useItem('cut-' + i, 0, time).accepted).toBe(true);
    world.update(time + AXE_CONFIG.windup + 0.01, player, 0);
    world.update(time + 0.66, player, 0);
  }
}

describe('damage and swing rules', () => {
  it('applies one attack only once and never lets health go negative', () => {
    const receiver = new DamageReceiver('target', 40, 'axe');
    const info: DamageInfo = { attackId: 'one', sourceId: 'player', targetId: 'target', amount: 25, tool: 'axe', kind: 'melee' };
    expect(receiver.receiveDamage(info).applied).toBe(true);
    expect(receiver.receiveDamage(info).applied).toBe(false);
    expect(receiver.currentHealth).toBe(15);
    expect(receiver.receiveDamage({ ...info, attackId: 'two' }).defeated).toBe(true);
    expect(receiver.currentHealth).toBe(0);
    expect(receiver.receiveDamage({ ...info, attackId: 'three' }).applied).toBe(false);
  });

  it('does not damage trees with an empty hand or invalid damage', () => {
    const receiver = new DamageReceiver('tree', 100, 'axe');
    const info: DamageInfo = { attackId: 'one', sourceId: 'player', targetId: 'tree', amount: 25, tool: 'none', kind: 'melee' };
    expect(receiver.receiveDamage(info).applied).toBe(false);
    expect(receiver.receiveDamage({ ...info, tool: 'axe', amount: Number.NaN }).applied).toBe(false);
    expect(receiver.currentHealth).toBe(100);
  });

  it('separates windup, a single hit and recovery, rejecting click spam', () => {
    const attack = new AttackController();
    expect(attack.begin('one', 0, 0)).toBe(true);
    expect(attack.update(0.1)).toBeNull();
    expect(attack.getSnapshot(0.1).phase).toBe('windup');
    expect(attack.begin('spam', 0, 0.11)).toBe(false);
    expect(attack.update(0.18)).toEqual({ id: 'one', yaw: 0 });
    expect(attack.update(0.2)).toBeNull();
    expect(attack.getSnapshot(0.2).phase).toBe('recovery');
    attack.update(0.65);
    expect(attack.getSnapshot(0.65).phase).toBe('idle');
    expect(attack.begin('two', 0, 0.66)).toBe(true);
  });

  it('rejects targets behind, too far away, too high and blocked by geometry', () => {
    const visibility = { hasLineOfSight: () => true };
    const origin = { x: 0, y: 1, z: 0 };
    for (const position of [{ x: 0, y: 1, z: -1 }, { x: 0, y: 1, z: 10 }, { x: 0, y: 5, z: 1 }]) {
      expect(selectTarget([{ id: 'bad', position, radius: 0.2 }], origin, 0, 2.2, Math.PI / 3, 1.25, visibility)).toBeNull();
    }
    expect(selectTarget([{ id: 'blocked', position: { x: 0, y: 1, z: 1 }, radius: 0.2 }], origin, 0, 2.2, Math.PI / 3, 1.25, { hasLineOfSight: () => false })).toBeNull();
  });

  it('hits only the nearest valid target in a swing', () => {
    const { world } = setup(12, [tree, { ...tree, id: 'second', position: { x: 0.2, y: 0, z: 2 } }]);
    world.useItem('one', 0, 0);
    world.update(0.18, player, 0);
    world.update(0.3, player, 0);
    expect(world.getSnapshot(0.3).resources.map((entry) => entry.health)).toEqual([75, 100]);
  });
});

describe('resource transactions', () => {
  it('keeps ground loot intact when a full bag or partial fit rejects pickup', () => {
    const inventory = new Inventory(2, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'full', itemId: 'wood', amount: 3 }]]);
    const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => ({ x: 0, y: 0.23, z: 1 }) };
    const world = new GameplayWorld(queries, [tree], inventory);
    fell(world);
    const collector = { ...player, position: { x: 0, y: 0.92, z: 1 } };
    const id = world.getSnapshot(3).loot[0]!.id;
    expect(world.pickup(id, collector, 3).reason).toBe('inventory-full');
    expect(world.getSnapshot(3).loot).toHaveLength(3);
    expect(world.drop(1, collector, 0, 3.01).accepted).toBe(true);
    expect(world.pickup(id, collector, 3.02).accepted).toBe(true);
    const before = world.getSnapshot(3.02);
    expect(world.pickup('full', collector, 3.03).reason).toBe('inventory-full');
    expect(world.getSnapshot(3.03).loot).toEqual(before.loot);
    expect(world.getSnapshot(3.03).bag.wood).toBe(1);
  });

  it('creates exactly three unique wood items once when a tree is exhausted', () => {
    const { world, visibility } = setup();
    fell(world);
    let snapshot = world.getSnapshot(3);
    expect(snapshot.resources[0]?.exhausted).toBe(true);
    expect(snapshot.loot.length).toBe(RESOURCE_CONFIG.woodPerTree);
    expect(new Set(snapshot.loot.map((item) => item.id)).size).toBe(3);
    expect(visibility.removeEntityCollider).toHaveBeenCalledExactlyOnceWith(tree.id);
    world.useItem('extra', 0, 3.5);
    world.update(3.7, player, 0);
    snapshot = world.getSnapshot(3.7);
    expect(snapshot.loot.length).toBe(3);
    expect(snapshot.bag.wood).toBe(0);
  });

  it('rejects repeated pickup and can recover a dropped stack', () => {
    const { world } = setup(2);
    // One tool slot and one wood stack: three units fit.
    fell(world);
    const items = world.getSnapshot(3).loot;
    const first = items[0]!, second = items[1]!;
    const collector = { ...player, position: { x: 0, y: 0.92, z: 1 } };
    expect(world.pickup(first.id, collector, 3).accepted).toBe(true);
    expect(world.pickup(first.id, collector, 3.01).reason).toBe('missing');
    expect(world.pickup(second.id, collector, 3.02).accepted).toBe(true);
    expect(world.pickup(items[2]!.id, collector, 3.03).accepted).toBe(true);
    // A full bag must preserve a freshly dropped stack on failed insertion.
    expect(world.drop(1, collector, 0, 3.04).accepted).toBe(true);
    expect(world.pickup(first.id, collector, 3.05).accepted).toBe(true);
    const snapshot = world.getSnapshot(3.02);
    expect(snapshot.bag.wood).toBe(3);
    expect(snapshot.loot).toHaveLength(0);
  });

  it('prevents remote and obstructed pickup without destroying items', () => {
    const { world, visibility } = setup();
    fell(world);
    const id = world.getSnapshot(3).loot[0]!.id;
    expect(world.pickup(id, { ...player, position: { x: 20, y: 0.92, z: 0 } }, 3).reason).toBe('out-of-range');
    visibility.hasLineOfSight.mockReturnValue(false);
    expect(world.pickup(id, player, 3).reason).toBe('blocked');
    expect(world.getSnapshot(3).loot).toHaveLength(3);
    expect(world.getSnapshot(3).bag.wood).toBe(0);
  });

  it('requires an equipped axe and prevents switching to cancel recovery', () => {
    const { world } = setup();
    expect(world.selectSlot(1, 0).accepted).toBe(true);
    expect(world.useItem('empty', 0, 0).reason).toBe('empty-hand');
    expect(world.selectSlot(0, 0).accepted).toBe(true);
    expect(world.useItem('axe', 0, 0).accepted).toBe(true);
    expect(world.selectSlot(1, 0.1).reason).toBe('busy');
  });

  it('damages the training dummy through the same pipeline without producing wood', () => {
    const { world, visibility } = setup();
    const nearDummy: PlayerSnapshot = { ...player, position: { x: TRAINING_DUMMY.position.x, y: 0.92, z: -2.8 }, yaw: Math.PI };
    for (let i = 0; i < 4; i++) {
      world.useItem('dummy-' + i, Math.PI, i * 0.7);
      world.update(i * 0.7 + 0.2, nearDummy, Math.PI);
    }
    expect(world.getSnapshot(3).dummy.dead).toBe(true);
    expect(world.getSnapshot(3).loot).toHaveLength(0);
    expect(visibility.removeEntityCollider).toHaveBeenCalledExactlyOnceWith(TRAINING_DUMMY.id);
  });
});
