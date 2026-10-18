import { INVENTORY_CONFIG, ITEM_DEFINITIONS, type CommandResult, type InventorySnapshot, type ItemId, type ItemStack } from '@forest-survival/shared';

export class Inventory {
  private slots: Array<ItemStack | null>;
  private activeSlot = 0;

  constructor(slotCount: number = INVENTORY_CONFIG.slotCount, initial: ReadonlyArray<readonly [number, ItemStack]> = [[0, { id: 'starter-axe', itemId: 'axe', amount: 1 }]]) {
    if (!Number.isInteger(slotCount) || slotCount < 1) throw new Error('Invalid inventory size');
    this.slots = Array.from({ length: slotCount }, () => null);
    for (const [slot, stack] of initial) {
      if (!this.validSlot(slot) || !this.validStack(stack) || this.slots[slot] || this.slots.some((entry) => entry?.id === stack.id)) throw new Error('Invalid initial inventory');
      this.slots[slot] = { ...stack };
    }
  }

  get equippedItem(): 'axe' | 'none' { return this.slots[this.activeSlot]?.itemId === 'axe' ? 'axe' : 'none'; }
  get selectedSlot(): number { return this.activeSlot; }
  getStack(slot: number): ItemStack | null { const stack = this.slots[slot]; return stack ? { ...stack } : null; }
  count(itemId: ItemId): number { return this.slots.reduce((total, stack) => total + (stack?.itemId === itemId ? stack.amount : 0), 0); }
  capacityFor(itemId: ItemId): number { return this.slots.reduce((total, stack) => total + (!stack || stack.itemId === itemId ? ITEM_DEFINITIONS[itemId].stackLimit : 0), 0); }
  snapshot(): InventorySnapshot { return { activeSlot: this.activeSlot, slots: this.slots.map((stack) => stack ? { ...stack } : null) }; }

  select(slot: number): CommandResult {
    if (!this.validSlot(slot)) return { accepted: false, reason: 'invalid' };
    this.activeSlot = slot;
    return { accepted: true };
  }

  insert(stack: ItemStack): CommandResult {
    if (!this.validStack(stack)) return { accepted: false, reason: 'invalid' };
    if (this.slots.some((entry) => entry?.id === stack.id)) return { accepted: false, reason: 'invalid' };
    const next = this.slots.map((entry) => entry ? { ...entry } : null);
    let remaining = stack.amount;
    const limit = ITEM_DEFINITIONS[stack.itemId].stackLimit;
    for (let index = 0; index < next.length && remaining > 0; index++) {
      const entry = next[index];
      if (!entry || entry.itemId !== stack.itemId || entry.amount === limit) continue;
      const added = Math.min(limit - entry.amount, remaining);
      next[index] = { ...entry, amount: entry.amount + added };
      remaining -= added;
    }
    if (remaining) {
      const empty = next.indexOf(null);
      if (empty < 0) return { accepted: false, reason: 'inventory-full' };
      next[empty] = { ...stack, amount: remaining };
    }
    this.slots = next;
    return { accepted: true };
  }

  move(from: number, to: number): CommandResult {
    if (!this.validSlot(from) || !this.validSlot(to) || from === to) return { accepted: false, reason: 'invalid' };
    const source = this.slots[from], target = this.slots[to];
    if (!source) return { accepted: false, reason: 'missing' };
    if (target?.itemId === source.itemId && ITEM_DEFINITIONS[source.itemId].stackLimit > 1) {
      const moved = Math.min(source.amount, ITEM_DEFINITIONS[source.itemId].stackLimit - target.amount);
      if (!moved) return { accepted: false, reason: 'inventory-full' };
      this.slots[to] = { ...target, amount: target.amount + moved };
      this.slots[from] = moved === source.amount ? null : { ...source, amount: source.amount - moved };
    } else {
      this.slots[to] = source;
      this.slots[from] = target ?? null;
    }
    return { accepted: true };
  }

  remove(slot: number): ItemStack | null {
    if (!this.validSlot(slot)) return null;
    const stack = this.getStack(slot);
    this.slots[slot] = null;
    return stack;
  }

  private validSlot(slot: number): boolean { return Number.isInteger(slot) && slot >= 0 && slot < this.slots.length; }
  private validStack(stack: ItemStack): boolean { return !!stack.id && Object.hasOwn(ITEM_DEFINITIONS, stack.itemId) && Number.isInteger(stack.amount) && stack.amount > 0 && stack.amount <= ITEM_DEFINITIONS[stack.itemId].stackLimit; }
}
