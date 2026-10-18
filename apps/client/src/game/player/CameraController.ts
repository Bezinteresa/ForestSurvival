import type { Vector3Data } from '@forest-survival/shared';
import type { LookDelta } from '../input/InputState';
import type { ControlSettings } from '../input/ControlSettings';

export interface CameraPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly locked: boolean;
  readonly firstPerson: boolean;
}

export class CameraController {
  private yaw = 0;
  private pitch = 0.26;
  private distance = 6;
  private locked = false;

  get firstPerson(): boolean { return this.distance < 0.35; }
  get cameraYaw(): number { return this.yaw; }
  get facesCamera(): boolean { return this.locked || this.firstPerson; }

  toggleLock(): void { this.locked = !this.locked; }
  unlock(): void { this.locked = false; }

  zoom(steps: number): void {
    if (!Number.isFinite(steps)) return;
    this.distance = Math.max(0, Math.min(12, this.distance + Math.max(-3, Math.min(3, steps)) * 0.65));
  }

  look(delta: LookDelta, settings: ControlSettings): void {
    this.yaw += delta.mouse.x * settings.mouseSensitivity + delta.touch.x * settings.touchSensitivity;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    const dy = delta.mouse.y * settings.mouseSensitivity + delta.touch.y * settings.touchSensitivity;
    this.pitch = Math.max(-1.25, Math.min(1.35, this.pitch + dy * (settings.invertY ? -1 : 1)));
  }

  getPose(): CameraPose {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance, locked: this.locked, firstPerson: this.firstPerson };
  }
}

export function getCameraPlacement(player: Vector3Data, pose: CameraPose): { target: Vector3Data; position: Vector3Data } {
  const target = { x: player.x, y: player.y + 0.61, z: player.z };
  const offset = { x: -Math.sin(pose.yaw) * Math.cos(pose.pitch), y: Math.sin(pose.pitch), z: Math.cos(pose.yaw) * Math.cos(pose.pitch) };
  if (pose.firstPerson) return {
    position: target,
    target: { x: target.x - offset.x, y: target.y - offset.y, z: target.z - offset.z },
  };
  return {
    target,
    position: { x: target.x + offset.x * pose.distance, y: target.y + offset.y * pose.distance, z: target.z + offset.z * pose.distance },
  };
}
