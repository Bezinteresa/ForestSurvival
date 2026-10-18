export type ItemId = 'axe' | 'wood';

export const ITEM_DEFINITIONS = {
  axe: { label: 'Топор', stackLimit: 1 },
  wood: { label: 'Древесина', stackLimit: 3 },
} as const satisfies Record<ItemId, { label: string; stackLimit: number }>;

export interface ItemStack {
  readonly id: string;
  readonly itemId: ItemId;
  readonly amount: number;
}

export interface InventorySnapshot {
  readonly slots: readonly (ItemStack | null)[];
  readonly activeSlot: number;
}

export const INVENTORY_CONFIG = { slotCount: 5, dropDistance: 1.2, dropHalfSize: 0.3, dropHeight: 0.23 } as const;
