import { BACKPACK_LEVELS, INVENTORY_CONFIG, ITEM_DEFINITIONS, isTool, type CommandResult, type InventorySnapshot, type ItemId, type ItemStack, type EquippedItemId, type UpgradeLevel, type MaterialCost, type ItemCost } from '@forest-survival/shared';

export class Inventory {
  private slots: Array<ItemStack | null>;
  private activeSlot = 0;
  private level: UpgradeLevel = 1;

  constructor(slotCount: number = INVENTORY_CONFIG.slotCount, initial: ReadonlyArray<readonly [number, ItemStack]> = [[0, { id: 'starter-axe', itemId: 'axe', amount: 1 }]]) {
    if (!Number.isInteger(slotCount) || slotCount < 1) throw new Error('Invalid inventory size');
    this.slots = Array.from({ length: slotCount }, () => null);
    for (const [slot, stack] of initial) {
      if (!this.validSlot(slot) || !this.validStack(stack) || this.slots[slot] || this.slots.some((entry) => entry?.id === stack.id)) throw new Error('Invalid initial inventory');
      this.slots[slot] = { ...stack };
    }
  }

  get equippedItem(): EquippedItemId { const item = this.slots[this.activeSlot]; return item && isTool(item.itemId) ? item.itemId : 'none'; }
  get selectedSlot(): number { return this.activeSlot; }
  getStack(slot: number): ItemStack | null { const stack = this.slots[slot]; return stack ? { ...stack } : null; }
  count(itemId: ItemId): number { return this.slots.reduce((total, stack) => total + (stack?.itemId === itemId ? stack.amount : 0), 0); }
  capacityFor(itemId: ItemId): number { return this.slots.reduce((total, stack) => total + (!stack || stack.itemId === itemId ? ITEM_DEFINITIONS[itemId].stackLimit : 0), 0); }
  snapshot(): InventorySnapshot { return { activeSlot: this.activeSlot, level: this.level, slots: this.slots.map((stack) => stack ? { ...stack } : null) }; }

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

  consume(slot: number, expectedItemId: string, amount = 1): CommandResult {
    if (!this.validSlot(slot) || !Number.isInteger(amount) || amount < 1) return { accepted: false, reason: 'invalid' };
    const stack = this.slots[slot];
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (stack.amount < amount) return { accepted: false, reason: 'invalid' };
    this.slots[slot] = stack.amount === amount ? null : { ...stack, amount: stack.amount - amount };
    return { accepted: true };
  }

  spendMaterials(cost: MaterialCost): CommandResult {
    if (Object.keys(cost).some((itemId) => !['wood', 'stone', 'scrap', 'coal'].includes(itemId))) return { accepted: false, reason: 'invalid' };
    return this.spendItems(cost);
  }

  spendItems(cost: ItemCost): CommandResult {
    const entries = Object.entries(cost);
    if (!entries.length || entries.some(([itemId, amount]) => !Object.hasOwn(ITEM_DEFINITIONS, itemId) || !Number.isSafeInteger(amount) || amount <= 0)) return { accepted: false, reason: 'invalid' };
    const next = this.slots.map((stack) => stack ? { ...stack } : null);
    for (const [itemId, amount] of entries) {
      let remaining = amount;
      for (let slot = 0; slot < next.length && remaining > 0; slot++) {
        const stack = next[slot];
        if (!stack || stack.itemId !== itemId) continue;
        const used = Math.min(remaining, stack.amount);
        next[slot] = used === stack.amount ? null : { ...stack, amount: stack.amount - used };
        remaining -= used;
      }
      if (remaining > 0) return { accepted: false, reason: 'insufficient-materials' };
    }
    this.slots = next;
    return { accepted: true };
  }

  transferTo(destination: Inventory, slot: number, expectedItemId: string): CommandResult {
    if (destination === this || !this.validSlot(slot)) return { accepted: false, reason: 'invalid' };
    const stack = this.getStack(slot);
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    const inserted = destination.insert(stack);
    if (!inserted.accepted) return inserted;
    this.remove(slot);
    return { accepted: true };
  }

  craft(cost: MaterialCost, output: ItemStack): CommandResult {
    if (!this.validStack(output) || this.slots.some((stack) => stack?.id === output.id)) return { accepted: false, reason: 'invalid' };
    const draft = this.copyForCraft();
    const spent = draft.spendMaterials(cost);
    if (!spent.accepted) return spent;
    const inserted = draft.insert(output);
    if (!inserted.accepted) return inserted;
    this.slots = draft.slots;
    return { accepted: true };
  }

  /** Spends a carried large backpack and widens this inventory in one step; a second one is refused unspent. */
  applyBackpackItem(slot: number, expectedItemId: string): CommandResult {
    const stack = this.validSlot(slot) ? this.slots[slot] : null;
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (stack.itemId !== 'large-backpack') return { accepted: false, reason: 'invalid' };
    if (this.level >= 2) return { accepted: false, reason: 'max-level' };
    this.slots[slot] = null;
    return this.upgradeBackpack(2);
  }

  private copyForCraft(): Inventory {
    const initial: Array<readonly [number, ItemStack]> = [];
    this.slots.forEach((stack, slot) => { if (stack) initial.push([slot, stack]); });
    const draft = new Inventory(this.slots.length, initial);
    draft.activeSlot = this.activeSlot;
    draft.level = this.level;
    return draft;
  }

  upgradeTool(slot: number, level: UpgradeLevel): CommandResult {
    if (!this.validSlot(slot) || level !== 2) return { accepted: false, reason: 'invalid' };
    const stack = this.slots[slot];
    if (!stack || !isTool(stack.itemId)) return { accepted: false, reason: 'invalid' };
    if ((stack.level ?? 1) >= level) return { accepted: false, reason: 'invalid' };
    this.slots[slot] = { ...stack, level };
    return { accepted: true };
  }

  upgradeBackpack(level: UpgradeLevel): CommandResult {
    if (level !== 2 || level <= this.level) return { accepted: false, reason: 'invalid' };
    while (this.slots.length < BACKPACK_LEVELS[level]) this.slots.push(null);
    this.level = level;
    return { accepted: true };
  }

  remove(slot: number): ItemStack | null {
    if (!this.validSlot(slot)) return null;
    const stack = this.getStack(slot);
    this.slots[slot] = null;
    return stack;
  }

  private validSlot(slot: number): boolean { return Number.isInteger(slot) && slot >= 0 && slot < this.slots.length; }
  private validStack(stack: ItemStack): boolean { return !!stack.id && Object.hasOwn(ITEM_DEFINITIONS, stack.itemId) && Number.isInteger(stack.amount) && stack.amount > 0 && stack.amount <= ITEM_DEFINITIONS[stack.itemId].stackLimit && (stack.level === undefined || (isTool(stack.itemId) && (stack.level === 1 || stack.level === 2))); }
}
