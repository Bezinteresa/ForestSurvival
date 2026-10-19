import type { ToolId, ItemId } from './items';
import type { Vector3Data } from './index';

export type ResourceKind = 'tree' | 'rock' | 'scrap-pile' | 'coal-vein' | 'hare';
export const RESOURCE_DEFINITIONS = {
  tree: { label: 'Дерево', health: 100, tool: 'axe', output: 'wood', amount: 3 },
  rock: { label: 'Каменная жила', health: 90, tool: 'pickaxe', output: 'stone', amount: 3 },
  'scrap-pile': { label: 'Завал металлолома', health: 60, tool: 'pickaxe', output: 'scrap', amount: 2 },
  'coal-vein': { label: 'Угольная жила', health: 90, tool: 'pickaxe', output: 'coal', amount: 3 },
  // Stationary placeholder game until animal AI arrives with the mob stages; any tool can hunt it.
  hare: { label: 'Заяц', health: 25, tool: null, output: 'raw-meat', amount: 2 },
} as const satisfies Record<ResourceKind, { label: string; health: number; tool: ToolId | null; output: ItemId; amount: number }>;

export interface MaterialNodeDefinition {
  readonly id: string;
  readonly kind: Exclude<ResourceKind, 'tree'>;
  readonly position: Vector3Data;
  readonly radius: number;
  readonly height: number;
}

export const TEST_MATERIAL_NODES: readonly MaterialNodeDefinition[] = [
  { id: 'rock-01', kind: 'rock', position: { x: 2.5, y: 0, z: 4 }, radius: 0.65, height: 1.2 },
  { id: 'rock-02', kind: 'rock', position: { x: -6, y: 0, z: 6 }, radius: 0.75, height: 1.4 },
  { id: 'scrap-01', kind: 'scrap-pile', position: { x: 6, y: 0, z: 5 }, radius: 0.7, height: 1 },
  { id: 'scrap-02', kind: 'scrap-pile', position: { x: -9, y: 0, z: -2 }, radius: 0.7, height: 1 },
  { id: 'coal-01', kind: 'coal-vein', position: { x: 5, y: 0, z: -7 }, radius: 0.65, height: 1.1 },
  { id: 'coal-02', kind: 'coal-vein', position: { x: -7, y: 0, z: 11 }, radius: 0.7, height: 1.2 },
  { id: 'rock-03', kind: 'rock', position: { x: 3, y: 0, z: 10 }, radius: 0.7, height: 1.2 },
  { id: 'rock-04', kind: 'rock', position: { x: -5, y: 0, z: 14 }, radius: 0.7, height: 1.2 },
  { id: 'rock-05', kind: 'rock', position: { x: 10, y: 0, z: 13 }, radius: 0.7, height: 1.2 },
  { id: 'rock-06', kind: 'rock', position: { x: -14, y: 0, z: 12 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-03', kind: 'scrap-pile', position: { x: 8, y: 0, z: -12 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-04', kind: 'scrap-pile', position: { x: -12, y: 0, z: -10 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-05', kind: 'scrap-pile', position: { x: 15, y: 0, z: 3 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-06', kind: 'scrap-pile', position: { x: -15, y: 0, z: 4 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-07', kind: 'scrap-pile', position: { x: 3, y: 0, z: 15 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-08', kind: 'scrap-pile', position: { x: 14, y: 0, z: -5 }, radius: 0.7, height: 1.2 },
  { id: 'rock-07', kind: 'rock', position: { x: -17, y: 0, z: -6 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-09', kind: 'scrap-pile', position: { x: -16, y: 0, z: -16 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-10', kind: 'scrap-pile', position: { x: 16, y: 0, z: 16 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-11', kind: 'scrap-pile', position: { x: -17, y: 0, z: 8 }, radius: 0.7, height: 1.2 },
  { id: 'scrap-12', kind: 'scrap-pile', position: { x: 17, y: 0, z: -11 }, radius: 0.7, height: 1.2 },
  { id: 'hare-01', kind: 'hare', position: { x: -11, y: 0, z: 1 }, radius: 0.3, height: 0.45 },
  { id: 'hare-02', kind: 'hare', position: { x: 11, y: 0, z: -1 }, radius: 0.3, height: 0.45 },
  { id: 'hare-03', kind: 'hare', position: { x: -4, y: 0, z: -10 }, radius: 0.3, height: 0.45 },
];

export const CAMP_STORAGE = { id: 'camp-storage', position: { x: -1.5, y: 0.5, z: -2 }, halfSize: { x: 0.6, y: 0.5, z: 0.4 }, range: 2.6, slots: 8 } as const;
