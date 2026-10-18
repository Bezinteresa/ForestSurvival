import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, type PlayerControlFrame, type CommandResult, type PlayerSnapshot, type SessionCommand, type SessionSnapshot, type SessionStatus, type Vector3Data } from '@forest-survival/shared';
import { buildPlayerMotion } from '../player/PlayerMotor';
import { GameplayWorld } from '../world/GameplayWorld';
import { PhysicsWorld, interpolatePosition, type DebugGeometry } from '../world/PhysicsWorld';
import type { GameSession } from './GameSession';

export class LocalSession implements GameSession {
  private status: SessionStatus = 'ready';
  private simulationTime = 0;
  private sinceSnapshot = 0;
  private currentPlayer: PlayerSnapshot;
  private previousPlayer: PlayerSnapshot;
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private readonly handledRequests = new Map<string, CommandResult>();
  private readonly gameplay: GameplayWorld;
  private viewYaw = Math.PI;
  private destroyed = false;

  static async create(): Promise<LocalSession> {
    return new LocalSession(await PhysicsWorld.create());
  }

  private constructor(private readonly physics: PhysicsWorld) {
    this.currentPlayer = { ...physics.getPlayerSnapshot(), yaw: Math.PI };
    this.previousPlayer = this.currentPlayer;
    this.gameplay = new GameplayWorld(physics);
    this.gameplay.update(0, this.currentPlayer, this.viewYaw);
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

  step(dt: number, input: PlayerControlFrame = NEUTRAL_PLAYER_INPUT): void {
    if (this.status !== 'running' || this.destroyed) return;
    this.previousPlayer = this.currentPlayer;
    const motion = buildPlayerMotion(input, this.currentPlayer.yaw, dt);
    this.physics.step(dt, motion.displacement, motion.jump);
    this.currentPlayer = { ...this.physics.getPlayerSnapshot(), yaw: this.gameplay.getAttackYaw(this.simulationTime) ?? motion.yaw };
    this.viewYaw = Math.atan2(Math.sin(input.cameraYaw), -Math.cos(input.cameraYaw));
    this.simulationTime += dt;
    this.gameplay.update(this.simulationTime, this.currentPlayer, this.viewYaw);
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
      gameplay: this.gameplay.getSnapshot(this.simulationTime),
    };
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    if (this.destroyed) return () => {};
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  sendCommand(command: SessionCommand): CommandResult {
    if (this.destroyed || typeof command.requestId !== 'string' || !command.requestId || command.requestId.length > 80) return { accepted: false, reason: 'invalid' };
    const previous = this.handledRequests.get(command.requestId);
    if (previous) return { ...previous, duplicate: true };
    let result: CommandResult;
    if (command.type !== 'reset-player' && this.status !== 'running') result = { accepted: false, reason: 'paused' };
    else switch (command.type) {
      case 'reset-player':
        this.physics.resetPlayer();
        this.currentPlayer = { ...this.physics.getPlayerSnapshot(), yaw: Math.PI };
        this.previousPlayer = this.currentPlayer;
        this.gameplay.update(this.simulationTime, this.currentPlayer, this.viewYaw);
        result = { accepted: true };
        break;
      case 'use-item':
        result = Number.isFinite(command.yaw) ? this.gameplay.useItem(command.requestId, command.yaw, this.simulationTime) : { accepted: false, reason: 'invalid' };
        if (result.accepted) this.currentPlayer = { ...this.currentPlayer, yaw: command.yaw };
        break;
      case 'select-slot': result = this.gameplay.selectSlot(command.slot, this.simulationTime); break;
      case 'move-item': result = this.gameplay.moveItem(command.from, command.to, this.simulationTime); break;
      case 'drop-item': result = this.gameplay.drop(command.slot, this.currentPlayer, command.yaw, this.simulationTime); break;
      case 'pickup': result = this.gameplay.pickup(command.targetId, this.currentPlayer, this.simulationTime); break;
      case 'interact': result = this.gameplay.interact(this.currentPlayer, this.simulationTime, this.viewYaw); break;
      default: result = { accepted: false, reason: 'invalid' };
    }
    this.handledRequests.set(command.requestId, result);
    if (this.handledRequests.size > 512) this.handledRequests.delete(this.handledRequests.keys().next().value!);
    this.publish();
    return { ...result };
  }

  getRenderPosition(alpha: number): Vector3Data {
    return interpolatePosition(this.previousPlayer.position, this.currentPlayer.position, alpha);
  }

  getDebugGeometry(): DebugGeometry {
    return this.physics.getDebugGeometry();
  }

  getRenderYaw(alpha: number): number {
    const delta = Math.atan2(Math.sin(this.currentPlayer.yaw - this.previousPlayer.yaw), Math.cos(this.currentPlayer.yaw - this.previousPlayer.yaw));
    return this.previousPlayer.yaw + delta * Math.max(0, Math.min(1, alpha));
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
