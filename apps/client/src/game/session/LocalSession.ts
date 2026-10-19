import { NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, SURVIVAL_CONFIG, isFood, TEST_MATERIAL_NODES, TEST_WORLD, type PlayerControlFrame, type CommandResult, type PlayerSnapshot, type SessionCommand, type SessionSnapshot, type SessionStatus, type Vector3Data } from '@forest-survival/shared';
import { buildPlayerMotion } from '../player/PlayerMotor';
import { PlayerVitals } from '../player/PlayerVitals';
import { GameplayWorld } from '../world/GameplayWorld';
import { PhysicsWorld, interpolatePosition, type DebugGeometry } from '../world/PhysicsWorld';
import type { GameSession } from './GameSession';
import { WorldClock, type WorldClockSnapshot } from '@forest-survival/shared';

export class LocalSession implements GameSession {
  private status: SessionStatus = 'ready';
  private simulationTime = 0;
  private sinceSnapshot = 0;
  private currentPlayer: PlayerSnapshot;
  private previousPlayer: PlayerSnapshot;
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private readonly handledRequests = new Map<string, CommandResult>();
  private readonly gameplay: GameplayWorld;
  private readonly vitals = new PlayerVitals();
  private readonly clock = new WorldClock();
  private viewYaw = Math.PI;
  private destroyed = false;

  static async create(options: { debugTools?: boolean } = {}): Promise<LocalSession> {
    return new LocalSession(await PhysicsWorld.create(), options.debugTools ?? false);
  }

  private constructor(private readonly physics: PhysicsWorld, debugTools: boolean) {
    this.currentPlayer = { ...physics.getPlayerSnapshot(), yaw: Math.PI };
    this.previousPlayer = this.currentPlayer;
    this.gameplay = new GameplayWorld(physics, TEST_WORLD.trees, undefined, TEST_MATERIAL_NODES, debugTools);
    this.gameplay.update(0, this.currentPlayer, this.viewYaw);
  }

  start(): void {
    if (this.destroyed || this.status === 'running' || this.status === 'ended') return;
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
    const clockStart = this.clock.snapshot();
    const warmFor = this.gameplay.warmthDuration(dt, this.currentPlayer.position);
    this.simulationTime += dt;
    this.clock.update(this.simulationTime);
    this.gameplay.step(dt);
    const horizontalDistance = Math.hypot(this.currentPlayer.position.x - this.previousPlayer.position.x, this.currentPlayer.position.z - this.previousPlayer.position.z);
    const sprinting = input.sprint && (motion.displacement.x !== 0 || motion.displacement.z !== 0) && horizontalDistance > SURVIVAL_CONFIG.minSprintMovementSpeed * dt;
    this.stepVitals(dt, sprinting, warmFor, clockStart);
    if (this.vitals.dead) {
      this.gameplay.end();
      this.status = 'ended';
      this.publish();
      return;
    }
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
      vitals: this.vitals.snapshot(),
      clock: this.clock.snapshot(),
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
    if (this.status === 'ended') return { accepted: false, reason: 'dead' };
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
      case 'use-item': {
        if (!Number.isFinite(command.yaw)) { result = { accepted: false, reason: 'invalid' }; break; }
        const selected = this.gameplay.getSelectedItem();
        if (selected && isFood(selected.itemId)) {
          const slot = this.gameplay.getSnapshot(this.simulationTime).inventory.activeSlot;
          result = this.gameplay.consumeFood(slot, selected.id, this.vitals, this.simulationTime);
        } else {
          result = this.gameplay.useItem(command.requestId, command.yaw, this.simulationTime);
          if (result.accepted) this.currentPlayer = { ...this.currentPlayer, yaw: command.yaw };
        }
        break;
      }
      case 'consume-item': result = this.gameplay.consumeFood(command.slot, command.expectedItemId, this.vitals, this.simulationTime); break;
      case 'gather': result = this.gameplay.gather(command.targetId, this.currentPlayer, this.simulationTime); break;
      case 'fuel-fire': result = this.gameplay.fuelFire(command.slot, command.expectedItemId, this.currentPlayer, this.simulationTime); break;
      case 'upgrade-fire': result = this.gameplay.upgradeFire(command.expectedLevel, this.currentPlayer, this.simulationTime); break;
      case 'build-workbench': result = this.gameplay.buildWorkbench(this.currentPlayer, this.simulationTime); break;
      case 'upgrade-workbench': result = this.gameplay.upgradeWorkbench(command.expectedLevel, this.currentPlayer, this.simulationTime); break;
      case 'craft-item': result = this.gameplay.craftItem(command.recipeId, this.currentPlayer, this.simulationTime); break;
      case 'select-slot': result = this.gameplay.selectSlot(command.slot, this.simulationTime); break;
      case 'move-item': result = this.gameplay.moveItem(command.from, command.to, this.simulationTime); break;
      case 'drop-item': result = this.gameplay.drop(command.slot, this.currentPlayer, command.yaw, this.simulationTime); break;
      case 'transfer-item': result = this.gameplay.transfer(command.direction, command.slot, command.expectedItemId, this.currentPlayer, this.simulationTime); break;
      case 'debug-upgrade': result = this.gameplay.debugUpgrade(command.target, command.slot, command.level, this.simulationTime); break;
      case 'pickup': result = this.gameplay.pickup(command.targetId, this.currentPlayer, this.simulationTime); break;
      case 'interact': result = this.gameplay.interact(this.currentPlayer, this.simulationTime, this.viewYaw); break;
      default: result = { accepted: false, reason: 'invalid' };
    }
    this.handledRequests.set(command.requestId, result);
    if (this.handledRequests.size > 512) this.handledRequests.delete(this.handledRequests.keys().next().value!);
    if (result.accepted) this.syncColdEnvironment();
    this.publish();
    return { ...result };
  }

  private stepVitals(dt: number, sprinting: boolean, warmFor: number, clockStart: WorldClockSnapshot): void {
    const phaseBoundary = Math.min(dt, clockStart.secondsRemaining);
    const boundaries = [phaseBoundary, warmFor, dt].sort((a, b) => a - b);
    let start = 0;
    for (const end of boundaries) {
      if (end <= start) continue;
      const night = start < phaseBoundary ? clockStart.phase === 'night' : clockStart.phase === 'day';
      this.vitals.step(end - start, this.simulationTime - dt + end, sprinting, night && start >= warmFor);
      if (this.vitals.dead) break;
      start = end;
    }
    this.syncColdEnvironment();
  }

  private syncColdEnvironment(): void {
    this.vitals.setColdEnvironment(this.clock.snapshot().phase === 'night' && !this.gameplay.isWarm(this.currentPlayer.position));
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
