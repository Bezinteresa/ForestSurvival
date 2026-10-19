import type { FoodId } from './items';
import type { Vector3Data } from './index';

export const SURVIVAL_CONFIG = { maxHealth: 100, maxHunger: 100, hungerPerSecond: 0.25, starvationDamagePerSecond: 5 } as const;
export const FOOD_DEFINITIONS = { berries: { hunger: 25 } } as const satisfies Record<FoodId, { hunger: number }>;

export interface VitalsSnapshot {
  readonly health: number;
  readonly maxHealth: number;
  readonly hunger: number;
  readonly maxHunger: number;
  readonly dead: boolean;
  readonly deathAt: number | null;
  readonly deathReason: 'starvation' | 'damage' | null;
}

export interface BerryBushDefinition { readonly id: string; readonly position: Vector3Data; readonly stock: number }
export interface BerryBushSnapshot extends BerryBushDefinition { readonly remaining: number }
export const FORAGING_CONFIG = { range: 2.2, halfAngle: Math.PI * 55 / 180, maxHeight: 1.25, targetHeight: 0.55 } as const;
export const TEST_BERRY_BUSHES: readonly BerryBushDefinition[] = [
  { id: 'berries-01', position: { x: 1.2, y: 0, z: -1.3 }, stock: 3 },
  { id: 'berries-02', position: { x: -5, y: 0, z: -3 }, stock: 3 },
  { id: 'berries-03', position: { x: 6, y: 0, z: 2 }, stock: 3 },
  { id: 'berries-04', position: { x: -7, y: 0, z: 8 }, stock: 3 },
];
