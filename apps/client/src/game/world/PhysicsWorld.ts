import type { Collider, KinematicCharacterController, RigidBody, World } from '@dimforge/rapier3d-compat';
import { CAMPFIRE_LEVELS, MAP_LIMIT_CONFIG, CAMPFIRE_CONFIG, WORKBENCH_CONFIG, ALL_BUILD_SITES, BUILDING_DEFINITIONS, buildingBox, type BuildingKind, type BoxDefinition } from '@forest-survival/shared';
import { CAMP_STORAGE, INVENTORY_CONFIG, PLAYER_CONFIG, SIMULATION_CONFIG, TEST_WORLD, TEST_MATERIAL_NODES, TRAINING_DUMMY, type PlayerSnapshot, type Vector3Data } from '@forest-survival/shared';

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
  private readonly entityColliders = new Map<string, Collider>();
  /** Fog boundary walls (+x, -x, +z, -z) that move outward as the campfire opens the map. */
  private readonly mapLimits: Collider[] = [];
  private readonly player: RigidBody;
  private readonly playerCollider: Collider;
  private readonly controller: KinematicCharacterController;
  private verticalVelocity = 0;
  private grounded = false;
  private destroyed = false;
  private workbenchBuilt = false;

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

  private constructor(private readonly rapier: Rapier, private readonly world: World) {
    world.timestep = SIMULATION_CONFIG.fixedStep;
    // An analytical plane avoids capsule/large-cuboid normal jitter on this flat test map.
    // The perimeter walls keep the playable area inside the visible floor.
    const floorY = TEST_WORLD.ground.position.y + TEST_WORLD.ground.halfSize.y;
    world.createCollider(new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 })).setTranslation(0, floorY, 0));
    for (const box of TEST_WORLD.walls) {
      world.createCollider(rapier.ColliderDesc.cuboid(box.halfSize.x, box.halfSize.y, box.halfSize.z).setTranslation(box.position.x, box.position.y, box.position.z));
    }
    const limit = MAP_LIMIT_CONFIG;
    for (const axis of ['x', 'x', 'z', 'z'] as const) {
      const halfSize = axis === 'x' ? { x: limit.thickness / 2, y: limit.height / 2, z: limit.length } : { x: limit.length, y: limit.height / 2, z: limit.thickness / 2 };
      this.mapLimits.push(world.createCollider(rapier.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z)));
    }
    this.setMapHalfSize(CAMPFIRE_LEVELS[1].mapHalfSize);
    for (const tree of TEST_WORLD.trees) {
      this.entityColliders.set(tree.id, world.createCollider(rapier.ColliderDesc.cylinder(tree.trunkHeight / 2, tree.radius).setTranslation(tree.position.x, tree.position.y + tree.trunkHeight / 2, tree.position.z)));
    }
    this.entityColliders.set(TRAINING_DUMMY.id, world.createCollider(rapier.ColliderDesc.cuboid(TRAINING_DUMMY.radius, TRAINING_DUMMY.height / 2, TRAINING_DUMMY.radius).setTranslation(TRAINING_DUMMY.position.x, TRAINING_DUMMY.height / 2, TRAINING_DUMMY.position.z)));
    for (const node of TEST_MATERIAL_NODES) {
      this.entityColliders.set(node.id, world.createCollider(rapier.ColliderDesc.cylinder(node.height / 2, node.radius).setTranslation(node.position.x, node.position.y + node.height / 2, node.position.z)));
    }
    const storage = CAMP_STORAGE;
    this.entityColliders.set(storage.id, world.createCollider(rapier.ColliderDesc.cuboid(storage.halfSize.x, storage.halfSize.y, storage.halfSize.z).setTranslation(storage.position.x, storage.position.y, storage.position.z)));
    const fire = CAMPFIRE_CONFIG;
    this.entityColliders.set(fire.id, world.createCollider(rapier.ColliderDesc.cylinder(fire.baseHeight / 2, fire.radius).setTranslation(fire.position.x, fire.position.y + fire.baseHeight / 2, fire.position.z)));
    // Register the blueprint as a sensor so construction can activate it without an extra physics step.
    const bench = WORKBENCH_CONFIG;
    this.entityColliders.set(bench.id, world.createCollider(rapier.ColliderDesc.cuboid(bench.halfSize.x, bench.halfSize.y, bench.halfSize.z).setTranslation(bench.position.x, bench.position.y, bench.position.z).setSensor(true)));
    const spawn = PLAYER_CONFIG.spawn;
    for (const site of ALL_BUILD_SITES) for (const kind of Object.keys(BUILDING_DEFINITIONS) as BuildingKind[]) for (const rotation of [0, 1] as const) {
      const box = buildingBox({ siteId: site.id, kind, rotation });
      if (!box) continue;
      this.entityColliders.set(box.id, world.createCollider(rapier.ColliderDesc.cuboid(box.halfSize.x, box.halfSize.y, box.halfSize.z).setTranslation(box.position.x, box.position.y, box.position.z).setSensor(true)));
    }
    this.player = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z));
    this.playerCollider = world.createCollider(rapier.ColliderDesc.capsule(PLAYER_CONFIG.halfHeight, PLAYER_CONFIG.radius), this.player);
    this.controller = world.createCharacterController(PLAYER_CONFIG.collisionOffset);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.controller.setMinSlopeSlideAngle(Math.PI / 3);
    this.controller.enableAutostep(PLAYER_CONFIG.stepHeight, 0.2, false);
    this.controller.enableSnapToGround(0.2);
    world.step();
  }

  step(dt: number, displacement: Readonly<{ x: number; z: number }> = { x: 0, z: 0 }, jump = false): void {
    this.assertAlive();
    if (!Number.isFinite(dt) || dt <= 0 || dt > SIMULATION_CONFIG.maxFrameDelta) throw new Error('Invalid physics timestep');
    if (!Number.isFinite(displacement.x) || !Number.isFinite(displacement.z)) throw new Error('Invalid displacement');
    if (jump && this.grounded) this.verticalVelocity = PLAYER_CONFIG.jumpSpeed;
    this.verticalVelocity = Math.max(-SIMULATION_CONFIG.terminalVelocity, this.verticalVelocity + SIMULATION_CONFIG.gravity * dt);
    this.controller.computeColliderMovement(this.playerCollider, { x: displacement.x, y: this.verticalVelocity * dt, z: displacement.z }, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement = this.controller.computedMovement();
    const position = this.player.translation();
    this.player.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
    this.world.timestep = dt;
    this.world.step();
    this.grounded = this.controller.computedGrounded();
    if (this.verticalVelocity > 0 && movement.y < this.verticalVelocity * dt - 0.001) this.verticalVelocity = 0;
    if (this.grounded) this.verticalVelocity = 0;
  }

  getPlayerSnapshot(): Omit<PlayerSnapshot, 'yaw'> {
    this.assertAlive();
    const position = this.player.translation();
    return { id: PLAYER_CONFIG.id, position: { x: position.x, y: position.y, z: position.z }, grounded: this.grounded };
  }

  hasLineOfSight(from: Vector3Data, to: Vector3Data, targetId?: string): boolean {
    this.assertAlive();
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.001) return true;
    const ray = new this.rapier.Ray(from, { x: dx / distance, y: dy / distance, z: dz / distance });
    const ignored = targetId ? this.entityColliders.get(targetId) : undefined;
    return !this.world.castRay(ray, Math.max(0, distance - 0.01), true, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.playerCollider, undefined, (collider) => collider.handle !== ignored?.handle);
  }

  setMapHalfSize(halfSize: number): void {
    if (!Number.isFinite(halfSize) || halfSize <= 0) return;
    const offset = halfSize + MAP_LIMIT_CONFIG.thickness / 2;
    const y = MAP_LIMIT_CONFIG.height / 2;
    const positions = [{ x: offset, y, z: 0 }, { x: -offset, y, z: 0 }, { x: 0, y, z: offset }, { x: 0, y, z: -offset }];
    this.mapLimits.forEach((collider, index) => collider.setTranslation(positions[index]!));
  }

  removeEntityCollider(id: string): void {
    this.assertAlive();
    const collider = this.entityColliders.get(id);
    if (!collider) return;
    this.entityColliders.delete(id);
    this.world.removeCollider(collider, false);
  }

  canPlaceWorkbench(): boolean {
    this.assertAlive();
    const { id, position, halfSize } = WORKBENCH_CONFIG;
    if (this.workbenchBuilt) return false;
    return !this.world.intersectionWithShape(position, { x: 0, y: 0, z: 0, w: 1 }, new this.rapier.Cuboid(halfSize.x, halfSize.y, halfSize.z), undefined, undefined, this.entityColliders.get(id));
  }

  addWorkbenchCollider(): void {
    this.assertAlive();
    if (this.workbenchBuilt) return;
    this.entityColliders.get(WORKBENCH_CONFIG.id)!.setSensor(false);
    this.workbenchBuilt = true;
  }

  findDropPosition(player: PlayerSnapshot, yaw: number): Vector3Data | null {
    this.assertAlive();
    if (!player.grounded || !Number.isFinite(yaw)) return null;
    const x = player.position.x + Math.sin(yaw) * INVENTORY_CONFIG.dropDistance;
    const z = player.position.z + Math.cos(yaw) * INVENTORY_CONFIG.dropDistance;
    const ray = new this.rapier.Ray({ x, y: player.position.y + 0.5, z }, { x: 0, y: -1, z: 0 });
    const ground = this.world.castRayAndGetNormal(ray, 3, true, this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.playerCollider);
    if (!ground || ground.normal.y < 0.75) return null;
    const surfaceY = ray.origin.y - ground.timeOfImpact;
    const feetY = player.position.y - PLAYER_CONFIG.radius - PLAYER_CONFIG.halfHeight;
    if (Math.abs(surfaceY - feetY) > 0.35) return null;
    const position = { x, y: surfaceY + INVENTORY_CONFIG.dropHeight, z };
    const origin = { ...player.position, y: player.position.y + 0.15 };
    if (!this.hasLineOfSight(origin, position)) return null;
    const obstruction = this.world.intersectionWithShape(position, { x: 0, y: 0, z: 0, w: 1 }, new this.rapier.Cuboid(INVENTORY_CONFIG.dropHalfSize, 0.12, INVENTORY_CONFIG.dropHalfSize), this.rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.playerCollider);
    return obstruction ? null : position;
  }

  canPlaceBuilding(box: BoxDefinition): boolean {
    this.assertAlive();
    if (!this.entityColliders.get(box.id)?.isSensor()) return false;
    const size = box.halfSize;
    return !this.world.intersectionWithShape(box.position, { x: 0, y: 0, z: 0, w: 1 }, new this.rapier.Cuboid(size.x + 0.05, size.y - 0.02, size.z + 0.05), this.rapier.QueryFilterFlags.EXCLUDE_SENSORS);
  }

  activateBuildingCollider(box: BoxDefinition): void {
    this.assertAlive();
    this.entityColliders.get(box.id)!.setSensor(false);
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
    this.entityColliders.clear();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Physics world is destroyed');
  }
}

export function interpolatePosition(previous: Vector3Data, current: Vector3Data, alpha: number): Vector3Data {
  const t = Math.max(0, Math.min(1, alpha));
  return { x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t, z: previous.z + (current.z - previous.z) * t };
}
