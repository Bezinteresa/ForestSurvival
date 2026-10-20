import { FARM_CONFIG, type BuildingSnapshot, type CommandResult, type FarmSnapshot, type PlayerSnapshot } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

interface FarmState { nextCycle: number; crop: { id: string; plantedAt: number } | null }
const EPSILON = 1e-7;

/** Growth uses the owning session's absolute time; reads never mutate a crop. */
export class FarmWorld {
  private readonly states = new Map<string, FarmState>();

  access(farm: BuildingSnapshot | undefined, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!farm || farm.kind !== 'farm') return { accepted: false, reason: 'missing' };
    if (Math.hypot(player.position.x - farm.position.x, player.position.z - farm.position.z) > FARM_CONFIG.range || Math.abs(player.position.y - farm.position.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    return visibility.hasLineOfSight(player.position, farm.position, farm.id) ? { accepted: true } : { accepted: false, reason: 'blocked' };
  }

  plant(farm: BuildingSnapshot | undefined, expectedCycleId: string, bag: Inventory, slot: number, expectedItemId: string, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>, now: number): CommandResult {
    const access = this.access(farm, player, visibility);
    if (!access.accepted) return access;
    if (!Number.isFinite(now) || now < 0) return { accepted: false, reason: 'invalid' };
    const state = this.states.get(farm!.id);
    if (expectedCycleId !== this.cycleId(farm!.id, state?.nextCycle ?? 0)) return { accepted: false, reason: 'stale' };
    if (state?.crop) return { accepted: false, reason: 'farm-busy' };
    const seed = bag.getStack(slot);
    if (!seed || seed.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (seed.itemId !== 'carrot') return { accepted: false, reason: 'wrong-seed' };
    const spent = bag.consume(slot, expectedItemId, FARM_CONFIG.seedCost);
    if (!spent.accepted) return spent;
    this.states.set(farm!.id, { nextCycle: (state?.nextCycle ?? 0) + 1, crop: { id: expectedCycleId, plantedAt: now } });
    return { accepted: true };
  }

  harvest(farm: BuildingSnapshot | undefined, expectedCycleId: string, bag: Inventory, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>, now: number): CommandResult {
    const access = this.access(farm, player, visibility);
    if (!access.accepted) return access;
    if (!Number.isFinite(now) || now < 0) return { accepted: false, reason: 'invalid' };
    const state = this.states.get(farm!.id);
    if (!state?.crop || state.crop.id !== expectedCycleId) return { accepted: false, reason: 'stale' };
    if (now + EPSILON < state.crop.plantedAt + FARM_CONFIG.growthSeconds) return { accepted: false, reason: 'not-grown' };
    const inserted = bag.insert({ id: state.crop.id + '/harvest', itemId: 'carrot', amount: FARM_CONFIG.harvestAmount });
    if (!inserted.accepted) return inserted;
    state.crop = null;
    return { accepted: true };
  }

  snapshot(farms: readonly BuildingSnapshot[], now: number, inReach: ReadonlySet<string>): FarmSnapshot[] {
    return farms.map((farm) => {
      const state = this.states.get(farm.id), crop = state?.crop;
      const readyAt = crop ? crop.plantedAt + FARM_CONFIG.growthSeconds : 0;
      const ready = !!crop && now + EPSILON >= readyAt;
      return { id: farm.id, siteId: farm.siteId, position: { ...farm.position }, inReach: inReach.has(farm.id), nextCycleId: this.cycleId(farm.id, state?.nextCycle ?? 0), crop: crop ? { ...crop, readyAt, progressSeconds: ready ? FARM_CONFIG.growthSeconds : Math.max(0, now - crop.plantedAt), durationSeconds: FARM_CONFIG.growthSeconds, ready } : null };
    });
  }

  private cycleId(farmId: string, index: number): string { return farmId + '/crop/' + index; }
}
