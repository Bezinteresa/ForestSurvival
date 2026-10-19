import type { ItemStack, MaterialCost, UpgradeLevel } from './items';
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
export type CraftRecipe = RecipeBase & (
  | { readonly kind: 'item'; readonly output: Omit<ItemStack, 'id'> }
  | { readonly kind: 'backpack'; readonly level: UpgradeLevel }
);

export const CRAFT_RECIPES = {
  'basic-axe': { id: 'basic-axe', label: 'Топор', kind: 'item', minLevel: 1, cost: { wood: 1, stone: 1 }, output: { itemId: 'axe', amount: 1, level: 1 } },
  'basic-pickaxe': { id: 'basic-pickaxe', label: 'Кирка', kind: 'item', minLevel: 1, cost: { wood: 1, scrap: 1 }, output: { itemId: 'pickaxe', amount: 1, level: 1 } },
  'reinforced-axe': { id: 'reinforced-axe', label: 'Улучшенный топор', kind: 'item', minLevel: 2, cost: { wood: 1, scrap: 2 }, output: { itemId: 'axe', amount: 1, level: 2 } },
  'reinforced-pickaxe': { id: 'reinforced-pickaxe', label: 'Улучшенная кирка', kind: 'item', minLevel: 2, cost: { wood: 1, scrap: 2 }, output: { itemId: 'pickaxe', amount: 1, level: 2 } },
  'expanded-backpack': { id: 'expanded-backpack', label: 'Рюкзак · ур. 2', kind: 'backpack', minLevel: 3, cost: { wood: 3, scrap: 2 }, level: 2 },
} as const satisfies Record<string, CraftRecipe>;
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
