import type { Vector3Data, GameplaySnapshot, WorldClockSnapshot } from '@forest-survival/shared';
import type { CameraPose } from '../player/CameraController';
import type { DebugGeometry } from '../world/PhysicsWorld';

export interface GameFrame {
  readonly playerPosition: Vector3Data;
  readonly gameplay: GameplaySnapshot;
  readonly simulationTime: number;
  readonly clock: WorldClockSnapshot;
  readonly playerYaw: number;
  readonly camera: CameraPose;
  readonly debugGeometry?: DebugGeometry;
}

export interface GameView {
  render(frame: GameFrame): void;
  destroy(): void;
}
