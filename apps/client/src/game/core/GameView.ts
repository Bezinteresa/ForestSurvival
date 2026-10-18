import type { Vector3Data } from '@forest-survival/shared';
import type { DebugGeometry } from '../world/PhysicsWorld';

export interface GameFrame {
  readonly playerPosition: Vector3Data;
  readonly debugGeometry?: DebugGeometry;
}

export interface GameView {
  render(frame: GameFrame): void;
  destroy(): void;
}
