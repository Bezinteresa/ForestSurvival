import { describe, expect, it } from 'vitest';
import type { ItemStack, PlayerSnapshot } from '@forest-survival/shared';
import { CampStorage } from './CampStorage';
import { Inventory } from './Inventory';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 0 }, grounded: true, yaw: 0 };
const visible = { hasLineOfSight: () => true, removeEntityCollider: () => {} };

describe('camp container transactions', () => {
  it('moves a tool both ways preserving its ID and upgrade level', () => {
    const tool: ItemStack = { id: 'pick', itemId: 'pickaxe', amount: 1, level: 2 };
    const storage = new CampStorage(new Inventory(2, [[0, tool]]));
    const bag = new Inventory();
    expect(storage.transfer(bag, 'withdraw', 0, tool.id, player, visible).accepted).toBe(true);
    expect(bag.getStack(1)).toEqual(tool);
    expect(storage.snapshot().slots[0]).toBeNull();
    expect(storage.transfer(bag, 'deposit', 1, tool.id, player, visible).accepted).toBe(true);
    expect(storage.snapshot().slots[0]).toEqual(tool);
    expect(bag.getStack(1)).toBeNull();
  });

  it('rejects partial capacity without changing either inventory', () => {
    const bag = new Inventory(2, [[0, { id: 'wood', itemId: 'wood', amount: 2 }]]);
    const storage = new CampStorage(new Inventory(1, [[0, { id: 'stored', itemId: 'wood', amount: 2 }]]));
    const before = { bag: bag.snapshot(), storage: storage.snapshot() };
    expect(storage.transfer(bag, 'deposit', 0, 'wood', player, visible).reason).toBe('inventory-full');
    expect(bag.snapshot()).toEqual(before.bag);
    expect(storage.snapshot()).toEqual(before.storage);
  });

  it('rejects stale slots, distant players and obstructed access', () => {
    const storage = new CampStorage();
    const bag = new Inventory();
    const before = storage.snapshot();
    expect(storage.transfer(bag, 'withdraw', 0, 'old-item-id', player, visible).reason).toBe('stale');
    expect(storage.transfer(bag, 'withdraw', 0, 'starter-pickaxe', { ...player, position: { x: 10, y: 0.92, z: 0 } }, visible).reason).toBe('out-of-range');
    expect(storage.transfer(bag, 'withdraw', 0, 'starter-pickaxe', player, { ...visible, hasLineOfSight: () => false }).reason).toBe('out-of-range');
    expect(storage.snapshot()).toEqual(before);
    expect(bag.getStack(1)).toBeNull();
  });

  it('conserves all material totals through mixed transfers, merges and failed transfers', () => {
    const bag = new Inventory(3, [[0, { id: 'wood', itemId: 'wood', amount: 3 }], [1, { id: 'stone', itemId: 'stone', amount: 2 }]]);
    const chest = new Inventory(2, [[0, { id: 'scrap', itemId: 'scrap', amount: 3 }], [1, { id: 'wood-other', itemId: 'wood', amount: 2 }]]);
    for (let index = 0; index < 120; index++) {
      const source = index % 2 ? bag : chest, target = index % 2 ? chest : bag;
      const snapshot = source.snapshot();
      const slot = index % snapshot.slots.length;
      const stack = snapshot.slots[slot];
      if (stack) source.transferTo(target, slot, stack.id);
      bag.move(index % 3, (index + 1) % 3);
      const all = [...bag.snapshot().slots, ...chest.snapshot().slots].filter((entry): entry is ItemStack => entry !== null);
      expect(all.filter((entry) => entry.itemId === 'wood').reduce((sum, entry) => sum + entry.amount, 0)).toBe(5);
      expect(all.filter((entry) => entry.itemId === 'stone').reduce((sum, entry) => sum + entry.amount, 0)).toBe(2);
      expect(all.filter((entry) => entry.itemId === 'scrap').reduce((sum, entry) => sum + entry.amount, 0)).toBe(3);
      expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length);
    }
  });
});
