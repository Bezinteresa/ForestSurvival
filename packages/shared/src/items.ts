export type ToolId = 'axe' | 'pickaxe';
export type MaterialId = 'wood' | 'stone' | 'scrap' | 'coal';
export type FuelId = 'wood' | 'coal';
export type MaterialCost = Readonly<Partial<Record<MaterialId, number>>>;
export type FoodId = 'berries' | 'raw-meat' | 'cooked-meat' | 'meat-soup' | 'carrot' | 'carrot-stew';
export type MedicalId = 'bandage' | 'medkit';
/** Items spent from a slot to apply hunger and/or health effects. */
export type ConsumableId = FoodId | MedicalId;
/** Equipment that works while carried (map, compass) or is applied once (large backpack). */
export type GearId = 'map' | 'compass' | 'large-backpack';
export type ItemId = ToolId | MaterialId | ConsumableId | GearId;
export type ItemCost = Readonly<Partial<Record<ItemId, number>>>;
export type UpgradeLevel = 1 | 2;

export const ITEM_DEFINITIONS = {
  axe: { label: 'Топор', stackLimit: 1 },
  pickaxe: { label: 'Кирка', stackLimit: 1 },
  map: { label: 'Карта', stackLimit: 1 },
  compass: { label: 'Компас', stackLimit: 1 },
  'large-backpack': { label: 'Большой рюкзак', stackLimit: 1 },
  wood: { label: 'Древесина', stackLimit: 3 },
  stone: { label: 'Камень', stackLimit: 3 },
  scrap: { label: 'Металлолом', stackLimit: 3 },
  coal: { label: 'Уголь', stackLimit: 3 },
  berries: { label: 'Ягоды', stackLimit: 5 },
  carrot: { label: 'Морковь', stackLimit: 5 },
  'carrot-stew': { label: 'Морковное рагу', stackLimit: 3 },
  'raw-meat': { label: 'Сырое мясо', stackLimit: 5 },
  'cooked-meat': { label: 'Жареное мясо', stackLimit: 5 },
  'meat-soup': { label: 'Мясная похлёбка', stackLimit: 3 },
  bandage: { label: 'Бинт', stackLimit: 3 },
  medkit: { label: 'Аптечка', stackLimit: 1 },
} as const satisfies Record<ItemId, { label: string; stackLimit: number }>;

export function isGear(itemId: ItemId): itemId is GearId { return itemId === 'map' || itemId === 'compass' || itemId === 'large-backpack'; }
export function isTool(itemId: ItemId): itemId is ToolId { return itemId === 'axe' || itemId === 'pickaxe'; }
export function isFood(itemId: ItemId): itemId is FoodId { return itemId === 'berries' || itemId === 'raw-meat' || itemId === 'cooked-meat' || itemId === 'meat-soup' || itemId === 'carrot' || itemId === 'carrot-stew'; }
export function isMedical(itemId: ItemId): itemId is MedicalId { return itemId === 'bandage' || itemId === 'medkit'; }
export function isConsumable(itemId: ItemId): itemId is ConsumableId { return isFood(itemId) || isMedical(itemId); }
export function isFuel(itemId: ItemId): itemId is FuelId { return itemId === 'wood' || itemId === 'coal'; }
export function itemLabel(stack: ItemStack): string { return ITEM_DEFINITIONS[stack.itemId].label + (isTool(stack.itemId) ? ' · ур. ' + (stack.level ?? 1) : ''); }

export interface ItemStack {
  readonly id: string;
  readonly itemId: ItemId;
  readonly amount: number;
  readonly level?: UpgradeLevel;
}

export interface InventorySnapshot {
  readonly slots: readonly (ItemStack | null)[];
  readonly activeSlot: number;
  readonly level: UpgradeLevel;
}

export const BACKPACK_LEVELS = { 1: 5, 2: 8 } as const;
export const TOOL_LEVELS = {
  1: { damageMultiplier: 1, windup: 0.18, recovery: 0.47 },
  2: { damageMultiplier: 2, windup: 0.18, recovery: 0.35 },
} as const;
export const TOOL_DAMAGE = { axe: 25, pickaxe: 30 } as const;
export const INVENTORY_CONFIG = { slotCount: BACKPACK_LEVELS[1], hotbarCount: 5, dropDistance: 1.2, dropHalfSize: 0.3, dropHeight: 0.23 } as const;
