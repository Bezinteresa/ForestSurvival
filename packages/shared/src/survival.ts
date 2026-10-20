import type { ConsumableId, ItemId } from './items';
import type { Vector3Data } from './index';

export const SURVIVAL_CONFIG = {
  maxHealth: 100,
  maxHunger: 100,
  hungerPerSecond: 0.25,
  sprintHungerMultiplier: 2,
  minSprintMovementSpeed: 0.1, // Metres/second; ignore contact jitter after collision resolution.
  starvationDamagePerSecond: 5,
  coldGraceSeconds: 10,
  coldDamagePerSecond: 1,
} as const;
/**
 * One use applies every listed effect at once; each is capped by the current maximum.
 * Raw food feeds less than cooked; cooked meat is the hot food that both feeds and heals.
 */
export const CONSUMABLE_DEFINITIONS = {
  berries: { hunger: 25, health: 0 },
  carrot: { hunger: 15, health: 0 },
  'carrot-stew': { hunger: SURVIVAL_CONFIG.maxHunger, health: 30 },
  'raw-meat': { hunger: 10, health: 0 },
  'cooked-meat': { hunger: 35, health: 15 },
  'meat-soup': { hunger: 70, health: 25 },
  bandage: { hunger: 0, health: 25 },
  medkit: { hunger: 0, health: 60 },
} as const satisfies Record<ConsumableId, { hunger: number; health: number }>;

/** Cooking happens on a lit campfire, one item at a time; progress advances only while it burns. */
export const COOKING_RECIPES = {
  'raw-meat': { output: 'cooked-meat', seconds: 12 },
} as const satisfies Partial<Record<ItemId, { output: ItemId; seconds: number }>>;
export type CookableId = keyof typeof COOKING_RECIPES;
export function isCookable(itemId: ItemId): itemId is CookableId { return Object.hasOwn(COOKING_RECIPES, itemId); }

export interface CookingSnapshot {
  readonly inputItemId: CookableId;
  readonly outputItemId: ItemId;
  readonly progressSeconds: number;
  readonly durationSeconds: number;
  readonly ready: boolean;
}

/** Found supplies until exploration containers exist (T050+). Positions are fixed so a run is reproducible. */
export const TEST_SUPPLIES: ReadonlyArray<{ readonly id: string; readonly itemId: ConsumableId; readonly amount: number; readonly position: Vector3Data }> = [
  { id: 'supply-bandage-01', itemId: 'bandage', amount: 2, position: { x: 8.5, y: 0.23, z: -8.5 } },
  { id: 'supply-medkit-01', itemId: 'medkit', amount: 1, position: { x: -10.5, y: 0.23, z: 15 } },
];

export interface VitalsSnapshot {
  readonly health: number;
  readonly maxHealth: number;
  readonly hunger: number;
  readonly maxHunger: number;
  readonly dead: boolean;
  readonly deathAt: number | null;
  readonly deathReason: 'starvation' | 'cold' | 'damage' | null;
  readonly cold: {
    readonly exposed: boolean;
    readonly exposureSeconds: number;
    readonly graceSeconds: number;
    readonly damagePerSecond: number;
    readonly freezing: boolean;
  };
}

export type ForageItemId = 'berries' | 'carrot';
export interface ForageDefinition { readonly id: string; readonly position: Vector3Data; readonly stock: number }
export interface ForageSnapshot extends ForageDefinition { readonly remaining: number }
export type BerryBushDefinition = ForageDefinition;
export type BerryBushSnapshot = ForageSnapshot;
export type CarrotPatchDefinition = ForageDefinition;
export type CarrotPatchSnapshot = ForageSnapshot;
export const FORAGING_CONFIG = { range: 2.2, halfAngle: Math.PI * 55 / 180, maxHeight: 1.25, targetHeight: 0.55 } as const;
export const TEST_BERRY_BUSHES: readonly BerryBushDefinition[] = [
  { id: 'berries-01', position: { x: 1.2, y: 0, z: -1.3 }, stock: 3 },
  { id: 'berries-02', position: { x: -5, y: 0, z: -3 }, stock: 3 },
  { id: 'berries-03', position: { x: 6, y: 0, z: 2 }, stock: 3 },
  { id: 'berries-04', position: { x: -7, y: 0, z: 8 }, stock: 3 },
];
/** Finite wild patches. Replanting and growth are separate T040b rules. */
export const TEST_CARROT_PATCHES: readonly CarrotPatchDefinition[] = [
  { id: 'carrots-01', position: { x: -4.8, y: 0, z: 1 }, stock: 3 },
  { id: 'carrots-02', position: { x: 2, y: 0, z: -8.5 }, stock: 3 },
  { id: 'carrots-03', position: { x: 11.5, y: 0, z: 5.5 }, stock: 3 },
  { id: 'carrots-04', position: { x: -11, y: 0, z: 13.5 }, stock: 3 },
];
