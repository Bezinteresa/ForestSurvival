import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { NEUTRAL_PLAYER_INPUT, PLAYER_CONFIG, SIMULATION_CONFIG } from '@forest-survival/shared';
import { LocalSession } from '../session/LocalSession';
import { PhysicsWorld } from '../world/PhysicsWorld';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { CameraController, getCameraPlacement } from './CameraController';
import { resolveCameraCollision } from './CameraCollision';
import { DEFAULT_CONTROL_SETTINGS } from '../input/ControlSettings';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
const dt = SIMULATION_CONFIG.fixedStep;

async function settledSession() {
  const session = await LocalSession.create();
  resources.push(session);
  session.start();
  for (let i = 0; i < 180; i++) session.step(dt);
  return session;
}

describe('movement with real Rapier', () => {
  it('normalizes diagonal movement and rotates it with camera yaw', async () => {
    const forward = await settledSession();
    const diagonal = await settledSession();
    const rotated = await settledSession();
    for (let i = 0; i < 60; i++) {
      forward.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveY: 1 });
      diagonal.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveY: 1, moveX: 1 });
      rotated.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveY: 1, cameraYaw: -Math.PI / 2 });
    }
    const a = forward.getSnapshot().player.position;
    const b = diagonal.getSnapshot().player.position;
    const c = rotated.getSnapshot().player.position;
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(PLAYER_CONFIG.walkSpeed, 3);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(PLAYER_CONFIG.walkSpeed, 3);
    expect(c.x).toBeLessThan(-3.5);
    expect(Math.abs(c.z)).toBeLessThan(0.001);
  });

  it('runs faster while preserving collision and prevents a second midair jump', async () => {
    const walking = await settledSession();
    const running = await settledSession();
    for (let i = 0; i < 60; i++) {
      walking.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveY: 1 });
      running.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveY: 1, sprint: true });
    }
    expect(-running.getSnapshot().player.position.z).toBeCloseTo(PLAYER_CONFIG.runSpeed, 3);
    expect(-walking.getSnapshot().player.position.z).toBeCloseTo(PLAYER_CONFIG.walkSpeed, 3);
    const first = await settledSession(), repeated = await settledSession();
    for (let i = 0; i < 25; i++) {
      first.step(dt, { ...NEUTRAL_PLAYER_INPUT, jump: i === 0 });
      repeated.step(dt, { ...NEUTRAL_PLAYER_INPUT, jump: i === 0 || i === 12 });
    }
    expect(first.getSnapshot().player.position.y).toBeGreaterThan(1.8);
    expect(repeated.getSnapshot().player.position.y).toBeCloseTo(first.getSnapshot().player.position.y, 5);
    for (let i = 0; i < 100; i++) first.step(dt);
    expect(first.getSnapshot().player.grounded).toBe(true);
  });

  it('climbs a low step but cannot climb the tall wall by spamming jump', async () => {
    const physics = await PhysicsWorld.create();
    resources.push(physics);
    for (let i = 0; i < 180; i++) physics.step(dt);
    let maxHeight = 0;
    for (let i = 0; i < 90; i++) {
      physics.step(dt, { x: -PLAYER_CONFIG.walkSpeed * dt, z: 0 });
      maxHeight = Math.max(maxHeight, physics.getPlayerSnapshot().position.y);
    }
    expect(physics.getPlayerSnapshot().position.x).toBeLessThan(-4);
    expect(maxHeight).toBeGreaterThan(1.05);
    const session = await settledSession();
    for (let i = 0; i < 240; i++) session.step(dt, { ...NEUTRAL_PLAYER_INPUT, moveX: 1, jump: i % 10 === 0 });
    expect(session.getSnapshot().player.position.x).toBeLessThan(3.6);
  });

  it.each([30, 60, 144])('keeps actual motion consistent at %i render FPS', async (fps) => {
    const session = await LocalSession.create();
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    game.input.setMove('test', 0, 1);
    scheduler.advance(0);
    for (let i = 1; i <= fps; i++) scheduler.advance(i * 1000 / fps);
    expect(session.getSnapshot().simulationTime).toBeCloseTo(1, 6);
    expect(session.getSnapshot().player.position.z).toBeCloseTo(-PLAYER_CONFIG.walkSpeed, 3);
    game.pause();
    game.start();
    expect(game.input.consumeFrame().move).toEqual({ x: 0, y: 0 });
  });
});

describe('camera without WebGL', () => {
  it('limits pitch and zoom and produces a forward view in first person', () => {
    const camera = new CameraController();
    camera.look({ mouse: { x: 0, y: 100000 }, touch: { x: 0, y: 0 } }, DEFAULT_CONTROL_SETTINGS);
    expect(camera.getPose().pitch).toBe(1.35);
    for (let i = 0; i < 20; i++) camera.zoom(-1);
    expect(camera.firstPerson).toBe(true);
    const placement = getCameraPlacement({ x: 0, y: 1, z: 0 }, camera.getPose());
    expect(placement.position.y).toBeCloseTo(1.61);
    expect(placement.target.z).toBeLessThan(placement.position.z);
    for (let i = 0; i < 100; i++) camera.zoom(1);
    expect(camera.getPose().distance).toBe(12);
  });

  it('applies touch sensitivity and inversion independently of mouse sensitivity', () => {
    const normal = new CameraController(), inverted = new CameraController();
    const delta = { mouse: { x: 0, y: 0 }, touch: { x: 10, y: 10 } };
    normal.look(delta, DEFAULT_CONTROL_SETTINGS);
    inverted.look(delta, { ...DEFAULT_CONTROL_SETTINGS, invertY: true });
    expect(normal.cameraYaw).toBeCloseTo(0.04);
    expect(normal.getPose().pitch).toBeGreaterThan(0.26);
    expect(inverted.getPose().pitch).toBeLessThan(0.26);
  });

  it('pulls the camera in front of a wall instead of passing through it', () => {
    const geometry = new BoxGeometry(10, 3, 0.4);
    const material = new MeshBasicMaterial();
    const wall = new Mesh(geometry, material);
    wall.position.set(0, 1.5, 3);
    wall.updateMatrixWorld(true);
    const resolved = resolveCameraCollision({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.5, z: 6 }, [wall]);
    expect(resolved.z).toBeGreaterThan(2);
    expect(resolved.z).toBeLessThan(2.6);
    geometry.dispose(); material.dispose();
  });
});
