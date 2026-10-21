import type { Vector3Data } from './index';
import type { FuelId } from './items';
import type { CookingSnapshot } from './survival';

/** seconds: burn time added (capped by the fire maximum); progress: points toward the next fire level, always counted. */
export const FUEL_DEFINITIONS = { wood: { seconds: 30, progress: 1 }, coal: { seconds: 60, progress: 2 } } as const satisfies Record<FuelId, { seconds: number; progress: number }>;

export type CampfireLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const CAMPFIRE_MAX_LEVEL: CampfireLevel = 6;
/**
 * As in the reference game, the fire levels up by burning fuel, not by buying a level.
 * progressToNext: fuel points needed to leave this level; mapHalfSize: half-width of the explorable square.
 */
export const CAMPFIRE_LEVELS = {
  1: { safeRadius: 5, progressToNext: 4, mapHalfSize: 13.5 },
  2: { safeRadius: 7, progressToNext: 6, mapHalfSize: 14.8 },
  3: { safeRadius: 9, progressToNext: 8, mapHalfSize: 16.1 },
  4: { safeRadius: 11, progressToNext: 10, mapHalfSize: 17.4 },
  5: { safeRadius: 13, progressToNext: 12, mapHalfSize: 18.6 },
  6: { safeRadius: 15, progressToNext: null, mapHalfSize: 19.7 },
} as const satisfies Record<CampfireLevel, { safeRadius: number; progressToNext: number | null; mapHalfSize: number }>;
/** The fog boundary is a thin wall just outside the explorable square. */
export const MAP_LIMIT_CONFIG = { thickness: 0.3, height: 3, length: 20 } as const;

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
  /** Fuel points burned toward the next level; null requirement at the maximum level. */
  readonly progress: number;
  readonly progressRequired: number | null;
  readonly mapHalfSize: number;
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
  /** The single cooking spot over the fire; null when empty. */
  readonly cooking: CookingSnapshot | null;
}
