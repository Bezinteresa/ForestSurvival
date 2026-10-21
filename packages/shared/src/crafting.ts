import type { ItemStack, MaterialCost } from './items';
import type { Vector3Data } from './index';

export const WORKBENCH_CONFIG = {
  id: 'camp-workbench',
  position: { x: 2, y: 0.57, z: -3 },
  halfSize: { x: 0.75, y: 0.55, z: 0.45 },
  range: 2.6,
  buildCost: { wood: 3, stone: 1 },
} as const;

export type WorkbenchLevel = 1 | 2 | 3;
export const WORKBENCH_MAX_LEVEL: WorkbenchLevel = 3;
export const WORKBENCH_LEVELS = {
  1: { cost: {} },
  2: { cost: { wood: 2, scrap: 1 } },
  3: { cost: { wood: 2, stone: 1, scrap: 2 } },
} as const satisfies Record<WorkbenchLevel, { cost: MaterialCost }>;

export interface WorkbenchUpgrade { readonly level: WorkbenchLevel; readonly cost: MaterialCost }
export function nextWorkbenchUpgrade(level: WorkbenchLevel): WorkbenchUpgrade | null {
  const next = level < WORKBENCH_MAX_LEVEL ? (level + 1) as WorkbenchLevel : null;
  return next ? { level: next, cost: { ...WORKBENCH_LEVELS[next].cost } } : null;
}

interface RecipeBase {
  readonly id: string;
  readonly label: string;
  readonly minLevel: WorkbenchLevel;
  readonly cost: MaterialCost;
}
/** Items made at the workbench. Placed camp objects (storage, beds, traps...) are buildings, not recipes. */
export type CraftRecipe = RecipeBase & { readonly kind: 'item'; readonly output: Omit<ItemStack, 'id'> };

// As in the reference game the workbench does not make tools: axes, pickaxes and the bigger
// backpack are found beyond the fog (TEST_SUPPLIES), so the campfire level opens equipment.
export const CRAFT_RECIPES = {
  map: { id: 'map', label: 'Карта', kind: 'item', minLevel: 1, cost: { wood: 3 }, output: { itemId: 'map', amount: 1 } },
  compass: { id: 'compass', label: 'Компас', kind: 'item', minLevel: 2, cost: { scrap: 3 }, output: { itemId: 'compass', amount: 1 } },
} as const satisfies Record<string, CraftRecipe>;
/** Reference workbench entries that have no working mechanic yet; shown as locked so the catalog stays honest. */
export const DEFERRED_WORKBENCH_ITEMS = [
  { label: 'Шкаф для костюмов', minLevel: 1, reason: 'косметика — после профиля и магазина' },
  { label: 'Солнечные часы', minLevel: 2, reason: 'часы уже на экране; отдельная механика не решена' },
  { label: 'Обычная кровать', minLevel: 2, reason: 'уровни кроватей — после баланса множителя' },
  { label: 'Бесконечный резервуар', minLevel: 2, reason: 'в игре пока нет воды' },
  { label: 'Полка', minLevel: 2, reason: 'нужна система размещения предметов' },
  { label: 'Деревянные ворота', minLevel: 2, reason: 'нужны двери и ограждение' },
  { label: 'Капкан на медведя', minLevel: 2, reason: 'нужны враги (T043+)' },
] as const;
export type RecipeId = keyof typeof CRAFT_RECIPES;

export interface WorkbenchSnapshot {
  readonly id: string;
  readonly position: Vector3Data;
  readonly built: boolean;
  readonly level: 0 | WorkbenchLevel;
  readonly maxLevel: WorkbenchLevel;
  readonly nextUpgrade: WorkbenchUpgrade | null;
  readonly inReach: boolean;
  readonly buildCost: MaterialCost;
}
