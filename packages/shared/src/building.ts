import type { BoxDefinition, CommandResult, Vector3Data } from './index';
import type { MaterialCost } from './items';

export type BuildingKind = 'storage' | 'barricade';
export interface BuildingPlan { readonly kind: BuildingKind; readonly siteId: string; readonly rotation: 0 | 1 }
export const BUILDING_DEFINITIONS = {
  storage: { label: 'Склад', halfSize: { x: 0.6, y: 0.5, z: 0.4 }, cost: { wood: 3, scrap: 1 }, minLevel: 1, slots: 8 },
  barricade: { label: 'Баррикада', halfSize: { x: 1.2, y: 0.6, z: 0.2 }, cost: { wood: 2 }, minLevel: 2, slots: 0 },
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
  const site = BUILD_SITES.find((entry) => entry.id === plan.siteId);
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
