import type { Vector3Data } from './index';
import type { ItemCost, ItemId } from './items';

export const COOKING_POT_CONFIG = { siteId: 'pot-plot-1', position: { x: 1.6, y: 0, z: 2.5 }, range: 2.6 } as const;
export const POT_RECIPES = {
  'meat-soup': { label: 'Мясная похлёбка', ingredients: { 'raw-meat': 1, berries: 2 }, output: 'meat-soup', seconds: 18 },
  'carrot-stew': { label: 'Морковное рагу', ingredients: { carrot: 3 }, output: 'carrot-stew', seconds: 20 },
} as const satisfies Record<string, { label: string; ingredients: ItemCost; output: ItemId; seconds: number }>;
export type PotRecipeId = keyof typeof POT_RECIPES;
export interface PotBatchSnapshot {
  readonly id: string;
  readonly recipeId: PotRecipeId;
  readonly outputItemId: ItemId;
  readonly progressSeconds: number;
  readonly durationSeconds: number;
  readonly ready: boolean;
}
export interface CookingPotSnapshot {
  readonly id: string | null;
  readonly built: boolean;
  readonly position: Vector3Data;
  readonly inReach: boolean;
  readonly heated: boolean;
  readonly nextBatchId: string | null;
  readonly cooking: PotBatchSnapshot | null;
}
