import type { ToolId, MaterialId } from './items';
import type { Vector3Data } from './index';

export type ResourceKind = 'tree' | 'rock' | 'scrap-pile';
export const RESOURCE_DEFINITIONS = {
  tree: { label: 'Дерево', health: 100, tool: 'axe', output: 'wood', amount: 3 },
  rock: { label: 'Каменная жила', health: 90, tool: 'pickaxe', output: 'stone', amount: 3 },
  'scrap-pile': { label: 'Завал металлолома', health: 60, tool: 'pickaxe', output: 'scrap', amount: 2 },
} as const satisfies Record<ResourceKind, { label: string; health: number; tool: ToolId; output: MaterialId; amount: number }>;

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
];

export const CAMP_STORAGE = { id: 'camp-storage', position: { x: -1.5, y: 0.5, z: -2 }, halfSize: { x: 0.6, y: 0.5, z: 0.4 }, range: 2.6, slots: 8 } as const;
