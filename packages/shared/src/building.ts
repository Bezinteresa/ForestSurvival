import type { BoxDefinition, CommandResult, Vector3Data } from './index';
import type { MaterialCost } from './items';
import { COOKING_POT_CONFIG } from './cooking';
import { FARM_SITES } from './farming';

export type BuildingKind = 'storage' | 'barricade' | 'bed' | 'cooking-pot' | 'farm' | 'rabbit-trap';
export interface BuildingPlan { readonly kind: BuildingKind; readonly siteId: string; readonly rotation: 0 | 1 }
export const BUILDING_DEFINITIONS = {
  storage: { label: 'Склад', halfSize: { x: 0.6, y: 0.5, z: 0.4 }, cost: { wood: 3, scrap: 1 }, minLevel: 1, slots: 8 },
  barricade: { label: 'Баррикада', halfSize: { x: 1.2, y: 0.6, z: 0.2 }, cost: { wood: 2 }, minLevel: 2, slots: 0 },
  bed: { label: 'Кровать', halfSize: { x: 0.55, y: 0.35, z: 1 }, cost: { wood: 2, scrap: 1 }, minLevel: 1, slots: 0 },
  'cooking-pot': { label: 'Котелок', halfSize: { x: 0.5, y: 0.5, z: 0.5 }, cost: { stone: 2, scrap: 2 }, minLevel: 1, slots: 0 },
  farm: { label: 'Грядка', halfSize: { x: 0.9, y: 0.12, z: 0.65 }, cost: { wood: 2 }, minLevel: 1, slots: 0 },
  'rabbit-trap': { label: 'Ловушка для кроликов', halfSize: { x: 0.45, y: 0.2, z: 0.35 }, cost: { wood: 5 }, minLevel: 1, slots: 0 },
} as const satisfies Record<BuildingKind, { label: string; halfSize: Vector3Data; cost: MaterialCost; minLevel: number; slots: number }>;
export const BUILDING_CONFIG = { range: 3.2, storageRange: 2.6, passageClearance: 0.4, maxCenterHeightDifference: 0.4 } as const;
export const BUILD_SITES = [
  { id: 'plot-1', position: { x: -2, y: 0, z: 4.5 } },
  { id: 'plot-2', position: { x: 1, y: 0, z: 6.5 } },
  { id: 'plot-3', position: { x: -4, y: 0, z: 8 } },
  { id: 'plot-4', position: { x: 5.5, y: 0, z: 7.5 } },
  { id: 'plot-5', position: { x: -6, y: 0, z: 0 } },
  { id: 'plot-6', position: { x: 0, y: 0, z: -5.5 } },
] as const;
export const BED_CONFIG = { maxBeds: 4 } as const;
// Reserved places keep all four bonuses available even when the six general plots are occupied.
export const BED_SITES = [
  { id: 'bed-plot-1', position: { x: -5, y: 0, z: 10.5 } },
  { id: 'bed-plot-2', position: { x: -1, y: 0, z: 10.5 } },
  { id: 'bed-plot-3', position: { x: 5.5, y: 0, z: 10.5 } },
  { id: 'bed-plot-4', position: { x: 8, y: 0, z: -3 } },
] as const;
/** Traps stand out in the woods inside the starting area; each catches a hare on its own timer. */
export const TRAP_SITES = [
  { id: 'trap-plot-1', position: { x: -9, y: 0, z: 4 } },
  { id: 'trap-plot-2', position: { x: 9, y: 0, z: 3 } },
] as const;
export const TRAP_CONFIG = { range: 2.4, catchSeconds: 90, meatPerCatch: 2 } as const;
export interface TrapSnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly position: Vector3Data;
  readonly inReach: boolean;
  /** ID of the catch the trap is working on; collecting must name it. */
  readonly catchId: string;
  readonly progressSeconds: number;
  readonly durationSeconds: number;
  readonly ready: boolean;
}
export const POT_SITES = [{ id: COOKING_POT_CONFIG.siteId, position: COOKING_POT_CONFIG.position }] as const;
export const ALL_BUILD_SITES = [...BUILD_SITES, ...BED_SITES, ...POT_SITES, ...FARM_SITES, ...TRAP_SITES];
export function buildSitesFor(kind: BuildingKind): readonly { readonly id: string; readonly position: Vector3Data }[] {
  return kind === 'bed' ? BED_SITES : kind === 'cooking-pot' ? POT_SITES : kind === 'farm' ? FARM_SITES : kind === 'rabbit-trap' ? TRAP_SITES : BUILD_SITES;
}
// Author the plots around a permanent route. These separated footprints cannot
// close an enclosure; free placement will need a navigation connectivity check.
export const CAMP_PASSAGE = [
  { x: 0, z: 0 }, { x: -0.8, z: 1.4 }, { x: -2.7, z: 1.4 },
  { x: -2.7, z: -3.5 }, { x: -7.7, z: -3.5 }, { x: -7.7, z: 1 }, { x: -12, z: 1 },
] as const;
export interface BuildingSnapshot extends BoxDefinition { readonly kind: BuildingKind; readonly siteId: string; readonly rotation: 0 | 1 }
export interface BuildingPreview { readonly plan: BuildingPlan; readonly box: BoxDefinition | null; readonly result: CommandResult; readonly cost: MaterialCost }
export function buildingColliderId(plan: BuildingPlan): string { return 'build/' + plan.siteId + '/' + plan.kind + '/' + plan.rotation; }
export function buildingBox(plan: BuildingPlan): BoxDefinition | null {
  if (!plan || !Object.hasOwn(BUILDING_DEFINITIONS, plan.kind) || (plan.rotation !== 0 && plan.rotation !== 1)) return null;
  const site = buildSitesFor(plan.kind).find((entry) => entry.id === plan.siteId);
  if (!site) return null;
  const size = BUILDING_DEFINITIONS[plan.kind].halfSize;
  return { id: buildingColliderId(plan), position: { ...site.position, y: size.y }, halfSize: { x: plan.rotation ? size.z : size.x, y: size.y, z: plan.rotation ? size.x : size.z } };
}
export function blocksCampPassage(box: BoxDefinition): boolean {
  const margin = BUILDING_CONFIG.passageClearance;
  const minX = box.position.x - box.halfSize.x - margin, maxX = box.position.x + box.halfSize.x + margin;
  const minZ = box.position.z - box.halfSize.z - margin, maxZ = box.position.z + box.halfSize.z + margin;
  return CAMP_PASSAGE.slice(1).some((to, index) => {
    const from = CAMP_PASSAGE[index]!;
    let low = 0, high = 1;
    const axes: Array<readonly [number, number, number, number]> = [[from.x, to.x - from.x, minX, maxX], [from.z, to.z - from.z, minZ, maxZ]];
    for (const [start, delta, min, max] of axes) {
      if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; }
      else { const a = (min - start) / delta, b = (max - start) / delta; low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); if (low > high) return false; }
    }
    return true;
  });
}
