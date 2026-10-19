import type { ItemStack, MaterialCost } from './items';
import type { Vector3Data } from './index';

export const WORKBENCH_CONFIG = {
  id: 'camp-workbench',
  position: { x: 2, y: 0.57, z: -3 },
  halfSize: { x: 0.75, y: 0.55, z: 0.45 },
  range: 2.6,
  buildCost: { wood: 3, stone: 1 },
} as const;

export interface CraftRecipe {
  readonly id: string;
  readonly label: string;
  readonly minLevel: 1 | 2 | 3;
  readonly cost: MaterialCost;
  readonly output: Omit<ItemStack, 'id'>;
}

export const CRAFT_RECIPES = {
  'basic-axe': { id: 'basic-axe', label: 'Топор', minLevel: 1, cost: { wood: 1, stone: 1 }, output: { itemId: 'axe', amount: 1, level: 1 } },
  'basic-pickaxe': { id: 'basic-pickaxe', label: 'Кирка', minLevel: 1, cost: { wood: 1, scrap: 1 }, output: { itemId: 'pickaxe', amount: 1, level: 1 } },
  // Preview only until the station upgrades in T038 are implemented.
  'reinforced-axe': { id: 'reinforced-axe', label: 'Улучшенный топор', minLevel: 2, cost: { wood: 1, scrap: 2 }, output: { itemId: 'axe', amount: 1, level: 2 } },
} as const satisfies Record<string, CraftRecipe>;
export type RecipeId = keyof typeof CRAFT_RECIPES;

export interface WorkbenchSnapshot {
  readonly id: string;
  readonly position: Vector3Data;
  readonly built: boolean;
  readonly level: 0 | 1 | 2 | 3;
  readonly inReach: boolean;
  readonly buildCost: MaterialCost;
}
