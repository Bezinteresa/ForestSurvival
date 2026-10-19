import type { Vector3Data } from './index';

export const CAMPFIRE_CONFIG = {
  id: 'campfire',
  position: { x: 0, y: 0, z: 2.8 },
  radius: 0.7,
  baseHeight: 0.4,
  targetHeight: 0.5,
  range: 2.6,
  initialFuelSeconds: 60,
  maxFuelSeconds: 180,
  secondsPerWood: 30,
  safeRadius: 5,
  safeHeight: 3,
} as const;

export interface CampfireSnapshot {
  readonly id: string;
  readonly position: Vector3Data;
  readonly fuelSeconds: number;
  readonly maxFuelSeconds: number;
  readonly secondsPerWood: number;
  readonly lit: boolean;
  /** Effective protection radius: zero when extinguished. */
  readonly safeRadius: number;
  readonly playerInside: boolean;
  readonly inReach: boolean;
}
