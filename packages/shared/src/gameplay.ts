import type { EntityId, Vector3Data } from './index';

export type EquippedItemId = 'axe' | 'none';

export interface DamageInfo {
  readonly attackId: string;
  readonly sourceId: EntityId;
  readonly targetId: EntityId;
  readonly kind: 'melee';
  readonly amount: number;
  readonly tool: EquippedItemId;
}

export interface ResourceSnapshot {
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly radius: number;
  readonly trunkHeight: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly exhausted: boolean;
}

export interface LootSnapshot {
  readonly id: EntityId;
  readonly itemId: 'wood';
  readonly amount: number;
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
  readonly kind: 'tree' | 'dummy' | 'pickup';
  readonly label: string;
  readonly health?: number;
  readonly maxHealth?: number;
}

export interface GameplaySnapshot {
  readonly equippedItem: EquippedItemId;
  readonly bag: { readonly wood: number; readonly capacity: number };
  readonly resources: readonly ResourceSnapshot[];
  readonly loot: readonly LootSnapshot[];
  readonly dummy: DummySnapshot;
  readonly attack: { readonly phase: 'idle' | 'windup' | 'recovery'; readonly progress: number };
  readonly interaction: InteractionSnapshot | null;
  readonly feedback: { readonly text: string; readonly at: number; readonly kind: 'hit' | 'miss' | 'pickup' | 'info' | 'blocked' } | null;
  readonly lastHit: { readonly targetId: EntityId; readonly at: number } | null;
}

export const AXE_CONFIG = {
  damage: 25,
  windup: 0.18,
  recovery: 0.47,
  reach: 2.2,
  halfAngle: Math.PI * 55 / 180,
  maxHeightDifference: 1.25,
} as const;

export const RESOURCE_CONFIG = { treeHealth: 100, woodPerTree: 3, pickupRange: 2.2, bagCapacity: 12 } as const;

export const TRAINING_DUMMY = {
  id: 'training-dummy',
  position: { x: 1.8, y: 0, z: -4.5 },
  radius: 0.38,
  height: 1.8,
  maxHealth: 100,
} as const;
