import { afterEach, describe, expect, it } from 'vitest';
import { NEUTRAL_PLAYER_INPUT, PLAYER_CONFIG, SIMULATION_CONFIG, type PlayerControlFrame } from '@forest-survival/shared';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
const dt = SIMULATION_CONFIG.fixedStep;
const running = { ...NEUTRAL_PLAYER_INPUT, moveY: 1, sprint: true };
function advance(session: LocalSession, frames: number, input: PlayerControlFrame = NEUTRAL_PLAYER_INPUT) {
  for (let frame = 0; frame < frames; frame++) session.step(dt, input);
}
async function setup(debugTools = false) {
  const session = await LocalSession.create({ debugTools });
  resources.push(session);
  session.start();
  advance(session, 180);
  return session;
}

describe('sprint hunger after real Rapier movement', () => {
  it('charges x2 for forward/diagonal sprint, but not walking or Ctrl while looking around', async () => {
    for (const [input, cost] of [
      [{ ...NEUTRAL_PLAYER_INPUT, sprint: true, cameraYaw: 1, faceCamera: true }, 0.25],
      [{ ...NEUTRAL_PLAYER_INPUT, moveY: 1 }, 0.25],
      [running, 0.5],
      [{ ...running, moveX: 1 }, 0.5],
    ] as const) {
      const session = await setup();
      const before = session.getSnapshot().vitals.hunger;
      advance(session, 60, input);
      expect(before - session.getSnapshot().vitals.hunger).toBeCloseTo(cost, 7);
    }
  });

  it('stops the extra cost immediately on stopping movement or releasing sprint', async () => {
    const session = await setup();
    const before = session.getSnapshot().vitals.hunger;
    advance(session, 60, running);
    advance(session, 60, { ...NEUTRAL_PLAYER_INPUT, sprint: true });
    advance(session, 60, { ...NEUTRAL_PLAYER_INPUT, moveY: -1 });
    expect(before - session.getSnapshot().vitals.hunger).toBeCloseTo(1, 7);
  });

  it('does not charge sprint while blocked by a wall, but does charge movement along it', async () => {
    const session = await setup();
    const intoWall = { ...NEUTRAL_PLAYER_INPUT, moveX: 1, sprint: true };
    advance(session, 120, intoWall);
    const blocked = session.getSnapshot();
    expect(blocked.player.position.x).toBeGreaterThan(3);
    expect(blocked.player.position.x).toBeLessThan(3.5);
    advance(session, 60, intoWall);
    expect(session.getSnapshot().player.position.x).toBeCloseTo(blocked.player.position.x, 4);
    expect(blocked.vitals.hunger - session.getSnapshot().vitals.hunger).toBeCloseTo(0.25, 7);
    const beforeSlide = session.getSnapshot();
    advance(session, 60, { ...intoWall, moveY: 1 });
    expect(session.getSnapshot().player.position.z).toBeLessThan(beforeSlide.player.position.z - 3);
    expect(beforeSlide.vitals.hunger - session.getSnapshot().vitals.hunger).toBeCloseTo(0.5, 7);
  });

  it('ignores vertical jumping with Ctrl, while keeping the surcharge for a moving sprint jump', async () => {
    for (const moving of [false, true]) {
      const session = await setup();
      const before = session.getSnapshot().vitals.hunger;
      session.step(dt, { ...running, moveY: moving ? 1 : 0, jump: true });
      expect(session.getSnapshot().player.grounded).toBe(false);
      advance(session, 29, { ...running, moveY: moving ? 1 : 0 });
      expect(before - session.getSnapshot().vitals.hunger).toBeCloseTo(moving ? 0.25 : 0.125, 7);
    }
  });

  it('does not turn a position reset into running or preserve activity in a fresh run', async () => {
    const session = await setup();
    advance(session, 60, running);
    const before = session.getSnapshot().vitals;
    expect(session.sendCommand({ type: 'reset-player', requestId: 'reset' }).accepted).toBe(true);
    expect(session.getSnapshot().vitals).toEqual(before);
    advance(session, 60, { ...NEUTRAL_PLAYER_INPUT, sprint: true });
    expect(before.hunger - session.getSnapshot().vitals.hunger).toBeCloseTo(0.25, 7);
    const fresh = await LocalSession.create();
    resources.push(fresh);
    expect(fresh.getSnapshot().vitals).toMatchObject({ hunger: 100, health: 100, dead: false });
  });

  it.each([30, 60, 144])('has the same sprint motion and hunger through Game at %i render FPS', async (fps) => {
    const session = await setup();
    session.pause();
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    const before = session.getSnapshot();
    game.input.setMove('test', 0, 1);
    game.input.setHeld('Sprint', 'test', true);
    scheduler.advance(0);
    for (let frame = 1; frame <= fps; frame++) scheduler.advance(frame * 1000 / fps);
    expect(session.getSnapshot().simulationTime - before.simulationTime).toBeCloseTo(1, 6);
    expect(before.player.position.z - session.getSnapshot().player.position.z).toBeCloseTo(PLAYER_CONFIG.runSpeed, 3);
    expect(before.vitals.hunger - session.getSnapshot().vitals.hunger).toBeCloseTo(0.5, 7);
    game.pause();
  });

  it('preserves held sprint and its hunger cost through every x20 simulation substep', async () => {
    const runs = [];
    for (const speed of [1, 20]) {
      const session = await setup(true);
      session.pause();
      const scheduler = new FakeScheduler();
      const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler);
      resources.push(game);
      game.start();
      expect(game.setSimulationSpeed(speed).accepted).toBe(true);
      game.input.setMove('test', 0, 1);
      game.input.setHeld('Sprint', 'test', true);
      runs.push({ session, scheduler, before: session.getSnapshot() });
      scheduler.advance(0);
    }
    const [normal, fast] = runs;
    for (let frame = 1; frame <= 60; frame++) normal!.scheduler.advance(frame * 1000 / 60);
    fast!.scheduler.advance(50);
    expect(fast!.session.getSnapshot()).toEqual(normal!.session.getSnapshot());
    expect(fast!.before.vitals.hunger - fast!.session.getSnapshot().vitals.hunger).toBeCloseTo(0.5, 7);
    expect(fast!.session.getSnapshot().simulationTime - fast!.before.simulationTime).toBeCloseTo(1, 7);
  });

  it('freezes sprint in pause, keeps base hunger in inventory and clears held input on return', async () => {
    const session = await setup();
    session.pause();
    const scheduler = new FakeScheduler();
    const game = new Game(session, { render: () => {}, destroy: () => {} }, scheduler);
    resources.push(game);
    game.start();
    game.input.setMove('test', 0, 1);
    game.input.setHeld('Sprint', 'test', true);
    scheduler.advance(0);
    scheduler.advance(100);
    const beforePause = session.getSnapshot();
    game.pause();
    const paused = session.getSnapshot();
    scheduler.advance(1000);
    advance(session, 60, running);
    expect(session.getSnapshot()).toEqual(paused);
    game.start();
    game.input.setMove('test', 0, 1);
    game.input.setHeld('Sprint', 'test', true);
    game.toggleInventory();
    scheduler.advance(1000);
    for (let frame = 1; frame <= 60; frame++) scheduler.advance(1000 + frame * 1000 / 60);
    const inInventory = session.getSnapshot();
    expect(beforePause.vitals.hunger - inInventory.vitals.hunger).toBeCloseTo(0.25, 7);
    expect(inInventory.player.position.z).toBeCloseTo(beforePause.player.position.z, 5);
    game.closeInventory();
    for (let frame = 61; frame <= 120; frame++) scheduler.advance(1000 + frame * 1000 / 60);
    expect(inInventory.vitals.hunger - session.getSnapshot().vitals.hunger).toBeCloseTo(0.25, 7);
    expect(session.getSnapshot().player.position.z).toBeCloseTo(inInventory.player.position.z, 5);
  });
});
