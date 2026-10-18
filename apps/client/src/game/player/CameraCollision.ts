import { Raycaster, Vector3, type Object3D } from 'three';
import type { Vector3Data } from '@forest-survival/shared';

const ray = new Raycaster();
const start = new Vector3();
const direction = new Vector3();
const offsets = [[0, 0, 0], [0.18, 0, 0], [-0.18, 0, 0], [0, 0.18, 0], [0, -0.18, 0]] as const;

// Several probes reserve space for the camera near plane around thin obstacles.
export function resolveCameraCollision(target: Vector3Data, desired: Vector3Data, obstacles: Object3D[]): Vector3Data {
  direction.set(desired.x - target.x, desired.y - target.y, desired.z - target.z);
  const distance = direction.length();
  if (distance < 0.001) return { ...desired };
  direction.normalize();
  let allowed = distance;
  for (const [x, y, z] of offsets) {
    start.set(target.x + x, target.y + y, target.z + z);
    ray.set(start, direction);
    ray.near = 0;
    ray.far = distance + 0.25;
    const hit = ray.intersectObjects(obstacles, false)[0];
    if (hit) allowed = Math.min(allowed, Math.max(0, hit.distance - 0.25));
  }
  return { x: target.x + direction.x * allowed, y: target.y + direction.y * allowed, z: target.z + direction.z * allowed };
}
