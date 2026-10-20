import type { BerryBushSnapshot } from './survival';
import type { CampfireSnapshot } from './campfire';
import type { WorkbenchSnapshot } from './crafting';
import type { BuildingSnapshot } from './building';
import type { CookingPotSnapshot } from './cooking';
import type { EntityId, Vector3Data } from './index';
import { TOOL_DAMAGE, TOOL_LEVELS, type InventorySnapshot, type ItemStack, type ToolId } from './items';

import { RESOURCE_DEFINITIONS, type ResourceKind } from './resources';

export type EquippedItemId = ToolId | 'none';

export interface DamageInfo {
  readonly attackId: string;
  readonly sourceId: EntityId;
  readonly targetId: EntityId;
  readonly kind: 'melee';
  readonly amount: number;
  readonly tool: EquippedItemId;
}

export interface ResourceSnapshot {
  readonly kind: ResourceKind;
  /** null: any tool works (game animals). */
  readonly requiredTool: ToolId | null;
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly radius: number;
  readonly trunkHeight: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly exhausted: boolean;
}

export interface LootSnapshot extends ItemStack {
  readonly position: Vector3Data;
}

export interface DummySnapshot {
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly health: number;
  readonly maxHealth: number;
  readonly dead: boolean;
}

export interface InteractionSnapshot {
  readonly id: EntityId;
  readonly kind: 'tree' | 'resource' | 'dummy' | 'pickup' | 'storage' | 'bush' | 'campfire' | 'workbench' | 'cooking-pot';
  readonly label: string;
  readonly health?: number;
  readonly maxHealth?: number;
}

export interface GameplaySnapshot {
  readonly inventory: InventorySnapshot;
  readonly storage: { readonly id: string; readonly inventory: InventorySnapshot; readonly inReach: boolean };
  readonly buildings: readonly BuildingSnapshot[];
  /** Existing beds contributing to the next dawn. Derived from buildings, never incremented by a request. */
  readonly bedIds: readonly string[];
  readonly cookingPot: CookingPotSnapshot;
  readonly debugTools: boolean;
  readonly equippedItem: EquippedItemId;
  readonly bag: { readonly wood: number; readonly capacity: number };
  readonly resources: readonly ResourceSnapshot[];
  readonly bushes: readonly BerryBushSnapshot[];
  readonly campfire: CampfireSnapshot;
  readonly workbench: WorkbenchSnapshot;
  readonly loot: readonly LootSnapshot[];
  readonly dummy: DummySnapshot;
  readonly attack: { readonly phase: 'idle' | 'windup' | 'recovery'; readonly progress: number };
  readonly interaction: InteractionSnapshot | null;
  readonly feedback: { readonly text: string; readonly at: number; readonly kind: 'hit' | 'miss' | 'pickup' | 'info' | 'blocked' } | null;
  readonly lastHit: { readonly targetId: EntityId; readonly at: number } | null;
}

export const AXE_CONFIG = {
  damage: TOOL_DAMAGE.axe,
  windup: TOOL_LEVELS[1].windup,
  recovery: TOOL_LEVELS[1].recovery,
  reach: 2.2,
  halfAngle: Math.PI * 55 / 180,
  maxHeightDifference: 1.25,
} as const;

export const RESOURCE_CONFIG = { treeHealth: RESOURCE_DEFINITIONS.tree.health, woodPerTree: RESOURCE_DEFINITIONS.tree.amount, pickupRange: 2.2 } as const;

export const TRAINING_DUMMY = {
  id: 'training-dummy',
  position: { x: 1.8, y: 0, z: -4.5 },
  radius: 0.38,
  height: 1.8,
  maxHealth: 100,
} as const;
