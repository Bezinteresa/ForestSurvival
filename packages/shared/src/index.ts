import type { GameplaySnapshot } from './gameplay';
import type { VitalsSnapshot } from './survival';
import type { CampfireLevel } from './campfire';
export * from './gameplay';
export * from './items';
export * from './resources';
export * from './survival';
export * from './campfire';

export type EntityId = string;

export interface Vector3Data {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type SessionStatus = 'ready' | 'running' | 'paused' | 'ended' | 'stopped';

export interface PlayerSnapshot {
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly grounded: boolean;
  readonly yaw: number;
}

export interface PlayerControlFrame {
  readonly moveX: number;
  readonly moveY: number;
  readonly cameraYaw: number;
  readonly faceCamera: boolean;
  readonly sprint: boolean;
  readonly jump: boolean;
}

export const NEUTRAL_PLAYER_INPUT: PlayerControlFrame = { moveX: 0, moveY: 0, cameraYaw: 0, faceCamera: false, sprint: false, jump: false };

export interface SessionSnapshot {
  readonly schemaVersion: 1;
  readonly mode: 'local';
  readonly status: SessionStatus;
  readonly simulationTime: number;
  readonly player: PlayerSnapshot;
  readonly gameplay: GameplaySnapshot;
  readonly vitals: VitalsSnapshot;
}

export type SessionCommand = { readonly requestId: string } & (
  | { readonly type: 'reset-player' }
  | { readonly type: 'use-item'; readonly yaw: number }
  | { readonly type: 'select-slot'; readonly slot: number }
  | { readonly type: 'move-item'; readonly from: number; readonly to: number }
  | { readonly type: 'drop-item'; readonly slot: number; readonly yaw: number }
  | { readonly type: 'transfer-item'; readonly direction: 'deposit' | 'withdraw'; readonly slot: number; readonly expectedItemId: string }
  | { readonly type: 'debug-upgrade'; readonly target: 'tool' | 'backpack'; readonly slot: number; readonly level: 2 }
  | { readonly type: 'consume-item'; readonly slot: number; readonly expectedItemId: string }
  | { readonly type: 'gather'; readonly targetId: string }
  | { readonly type: 'fuel-fire'; readonly slot: number; readonly expectedItemId: string }
  | { readonly type: 'upgrade-fire'; readonly expectedLevel: CampfireLevel }
  | { readonly type: 'pickup'; readonly targetId: string }
  | { readonly type: 'interact' }
);

export interface CommandResult {
  readonly accepted: boolean;
  readonly duplicate?: boolean;
  readonly reason?: 'paused' | 'busy' | 'empty-hand' | 'missing' | 'out-of-range' | 'blocked' | 'inventory-full' | 'invalid' | 'forbidden' | 'stale' | 'satiated' | 'dead' | 'fire-full' | 'wrong-fuel' | 'fire-out' | 'max-level' | 'insufficient-materials';
}

export const SIMULATION_CONFIG = {
  fixedStep: 1 / 60,
  maxFrameDelta: 0.1,
  maxSubSteps: 6,
  gravity: -20,
  terminalVelocity: 30,
  snapshotInterval: 0.1,
} as const;

export const PLAYER_CONFIG = {
  id: 'local-player',
  spawn: { x: 0, y: 3, z: 0 },
  radius: 0.35,
  halfHeight: 0.55,
  collisionOffset: 0.02,
  walkSpeed: 4.2,
  runSpeed: 6.5,
  jumpSpeed: 7,
  turnSpeed: 12,
  stepHeight: 0.28,
} as const;

export interface BoxDefinition {
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly halfSize: Vector3Data;
}

export interface TreeDefinition {
  readonly id: EntityId;
  readonly position: Vector3Data;
  readonly radius: number;
  readonly trunkHeight: number;
}

export const TEST_WORLD = {
  ground: { id: 'ground', position: { x: 0, y: -0.3, z: 0 }, halfSize: { x: 22, y: 0.3, z: 22 } },
  walls: [
    { id: 'low-step', position: { x: -2, y: 0.1, z: 0 }, halfSize: { x: 0.5, y: 0.1, z: 1 } },
    { id: 'wall-east', position: { x: 4, y: 1, z: 0 }, halfSize: { x: 0.3, y: 1, z: 3 } },
    { id: 'wall-north', position: { x: -4, y: 0.7, z: -5 }, halfSize: { x: 3, y: 0.7, z: 0.35 } },
    { id: 'border-east', position: { x: 20, y: 1, z: 0 }, halfSize: { x: 0.3, y: 1, z: 20 } },
    { id: 'border-west', position: { x: -20, y: 1, z: 0 }, halfSize: { x: 0.3, y: 1, z: 20 } },
    { id: 'border-north', position: { x: 0, y: 1, z: -20 }, halfSize: { x: 20, y: 1, z: 0.3 } },
    { id: 'border-south', position: { x: 0, y: 1, z: 20 }, halfSize: { x: 20, y: 1, z: 0.3 } },
  ] satisfies readonly BoxDefinition[],
  trees: [
    { id: 'tree-01', position: { x: -4, y: 0, z: 3 }, radius: 0.4, trunkHeight: 2.4 },
    { id: 'tree-02', position: { x: 7, y: 0, z: -6 }, radius: 0.45, trunkHeight: 2.8 },
    { id: 'tree-03', position: { x: -8, y: 0, z: -8 }, radius: 0.4, trunkHeight: 2.4 },
    { id: 'tree-04', position: { x: -10, y: 0, z: 7 }, radius: 0.5, trunkHeight: 3 },
    { id: 'tree-05', position: { x: 9, y: 0, z: 8 }, radius: 0.4, trunkHeight: 2.6 },
    { id: 'tree-06', position: { x: 12, y: 0, z: -11 }, radius: 0.4, trunkHeight: 2.7 },
    { id: 'tree-07', position: { x: -13, y: 0, z: -3 }, radius: 0.45, trunkHeight: 2.8 },
    { id: 'tree-08', position: { x: 0, y: 0, z: -13 }, radius: 0.5, trunkHeight: 3.2 },
  ] satisfies readonly TreeDefinition[],
} as const;
