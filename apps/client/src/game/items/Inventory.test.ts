import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, type ItemStack } from '@forest-survival/shared';
import { Inventory } from './Inventory';

const wood = (id: string, amount = 1): ItemStack => ({ id, itemId: 'wood', amount });
const axe: ItemStack = { id: 'axe', itemId: 'axe', amount: 1 };

describe('slot inventory transactions', () => {
  it('spends a complete material price across split stacks while preserving remaining IDs, tools and food', () => {
    const bag = new Inventory(6, [[0, axe], [1, wood('a', 2)], [2, wood('b', 3)], [3, { id: 'stone', itemId: 'stone', amount: 3 }], [4, { id: 'food', itemId: 'berries', amount: 2 }]]);
    bag.select(2);
    expect(bag.spendMaterials({ wood: 3, stone: 2 }).accepted).toBe(true);
    expect(bag.getStack(1)).toBeNull();
    expect(bag.getStack(2)).toEqual(wood('b', 2));
    expect(bag.getStack(3)).toEqual({ id: 'stone', itemId: 'stone', amount: 1 });
    expect(bag.getStack(0)).toEqual(axe);
    expect(bag.getStack(4)).toEqual({ id: 'food', itemId: 'berries', amount: 2 });
    expect(bag.selectedSlot).toBe(2);
  });

  it('keeps every material on a missing final ingredient or an invalid price', () => {
    const bag = new Inventory(5, [[0, axe], [1, wood('wood', 3)], [2, { id: 'stone', itemId: 'stone', amount: 2 }]]);
    const before = bag.snapshot();
    expect(bag.spendMaterials({ wood: 3, stone: 3 }).reason).toBe('insufficient-materials');
    for (const cost of [{}, { wood: 0 }, { stone: -1 }, { wood: NaN }, { scrap: 0.5 }, { wood: Infinity }]) expect(bag.spendMaterials(cost).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
  });

  it('fills existing stacks before empty slots and keeps tools unique', () => {
    const bag = new Inventory(3, [[0, axe]]);
    expect(bag.insert(wood('a', 2)).accepted).toBe(true);
    expect(bag.insert(wood('b', 3)).accepted).toBe(true);
    expect(bag.snapshot().slots.map((stack) => stack?.amount)).toEqual([1, 3, 2]);
    expect(bag.count('wood')).toBe(5);
    expect(bag.insert(axe).accepted).toBe(false);
    expect(bag.insert(wood('c')).accepted).toBe(true);
    expect(bag.insert(wood('d')).reason).toBe('inventory-full');
    expect(bag.count('wood')).toBe(6);
  });

  it('rolls back the entire insert when only part of the incoming stack would fit', () => {
    const bag = new Inventory(2, [[0, axe], [1, wood('a', 2)]]);
    const before = bag.snapshot();
    expect(bag.insert(wood('b', 3)).reason).toBe('inventory-full');
    expect(bag.snapshot()).toEqual(before);
  });

  it('merges partially, moves to an empty slot and swaps a tool without losing items', () => {
    const bag = new Inventory(4, [[0, axe], [1, wood('a', 2)], [2, wood('b', 2)]]);
    expect(bag.move(1, 2).accepted).toBe(true);
    expect(bag.getStack(1)).toEqual(wood('a'));
    expect(bag.getStack(2)).toEqual(wood('b', 3));
    expect(bag.move(2, 3).accepted).toBe(true);
    expect(bag.move(0, 3).accepted).toBe(true);
    expect(bag.getStack(3)).toEqual(axe);
    expect(bag.equippedItem).toBe('none');
    bag.select(3);
    expect(bag.equippedItem).toBe('axe');
    expect(bag.count('wood')).toBe(4);
  });

  it('rejects invalid operations and isolates snapshots from the stored state', () => {
    const bag = new Inventory();
    const before = bag.snapshot();
    for (const slot of [-1, 5, 0.5, Number.NaN]) {
      expect(bag.select(slot).reason).toBe('invalid');
      expect(bag.move(0, slot).reason).toBe('invalid');
      expect(bag.remove(slot)).toBeNull();
    }
    expect(bag.insert(wood('zero', 0)).accepted).toBe(false);
    expect(bag.insert(wood('too-many', 4)).accepted).toBe(false);
    expect(bag.snapshot()).toEqual(before);
    const copy = bag.snapshot().slots[0]!;
    (copy as { amount: number }).amount = 100;
    expect(bag.getStack(0)?.amount).toBe(1);
  });

  it('conserves totals across a sequence of moves, drops and pickups', () => {
    const bag = new Inventory();
    const ground: ItemStack[] = Array.from({ length: 15 }, (_,index) => wood('wood-' + index));
    let random = 12345;
    const next = (max: number) => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % max; };
    for (let operation = 0; operation < 500; operation++) {
      const slot = next(5);
      switch (next(3)) {
        case 0: bag.move(slot, next(5)); break;
        case 1: { const stack = bag.remove(slot); if (stack) ground.push(stack); break; }
        case 2: {
          if (ground.length) { const index = next(ground.length); if (bag.insert(ground[index]!).accepted) ground.splice(index, 1); }
          break;
        }
      }
      const all = [...bag.snapshot().slots.filter((entry): entry is ItemStack => entry !== null), ...ground];
      expect(all.filter((entry) => entry.itemId === 'wood').reduce((sum, entry) => sum + entry.amount, 0)).toBe(15);
      expect(all.filter((entry) => entry.itemId === 'axe')).toHaveLength(1);
      expect(new Set(all.map((entry) => entry.id)).size).toBe(all.length);
      for (const stack of all) expect(stack.amount).toBeLessThanOrEqual(ITEM_DEFINITIONS[stack.itemId].stackLimit);
    }
  });
});
