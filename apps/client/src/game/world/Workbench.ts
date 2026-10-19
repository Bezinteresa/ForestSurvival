import { CRAFT_RECIPES, WORKBENCH_CONFIG, type CommandResult, type PlayerSnapshot, type RecipeId, type WorkbenchSnapshot } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

export interface WorkbenchPlacement {
  canPlaceWorkbench(): boolean;
  addWorkbenchCollider(): void;
}

export class Workbench {
  private built = false;
  private craftedCount = 0;

  access(player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    const { position, range, id } = WORKBENCH_CONFIG;
    if (Math.hypot(player.position.x - position.x, player.position.z - position.z) > range || Math.abs(player.position.y - position.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    return queries.hasLineOfSight(player.position, position, id) ? { accepted: true } : { accepted: false, reason: 'blocked' };
  }

  build(inventory: Inventory, player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>, placement: WorkbenchPlacement): CommandResult {
    if (this.built) return { accepted: false, reason: 'already-built' };
    const access = this.access(player, queries);
    if (!access.accepted) return access;
    if (!placement.canPlaceWorkbench()) return { accepted: false, reason: 'blocked' };
    const spent = inventory.spendMaterials(WORKBENCH_CONFIG.buildCost);
    if (!spent.accepted) return spent;
    placement.addWorkbenchCollider();
    this.built = true;
    return { accepted: true };
  }

  craft(recipeId: string, inventory: Inventory, player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!Object.hasOwn(CRAFT_RECIPES, recipeId)) return { accepted: false, reason: 'invalid' };
    if (!this.built) return { accepted: false, reason: 'station-required' };
    const access = this.access(player, queries);
    if (!access.accepted) return access;
    const recipe = CRAFT_RECIPES[recipeId as RecipeId];
    if (recipe.minLevel > 1) return { accepted: false, reason: 'station-level' };
    const result = inventory.craft(recipe.cost, { ...recipe.output, id: WORKBENCH_CONFIG.id + '/crafted/' + this.craftedCount });
    if (result.accepted) this.craftedCount++;
    return result;
  }

  snapshot(inReach: boolean): WorkbenchSnapshot {
    return { id: WORKBENCH_CONFIG.id, position: { ...WORKBENCH_CONFIG.position }, built: this.built, level: this.built ? 1 : 0, inReach, buildCost: { ...WORKBENCH_CONFIG.buildCost } };
  }
}
