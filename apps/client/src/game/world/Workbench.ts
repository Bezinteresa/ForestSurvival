import { CRAFT_RECIPES, WORKBENCH_CONFIG, WORKBENCH_MAX_LEVEL, nextWorkbenchUpgrade, type CraftRecipe, type CommandResult, type PlayerSnapshot, type RecipeId, type WorkbenchLevel, type WorkbenchSnapshot } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

export interface WorkbenchPlacement {
  canPlaceWorkbench(): boolean;
  addWorkbenchCollider(): void;
}

export class Workbench {
  private level: 0 | WorkbenchLevel = 0;
  private craftedCount = 0;

  access(player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    const { position, range, id } = WORKBENCH_CONFIG;
    if (Math.hypot(player.position.x - position.x, player.position.z - position.z) > range || Math.abs(player.position.y - position.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    return queries.hasLineOfSight(player.position, position, id) ? { accepted: true } : { accepted: false, reason: 'blocked' };
  }

  build(inventory: Inventory, player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>, placement: WorkbenchPlacement): CommandResult {
    if (this.level > 0) return { accepted: false, reason: 'already-built' };
    const access = this.access(player, queries);
    if (!access.accepted) return access;
    if (!placement.canPlaceWorkbench()) return { accepted: false, reason: 'blocked' };
    const spent = inventory.spendMaterials(WORKBENCH_CONFIG.buildCost);
    if (!spent.accepted) return spent;
    placement.addWorkbenchCollider();
    this.level = 1;
    return { accepted: true };
  }

  upgrade(expectedLevel: number, inventory: Inventory, player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!Number.isInteger(expectedLevel) || expectedLevel < 1 || expectedLevel > WORKBENCH_MAX_LEVEL) return { accepted: false, reason: 'invalid' };
    if (!this.level) return { accepted: false, reason: 'station-required' };
    const access = this.access(player, queries);
    if (!access.accepted) return access;
    if (expectedLevel !== this.level) return { accepted: false, reason: 'stale' };
    const next = nextWorkbenchUpgrade(this.level);
    if (!next) return { accepted: false, reason: 'max-level' };
    const spent = inventory.spendMaterials(next.cost);
    if (!spent.accepted) return spent;
    this.level = next.level;
    return { accepted: true };
  }

  craft(recipeId: string, inventory: Inventory, player: PlayerSnapshot, queries: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!Object.hasOwn(CRAFT_RECIPES, recipeId)) return { accepted: false, reason: 'invalid' };
    if (!this.level) return { accepted: false, reason: 'station-required' };
    const access = this.access(player, queries);
    if (!access.accepted) return access;
    const recipe: CraftRecipe = CRAFT_RECIPES[recipeId as RecipeId];
    if (recipe.minLevel > this.level) return { accepted: false, reason: 'station-level' };
    const result = inventory.craft(recipe.cost, { ...recipe.output, id: WORKBENCH_CONFIG.id + '/crafted/' + this.craftedCount });
    if (result.accepted) this.craftedCount++;
    return result;
  }

  snapshot(inReach: boolean): WorkbenchSnapshot {
    return { id: WORKBENCH_CONFIG.id, position: { ...WORKBENCH_CONFIG.position }, built: this.level > 0, level: this.level, maxLevel: WORKBENCH_MAX_LEVEL, nextUpgrade: this.level ? nextWorkbenchUpgrade(this.level) : null, inReach, buildCost: { ...WORKBENCH_CONFIG.buildCost } };
  }
}
