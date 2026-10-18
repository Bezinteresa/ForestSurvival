import { describe, expect, it, vi } from 'vitest';
import { SIMULATION_CONFIG } from '@forest-survival/shared';
import { FixedStepLoop } from './FixedStepLoop';
import { FakeScheduler } from './FakeScheduler.test-helper';

describe('fixed timestep', () => {
  it.each([30, 60, 144])('simulates one second at %i render FPS', (fps) => {
    const scheduler = new FakeScheduler();
    let time = 0;
    const render = vi.fn();
    const loop = new FixedStepLoop((dt) => { time += dt; }, render, (error) => { throw error; }, scheduler);
    loop.start();
    scheduler.advance(0);
    for (let frame = 1; frame <= fps; frame++) scheduler.advance(frame * 1000 / fps);
    expect(time).toBeCloseTo(1, 8);
    expect(render).toHaveBeenCalledTimes(fps + 1);
    loop.stop();
    expect(scheduler.pending.size).toBe(0);
  });

  it('limits catch-up after a suspended tab and resets the clock on resume', () => {
    const scheduler = new FakeScheduler();
    const step = vi.fn();
    const loop = new FixedStepLoop(step, () => {}, () => {}, scheduler);
    loop.start();
    loop.start();
    expect(scheduler.pending.size).toBe(1);
    scheduler.advance(0);
    scheduler.advance(60_000);
    expect(step.mock.calls.length).toBeLessThanOrEqual(SIMULATION_CONFIG.maxSubSteps);
    loop.stop();
    const count = step.mock.calls.length;
    loop.start();
    scheduler.advance(200_000);
    expect(step).toHaveBeenCalledTimes(count);
    loop.stop();
  });

  it('stops scheduling after an exception', () => {
    const scheduler = new FakeScheduler();
    const error = new Error('render failed');
    const onError = vi.fn();
    const loop = new FixedStepLoop(() => {}, () => { throw error; }, onError, scheduler);
    loop.start();
    scheduler.advance(0);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(scheduler.pending.size).toBe(0);
  });
});
