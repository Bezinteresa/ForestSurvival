import { COOKING_POT_CONFIG, POT_RECIPES, type BuildingSnapshot, type CommandResult, type CookingPotSnapshot, type PlayerSnapshot, type PotRecipeId } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

/** One batch. The owning world supplies only the portion of simulation time with heat. */
export class CookingPot {
  private nextBatch = 0;
  private batch: { id: string; recipeId: PotRecipeId; progress: number } | null = null;

  access(building: BuildingSnapshot | undefined, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!building) return { accepted: false, reason: 'station-required' };
    const center = building.position;
    if (Math.hypot(player.position.x - center.x, player.position.z - center.z) > COOKING_POT_CONFIG.range || Math.abs(player.position.y - center.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    return visibility.hasLineOfSight(player.position, center, building.id) ? { accepted: true } : { accepted: false, reason: 'blocked' };
  }

  start(recipeId: string, expectedBatchId: string, bag: Inventory, building: BuildingSnapshot | undefined, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>, heated: boolean): CommandResult {
    const access = this.access(building, player, visibility);
    if (!access.accepted) return access;
    if (!Object.hasOwn(POT_RECIPES, recipeId)) return { accepted: false, reason: 'invalid' };
    if (expectedBatchId !== this.batchId(building!)) return { accepted: false, reason: 'stale' };
    if (this.batch) return { accepted: false, reason: 'cooking-busy' };
    if (!heated) return { accepted: false, reason: 'fire-out' };
    const recipe = POT_RECIPES[recipeId as PotRecipeId];
    const spent = bag.spendItems(recipe.ingredients);
    if (!spent.accepted) return spent;
    this.batch = { id: expectedBatchId, recipeId: recipeId as PotRecipeId, progress: 0 };
    this.nextBatch++;
    return { accepted: true };
  }

  step(heatedSeconds: number): void {
    if (!this.batch || !Number.isFinite(heatedSeconds) || heatedSeconds <= 0) return;
    const duration = POT_RECIPES[this.batch.recipeId].seconds;
    this.batch.progress = Math.min(duration, this.batch.progress + heatedSeconds);
    if (duration - this.batch.progress < 1e-9) this.batch.progress = duration;
  }

  collect(expectedBatchId: string, bag: Inventory, building: BuildingSnapshot | undefined, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    const access = this.access(building, player, visibility);
    if (!access.accepted) return access;
    if (!this.batch || this.batch.id !== expectedBatchId) return { accepted: false, reason: 'stale' };
    const recipe = POT_RECIPES[this.batch.recipeId];
    if (this.batch.progress < recipe.seconds) return { accepted: false, reason: 'nothing-cooked' };
    const inserted = bag.insert({ id: this.batch.id + '/output', itemId: recipe.output, amount: 1 });
    if (!inserted.accepted) return inserted;
    this.batch = null;
    return { accepted: true };
  }

  snapshot(building: BuildingSnapshot | undefined, inReach: boolean, heated: boolean): CookingPotSnapshot {
    const recipe = this.batch ? POT_RECIPES[this.batch.recipeId] : null;
    return { id: building?.id ?? null, built: !!building, position: { ...COOKING_POT_CONFIG.position }, inReach, heated, nextBatchId: building ? this.batchId(building) : null, cooking: this.batch && recipe ? { id: this.batch.id, recipeId: this.batch.recipeId, outputItemId: recipe.output, progressSeconds: this.batch.progress, durationSeconds: recipe.seconds, ready: this.batch.progress >= recipe.seconds } : null };
  }

  private batchId(building: BuildingSnapshot): string { return building.id + '/batch/' + this.nextBatch; }
}
