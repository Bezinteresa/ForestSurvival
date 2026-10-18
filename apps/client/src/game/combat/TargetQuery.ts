import type { Vector3Data } from '@forest-survival/shared';

export interface TargetPoint {
  readonly id: string;
  readonly position: Vector3Data;
  readonly radius: number;
}

export interface VisibilityQueries {
  hasLineOfSight(from: Vector3Data, to: Vector3Data, targetId?: string): boolean;
  removeEntityCollider(id: string): void;
}

export function selectTarget(candidates: readonly TargetPoint[], origin: Vector3Data, yaw: number, reach: number, halfAngle: number, maxHeight: number, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>): TargetPoint | null {
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  const valid = candidates.filter((target) => {
    const dx = target.position.x - origin.x, dz = target.position.z - origin.z;
    const horizontalDistance = Math.hypot(dx, dz);
    return horizontalDistance - target.radius <= reach
      && Math.abs(target.position.y - origin.y) <= maxHeight
      && (horizontalDistance < 0.001 || (dx * forwardX + dz * forwardZ) / horizontalDistance >= Math.cos(halfAngle));
  }).sort((a, b) => Math.hypot(a.position.x - origin.x, a.position.z - origin.z) - Math.hypot(b.position.x - origin.x, b.position.z - origin.z) || a.id.localeCompare(b.id));
  return valid.find((target) => visibility.hasLineOfSight(origin, target.position, target.id)) ?? null;
}
