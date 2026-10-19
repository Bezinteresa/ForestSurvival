import type { Vector3Data } from './index';
import type { FuelId, MaterialCost } from './items';

export const FUEL_DEFINITIONS = { wood: { seconds: 30 }, coal: { seconds: 60 } } as const satisfies Record<FuelId, { seconds: number }>;

export type CampfireLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const CAMPFIRE_MAX_LEVEL: CampfireLevel = 6;
export const CAMPFIRE_LEVELS = {
  1: { safeRadius: 5, cost: {} },
  2: { safeRadius: 7, cost: { wood: 3, stone: 3 } },
  3: { safeRadius: 9, cost: { wood: 3, stone: 3, scrap: 2 } },
  4: { safeRadius: 11, cost: { wood: 3, stone: 3, scrap: 2 } },
  5: { safeRadius: 13, cost: { wood: 3, stone: 3, scrap: 3 } },
  6: { safeRadius: 15, cost: { wood: 3, stone: 3, scrap: 3 } },
} as const satisfies Record<CampfireLevel, { safeRadius: number; cost: MaterialCost }>;

export interface CampfireUpgrade {
  readonly level: CampfireLevel;
  readonly safeRadius: number;
  readonly cost: MaterialCost;
}

export function nextCampfireUpgrade(level: CampfireLevel): CampfireUpgrade | null {
  const next = level < CAMPFIRE_MAX_LEVEL ? (level + 1) as CampfireLevel : null;
  return next ? { level: next, safeRadius: CAMPFIRE_LEVELS[next].safeRadius, cost: { ...CAMPFIRE_LEVELS[next].cost } } : null;
}

export const CAMPFIRE_CONFIG = {
  id: 'campfire',
  position: { x: 0, y: 0, z: 2.8 },
  radius: 0.7,
  baseHeight: 0.4,
  targetHeight: 0.5,
  range: 2.6,
  initialFuelSeconds: 60,
  maxFuelSeconds: 180,
  secondsPerWood: FUEL_DEFINITIONS.wood.seconds,
  secondsPerCoal: FUEL_DEFINITIONS.coal.seconds,
  safeRadius: CAMPFIRE_LEVELS[1].safeRadius,
  safeHeight: 3,
} as const;

export interface CampfireSnapshot {
  readonly level: CampfireLevel;
  readonly maxLevel: CampfireLevel;
  /** Radius unlocked by the current level, retained while extinguished. */
  readonly zoneRadius: number;
  readonly nextUpgrade: CampfireUpgrade | null;
  readonly id: string;
  readonly position: Vector3Data;
  readonly fuelSeconds: number;
  readonly maxFuelSeconds: number;
  readonly secondsPerWood: number;
  readonly secondsPerCoal: number;
  readonly lit: boolean;
  /** Effective protection radius: zero when extinguished. */
  readonly safeRadius: number;
  readonly playerInside: boolean;
  readonly inReach: boolean;
}
