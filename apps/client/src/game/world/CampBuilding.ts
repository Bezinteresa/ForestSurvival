import { BUILDING_CONFIG, BUILDING_DEFINITIONS, PLAYER_CONFIG, blocksCampPassage, buildingBox, type BuildingPlan, type BuildingPreview, type BuildingSnapshot, type BoxDefinition, type CommandResult, type LootSnapshot, type PlayerSnapshot, type MaterialCost, type MaterialId } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import { Inventory } from '../items/Inventory';
import { CampStorage } from '../items/CampStorage';

export interface BuildingQueries extends Pick<VisibilityQueries, 'hasLineOfSight'> {
  canPlaceBuilding(box: BoxDefinition): boolean;
  activateBuildingCollider(box: BoxDefinition): void;
}
export class CampBuilding {
  private readonly buildings: BuildingSnapshot[] = [];
  private readonly storages = new Map<string, CampStorage>();
  storage(id: string): CampStorage | undefined { return this.storages.get(id); }
  containers(): readonly CampStorage[] { return [...this.storages.values()]; }
  bedIds(): string[] { return [...new Set(this.buildings.filter((entry) => entry.kind === 'bed').map((entry) => entry.id))].sort(); }
  snapshot(): BuildingSnapshot[] { return this.buildings.map((entry) => ({ ...entry, position: { ...entry.position }, halfSize: { ...entry.halfSize } })); }

  preview(plan: BuildingPlan, bag: Inventory, player: PlayerSnapshot, level: number, queries: BuildingQueries, loot: readonly LootSnapshot[]): BuildingPreview {
    const box = buildingBox(plan);
    const cost: MaterialCost = box ? { ...BUILDING_DEFINITIONS[plan.kind].cost } : {};
    const fail = (reason: CommandResult['reason']): BuildingPreview => ({ plan: { ...plan }, box, cost, result: { accepted: false, reason } });
    if (!box) return fail('invalid');
    if (this.buildings.some((entry) => entry.siteId === plan.siteId)) return fail('already-built');
    if (level < BUILDING_DEFINITIONS[plan.kind].minLevel) return fail(level ? 'station-level' : 'station-required');
    if (!player.grounded || Math.hypot(player.position.x - box.position.x, player.position.z - box.position.z) > BUILDING_CONFIG.range || Math.abs(player.position.y - PLAYER_CONFIG.halfHeight - PLAYER_CONFIG.radius) > BUILDING_CONFIG.maxCenterHeightDifference) return fail('out-of-range');
    if (blocksCampPassage(box) || !queries.hasLineOfSight(player.position, box.position, box.id) || !queries.canPlaceBuilding(box)) return fail('blocked');
    if (loot.some((item) => Math.abs(item.position.x - box.position.x) <= box.halfSize.x + 0.3 && Math.abs(item.position.z - box.position.z) <= box.halfSize.z + 0.3 && Math.abs(item.position.y - box.position.y) <= box.halfSize.y + 0.3)) return fail('blocked');
    if (Object.entries(cost).some(([id, amount]) => bag.count(id as MaterialId) < amount)) return fail('insufficient-materials');
    return { plan: { ...plan }, box, cost, result: { accepted: true } };
  }

  place(plan: BuildingPlan, bag: Inventory, player: PlayerSnapshot, level: number, queries: BuildingQueries, loot: readonly LootSnapshot[]): CommandResult {
    const preview = this.preview(plan, bag, player, level, queries, loot);
    if (!preview.result.accepted || !preview.box) return preview.result;
    const spent = bag.spendMaterials(preview.cost);
    if (!spent.accepted) return spent;
    queries.activateBuildingCollider(preview.box);
    const entry: BuildingSnapshot = { ...preview.box, kind: plan.kind, siteId: plan.siteId, rotation: plan.rotation };
    this.buildings.push(entry);
    if (plan.kind === 'storage') this.storages.set(entry.id, new CampStorage(new Inventory(BUILDING_DEFINITIONS.storage.slots, []), { id: entry.id, position: entry.position, range: BUILDING_CONFIG.storageRange }));
    return { accepted: true };
  }
}
