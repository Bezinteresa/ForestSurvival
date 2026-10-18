import type { CommandResult, SessionCommand, SessionSnapshot } from '@forest-survival/shared';

export interface GameSession {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  start(): void;
  pause(): void;
  sendCommand(command: SessionCommand): CommandResult;
  destroy(): void;
}
