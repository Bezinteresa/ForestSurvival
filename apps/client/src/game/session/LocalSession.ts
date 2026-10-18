import { SIMULATION_CONFIG, type CommandResult, type PlayerSnapshot, type SessionCommand, type SessionSnapshot, type SessionStatus, type Vector3Data } from '@forest-survival/shared';
import { PhysicsWorld, interpolatePosition, type DebugGeometry } from '../world/PhysicsWorld';
import type { GameSession } from './GameSession';

export class LocalSession implements GameSession {
  private status: SessionStatus = 'ready';
  private simulationTime = 0;
  private sinceSnapshot = 0;
  private currentPlayer: PlayerSnapshot;
  private previousPlayer: PlayerSnapshot;
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private readonly handledRequests = new Set<string>();
  private destroyed = false;

  static async create(): Promise<LocalSession> {
    return new LocalSession(await PhysicsWorld.create());
  }

  private constructor(private readonly physics: PhysicsWorld) {
    this.currentPlayer = physics.getPlayerSnapshot();
    this.previousPlayer = this.currentPlayer;
  }

  start(): void {
    if (this.destroyed || this.status === 'running') return;
    this.status = 'running';
    this.publish();
  }

  pause(): void {
    if (this.destroyed || this.status !== 'running') return;
    this.status = 'paused';
    this.publish();
  }

  step(dt: number): void {
    if (this.status !== 'running' || this.destroyed) return;
    this.previousPlayer = this.currentPlayer;
    this.physics.step(dt);
    this.currentPlayer = this.physics.getPlayerSnapshot();
    this.simulationTime += dt;
    this.sinceSnapshot += dt;
    if (this.sinceSnapshot + 1e-10 >= SIMULATION_CONFIG.snapshotInterval) {
      this.sinceSnapshot = Math.max(0, this.sinceSnapshot - SIMULATION_CONFIG.snapshotInterval);
      this.publish();
    }
  }

  getSnapshot(): SessionSnapshot {
    return {
      schemaVersion: 1,
      mode: 'local',
      status: this.status,
      simulationTime: this.simulationTime,
      player: { ...this.currentPlayer, position: { ...this.currentPlayer.position } },
    };
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    if (this.destroyed) return () => {};
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  sendCommand(command: SessionCommand): CommandResult {
    if (this.destroyed || command.type !== 'reset-player' || !command.requestId || command.requestId.length > 80) return { accepted: false };
    if (this.handledRequests.has(command.requestId)) return { accepted: true, duplicate: true };
    this.physics.resetPlayer();
    this.currentPlayer = this.physics.getPlayerSnapshot();
    this.previousPlayer = this.currentPlayer;
    this.handledRequests.add(command.requestId);
    if (this.handledRequests.size > 512) this.handledRequests.delete(this.handledRequests.values().next().value!);
    this.publish();
    return { accepted: true };
  }

  getRenderPosition(alpha: number): Vector3Data {
    return interpolatePosition(this.previousPlayer.position, this.currentPlayer.position, alpha);
  }

  getDebugGeometry(): DebugGeometry {
    return this.physics.getDebugGeometry();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.status = 'stopped';
    this.physics.destroy();
    this.listeners.clear();
    this.handledRequests.clear();
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
