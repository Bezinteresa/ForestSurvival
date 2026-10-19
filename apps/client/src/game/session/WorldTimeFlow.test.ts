import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIMULATION_CONFIG } from '@forest-survival/shared';
import type { GameFrame } from '../core/GameView';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';
import { LocalSession } from './LocalSession';

const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); });
async function setup(debugTools = false) {
  const session = await LocalSession.create({ debugTools });
  const scheduler = new FakeScheduler();
  let lastFrame: GameFrame | undefined;
  const game = new Game(session, { render: (frame) => { lastFrame = frame; }, destroy: () => {} }, scheduler, (error) => { throw error; });
  resources.push(game);
  game.start();
  return { session, scheduler, game, lastFrame: () => lastFrame };
}
function renderFor(scheduler: FakeScheduler, seconds: number, fps = 60) { scheduler.advance(0); for (let frame = 1; frame <= seconds * fps; frame++) scheduler.advance(frame * 1000 / fps); }

describe('world clock through the real local simulation', () => {
  it.each([30, 60, 144])('crosses night and dawn once at %i render FPS with matching survival time', async (fps) => {
    const run = await setup();
    const dawns: number[] = [];
    let previous = 0;
    run.session.subscribe((snapshot) => { if (snapshot.clock.physicalCycles > previous) { dawns.push(snapshot.clock.lastDawnAt!); previous = snapshot.clock.physicalCycles; } });
    renderFor(run.scheduler, 241, fps);
    const snapshot = run.session.getSnapshot();
    expect(snapshot.simulationTime).toBeCloseTo(241);
    expect(snapshot.clock).toMatchObject({ phase: 'day', physicalCycles: 1, creditedDays: 1, cycleNumber: 2, dayMultiplier: 1, lastDawnAt: 240 });
    expect(snapshot.clock.secondsRemaining).toBeCloseTo(179);
    expect(snapshot.vitals.hunger).toBeCloseTo(39.75);
    expect(snapshot.vitals.health).toBeCloseTo(50, 6);
    expect(snapshot.vitals.cold).toMatchObject({ exposed: false, exposureSeconds: 0, freezing: false });
    expect(snapshot.gameplay.campfire.fuelSeconds).toBe(0);
    expect(dawns).toEqual([240]);
    expect(run.lastFrame()?.clock).toEqual(snapshot.clock);
    run.session.sendCommand({ type: 'reset-player', requestId: 'reset-after-dawn' });
    expect(run.session.getSnapshot().clock).toEqual(snapshot.clock);
  });

  it.each([20, 200])('uses identical fixed steps at x20 over %i seconds for movement, hunger, cold, fuel and one-shot input', async (seconds) => {
    const normal = await setup(true);
    const fast = await setup(true);
    expect(fast.game.setSimulationSpeed(20).accepted).toBe(true);
    const send = vi.spyOn(fast.session, 'sendCommand');
    for (const run of [normal, fast]) {
      run.game.input.setMove('test', -1, 0);
      run.game.input.setHeld('Primary', 'test', true);
    }
    renderFor(normal.scheduler, seconds);
    renderFor(fast.scheduler, seconds / 20);
    expect(fast.session.getSnapshot()).toEqual(normal.session.getSnapshot());
    expect(fast.session.getSnapshot().simulationTime).toBeCloseTo(seconds);
    expect(fast.session.getSnapshot().vitals.hunger).toBeCloseTo(100 - seconds * 0.25);
    expect(fast.session.getSnapshot().vitals.health).toBeCloseTo(seconds === 200 ? 90 : 100);
    expect(fast.session.getSnapshot().gameplay.campfire.fuelSeconds).toBeCloseTo(Math.max(0, 60 - seconds));
    expect(send.mock.calls.filter(([command]) => command.type === 'use-item')).toHaveLength(1);
  });

  it('gates speed, limits catch-up and freezes clocks on pause while inventory keeps them running', async () => {
    const ordinary = await setup();
    ordinary.game.setDebug(true);
    expect(ordinary.game.setSimulationSpeed(20).reason).toBe('forbidden');
    const run = await setup(true);
    for (const invalid of [0, 2, 21, NaN, Infinity]) expect(run.game.setSimulationSpeed(invalid).reason).toBe('invalid');
    run.game.setSimulationSpeed(20);
    run.scheduler.advance(0);
    run.scheduler.advance(60000);
    expect(run.session.getSnapshot().simulationTime).toBeCloseTo(SIMULATION_CONFIG.maxSubSteps * SIMULATION_CONFIG.fixedStep * 20);
    run.game.pause();
    const paused = run.session.getSnapshot();
    run.scheduler.advance(100000);
    run.session.step(SIMULATION_CONFIG.fixedStep);
    expect(run.session.getSnapshot()).toEqual(paused);
    run.game.setSimulationSpeed(5);
    run.game.start();
    run.game.toggleInventory();
    run.scheduler.advance(200000);
    expect(run.session.getSnapshot().simulationTime).toBe(paused.simulationTime);
    for (let frame = 1; frame <= 60; frame++) run.scheduler.advance(200000 + frame * 1000 / 60);
    const inInventory = run.session.getSnapshot();
    expect(inInventory.simulationTime).toBeCloseTo(paused.simulationTime + 5);
    expect(inInventory.clock.phaseElapsed).toBeCloseTo(inInventory.simulationTime);
    expect(inInventory.vitals.hunger).toBeCloseTo(100 - inInventory.simulationTime * 0.25);
    expect(run.game.input.enabled).toBe(false);
  });

  it('stops accelerated steps at death and starts a new run with fresh clock and x1 speed', async () => {
    const run = await setup(true);
    run.game.setSimulationSpeed(20);
    renderFor(run.scheduler, 22);
    const ended = run.session.getSnapshot();
    expect(ended.status).toBe('ended');
    expect(ended.simulationTime).toBeCloseTo(410);
    expect(ended.vitals.deathAt).toBeCloseTo(410);
    expect(ended.clock).toMatchObject({ phase: 'day', cycleNumber: 2, physicalCycles: 1, creditedDays: 1 });
    expect(run.scheduler.pending.size).toBe(0);
    expect(run.game.setSimulationSpeed(1).reason).toBe('dead');
    run.game.start();
    run.scheduler.advance(60000);
    expect(run.session.getSnapshot()).toEqual(ended);
    run.game.destroy();
    expect(() => run.session.getSnapshot()).not.toThrow();
    const fresh = await setup(true);
    renderFor(fresh.scheduler, 1);
    expect(fresh.session.getSnapshot().simulationTime).toBeCloseTo(1);
    expect(fresh.session.getSnapshot().clock).toMatchObject({ cycleNumber: 1, physicalCycles: 0, creditedDays: 0 });
  });
});
