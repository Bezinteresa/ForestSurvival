import { describe, expect, it } from 'vitest';
import { WorldClock } from '@forest-survival/shared';

describe('world time and dawn credit', () => {
  it('starts on day one and credits only the completed night at dawn', () => {
    const clock = new WorldClock();
    expect(clock.snapshot()).toMatchObject({ phase: 'day', cycleNumber: 1, physicalCycles: 0, creditedDays: 0, secondsRemaining: 180, lastDawnAt: null });
    clock.update(179.999);
    expect(clock.snapshot().phase).toBe('day');
    clock.update(180);
    expect(clock.snapshot()).toMatchObject({ phase: 'night', cycleNumber: 1, secondsRemaining: 60, creditedDays: 0 });
    clock.update(239.999);
    expect(clock.snapshot().physicalCycles).toBe(0);
    clock.update(240);
    expect(clock.snapshot()).toMatchObject({ phase: 'day', cycleNumber: 2, secondsRemaining: 180, physicalCycles: 1, creditedDays: 1, lastDawnAt: 240 });
    const dawn = clock.snapshot();
    for (let repeat = 0; repeat < 20; repeat++) clock.update(240);
    expect(clock.snapshot()).toEqual(dawn);
  });

  it.each([30, 60, 144])('produces the same phases and progress when sampled at %i FPS', (fps) => {
    const clock = new WorldClock();
    for (let frame = 1; frame <= fps * 721; frame++) clock.update(frame / fps);
    expect(clock.snapshot()).toMatchObject({ phase: 'day', physicalCycles: 3, creditedDays: 3, cycleNumber: 4, secondsRemaining: 179, lastDawnAt: 720 });
  });

  it('applies the current multiplier at the next dawn without changing physical phases or prior credit', () => {
    const clock = new WorldClock();
    clock.update(240);
    clock.update(479, 9);
    expect(clock.snapshot()).toMatchObject({ phase: 'night', physicalCycles: 1, creditedDays: 1, dayMultiplier: 9, secondsRemaining: 1 });
    clock.update(480, 9);
    expect(clock.snapshot()).toMatchObject({ phase: 'day', physicalCycles: 2, creditedDays: 10, lastDawnAt: 480 });
    clock.update(480, 1);
    expect(clock.snapshot().creditedDays).toBe(10);
    clock.update(720, 1);
    expect(clock.snapshot().creditedDays).toBe(11);
  });

  it('handles multiple boundaries and caps the displayed target when progress crosses 99', () => {
    const clock = new WorldClock();
    clock.update(96 * 240);
    expect(clock.snapshot()).toMatchObject({ physicalCycles: 96, creditedDays: 96 });
    clock.update(97 * 240, 9);
    expect(clock.snapshot()).toMatchObject({ physicalCycles: 97, creditedDays: 99 });
    clock.update(100 * 240, 9);
    expect(clock.snapshot()).toMatchObject({ physicalCycles: 100, creditedDays: 99, lastDawnAt: 24000 });
  });

  it('rejects time rewinds and invalid multipliers and returns independent snapshots', () => {
    const clock = new WorldClock();
    clock.update(250);
    const before = clock.snapshot();
    for (const time of [-1, 240, NaN, Infinity]) clock.update(time);
    for (const multiplier of [0, 10, 0.5, NaN, Infinity]) clock.update(480, multiplier);
    expect(clock.snapshot()).toEqual(before);
    (before as { creditedDays: number }).creditedDays = 999;
    expect(clock.snapshot().creditedDays).toBe(1);
  });
});
