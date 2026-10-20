import type { Vector3Data } from './index';

export const FARM_CONFIG = { range: 2.6, growthSeconds: 120, seedCost: 1, harvestAmount: 3 } as const;
export const FARM_SITES = [
  { id: 'farm-plot-1', position: { x: -4, y: 0, z: 5.7 } },
  { id: 'farm-plot-2', position: { x: 1, y: 0, z: 9.5 } },
] as const;
export interface FarmCropSnapshot {
  readonly id: string;
  readonly plantedAt: number;
  readonly readyAt: number;
  readonly progressSeconds: number;
  readonly durationSeconds: number;
  readonly ready: boolean;
}
export interface FarmSnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly position: Vector3Data;
  readonly inReach: boolean;
  readonly nextCycleId: string;
  readonly crop: FarmCropSnapshot | null;
}
