import type { Collider, KinematicCharacterController, RigidBody, World } from '@dimforge/rapier3d-compat';
import { PLAYER_CONFIG, SIMULATION_CONFIG, TEST_WORLD, type PlayerSnapshot, type Vector3Data } from '@forest-survival/shared';

type Rapier = typeof import('@dimforge/rapier3d-compat')['default'];
let rapierPromise: Promise<Rapier> | undefined;

function loadRapier(): Promise<Rapier> {
  if (!rapierPromise) {
    rapierPromise = import('@dimforge/rapier3d-compat').then(async ({ default: rapier }) => {
      await rapier.init();
      return rapier;
    }).catch((error: unknown) => {
      rapierPromise = undefined;
      throw error;
    });
  }
  return rapierPromise;
}

export interface DebugGeometry {
  readonly vertices: Float32Array;
}

export class PhysicsWorld {
  private readonly player: RigidBody;
  private readonly playerCollider: Collider;
  private readonly controller: KinematicCharacterController;
  private verticalVelocity = 0;
  private grounded = false;
  private destroyed = false;

  static async create(): Promise<PhysicsWorld> {
    const rapier = await loadRapier();
    const world = new rapier.World({ x: 0, y: SIMULATION_CONFIG.gravity, z: 0 });
    try {
      return new PhysicsWorld(rapier, world);
    } catch (error) {
      world.free();
      throw error;
    }
  }

  private constructor(rapier: Rapier, private readonly world: World) {
    world.timestep = SIMULATION_CONFIG.fixedStep;
    for (const box of [TEST_WORLD.ground, ...TEST_WORLD.walls]) {
      world.createCollider(rapier.ColliderDesc.cuboid(box.halfSize.x, box.halfSize.y, box.halfSize.z).setTranslation(box.position.x, box.position.y, box.position.z));
    }
    for (const tree of TEST_WORLD.trees) {
      world.createCollider(rapier.ColliderDesc.cylinder(tree.trunkHeight / 2, tree.radius).setTranslation(tree.position.x, tree.trunkHeight / 2, tree.position.z));
    }
    const spawn = PLAYER_CONFIG.spawn;
    this.player = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z));
    this.playerCollider = world.createCollider(rapier.ColliderDesc.capsule(PLAYER_CONFIG.halfHeight, PLAYER_CONFIG.radius), this.player);
    this.controller = world.createCharacterController(PLAYER_CONFIG.collisionOffset);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI / 3);
    world.step();
  }

  step(dt: number, displacement: Readonly<{ x: number; z: number }> = { x: 0, z: 0 }): void {
    this.assertAlive();
    if (!Number.isFinite(dt) || dt <= 0 || dt > SIMULATION_CONFIG.maxFrameDelta) throw new Error('Invalid physics timestep');
    if (!Number.isFinite(displacement.x) || !Number.isFinite(displacement.z)) throw new Error('Invalid displacement');
    this.verticalVelocity = Math.max(-SIMULATION_CONFIG.terminalVelocity, this.verticalVelocity + SIMULATION_CONFIG.gravity * dt);
    this.controller.computeColliderMovement(this.playerCollider, { x: displacement.x, y: this.verticalVelocity * dt, z: displacement.z });
    const movement = this.controller.computedMovement();
    const position = this.player.translation();
    this.player.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
    this.world.timestep = dt;
    this.world.step();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded) this.verticalVelocity = 0;
  }

  getPlayerSnapshot(): PlayerSnapshot {
    this.assertAlive();
    const position = this.player.translation();
    return { id: PLAYER_CONFIG.id, position: { x: position.x, y: position.y, z: position.z }, grounded: this.grounded };
  }

  resetPlayer(): void {
    this.assertAlive();
    this.player.setTranslation(PLAYER_CONFIG.spawn, true);
    this.player.setNextKinematicTranslation(PLAYER_CONFIG.spawn);
    this.verticalVelocity = 0;
    this.grounded = false;
    this.world.step();
  }

  getDebugGeometry(): DebugGeometry {
    this.assertAlive();
    return { vertices: this.world.debugRender().vertices };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.world.removeCharacterController(this.controller);
    this.world.free();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Physics world is destroyed');
  }
}

export function interpolatePosition(previous: Vector3Data, current: Vector3Data, alpha: number): Vector3Data {
  const t = Math.max(0, Math.min(1, alpha));
  return { x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t, z: previous.z + (current.z - previous.z) * t };
}
