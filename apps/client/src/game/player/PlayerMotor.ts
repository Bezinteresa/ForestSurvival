import { PLAYER_CONFIG, type PlayerControlFrame } from '@forest-survival/shared';
import { normalizeAxis } from '../input/InputState';

export function buildPlayerMotion(input: PlayerControlFrame, currentYaw: number, dt: number) {
  const move = normalizeAxis(input.moveX, input.moveY);
  const speed = input.sprint ? PLAYER_CONFIG.runSpeed : PLAYER_CONFIG.walkSpeed;
  const x = (move.x * Math.cos(input.cameraYaw) + move.y * Math.sin(input.cameraYaw)) * speed * dt;
  const z = (move.x * Math.sin(input.cameraYaw) - move.y * Math.cos(input.cameraYaw)) * speed * dt;
  const targetYaw = input.faceCamera ? Math.atan2(Math.sin(input.cameraYaw), -Math.cos(input.cameraYaw)) : Math.hypot(x, z) > 0.0001 ? Math.atan2(x, z) : currentYaw;
  const difference = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
  const yaw = input.faceCamera ? targetYaw : currentYaw + difference * (1 - Math.exp(-PLAYER_CONFIG.turnSpeed * dt));
  return { displacement: { x, z }, yaw, jump: input.jump };
}
