import { describe, expect, it } from 'vitest';
import { PlayerVitals } from './PlayerVitals';

describe('night cold and concurrent survival damage', () => {
  it('gives ten seconds to return, then damages only the exposed portion of the step', () => {
    const vitals = new PlayerVitals();
    vitals.step(9.5, 9.5, false, true);
    expect(vitals.snapshot()).toMatchObject({ health: 100, cold: { exposed: true, exposureSeconds: 9.5, freezing: false } });
    vitals.step(1, 10.5, false, true);
    expect(vitals.snapshot()).toMatchObject({ health: 99.5, cold: { exposureSeconds: 10.5, freezing: true } });
    const snapshot = vitals.snapshot();
    (snapshot.cold as { exposureSeconds: number }).exposureSeconds = 900;
    expect(vitals.snapshot().cold.exposureSeconds).toBe(10.5);
  });

  it('resets exposure in warmth or daytime without healing, including a new departure', () => {
    const vitals = new PlayerVitals();
    vitals.step(15, 15, false, true);
    expect(vitals.snapshot().health).toBe(95);
    vitals.setColdEnvironment(false);
    expect(vitals.snapshot()).toMatchObject({ health: 95, cold: { exposed: false, exposureSeconds: 0, freezing: false } });
    vitals.step(1, 16);
    vitals.step(10, 26, false, true);
    expect(vitals.snapshot().health).toBe(95);
    vitals.step(1, 27, false, true);
    expect(vitals.snapshot().health).toBe(94);
    vitals.step(1, 28);
    expect(vitals.snapshot().cold.exposureSeconds).toBe(0);
  });

  it('adds starvation and cold on the same interval rather than resolving one source first', () => {
    const vitals = new PlayerVitals({ health: 3, hunger: 2.5 });
    vitals.step(9.5, 9.5, false, true);
    expect(vitals.snapshot()).toMatchObject({ health: 3, hunger: 0.125 });
    vitals.step(1.5, 11, false, true);
    expect(vitals.snapshot()).toMatchObject({ health: 0, hunger: 0, deathAt: 10.5, deathReason: 'starvation' });
  });

  it('records cold killing before hunger runs out and consumes time only until death', () => {
    const vitals = new PlayerVitals({ health: 1, hunger: 3 });
    vitals.step(10, 10, false, true);
    vitals.step(3, 13, false, true);
    const dead = vitals.snapshot();
    expect(dead).toMatchObject({ health: 0, hunger: 0.25, deathAt: 11, deathReason: 'cold', cold: { exposureSeconds: 11 } });
    vitals.step(1, 14);
    vitals.setColdEnvironment(false);
    expect(vitals.eat(25)).toBe(false);
    expect(vitals.snapshot()).toEqual(dead);
  });

  it('records starvation killing during the grace period, before cold can deal damage', () => {
    const vitals = new PlayerVitals({ health: 1, hunger: 0 });
    vitals.step(1, 1, true, true);
    expect(vitals.snapshot()).toMatchObject({ health: 0, deathAt: 0.2, deathReason: 'starvation', cold: { exposureSeconds: 0.2, freezing: false } });
  });

  it.each([30, 60, 144])('keeps cold-only death at 110 seconds at %i rule updates per second', (fps) => {
    const vitals = new PlayerVitals();
    for (let frame = 1; frame <= 111 * fps; frame++) vitals.step(1 / fps, frame / fps, false, true);
    expect(vitals.snapshot()).toMatchObject({ health: 0, dead: true, deathReason: 'cold' });
    expect(vitals.snapshot().deathAt).toBeCloseTo(110, 5);
    expect(vitals.snapshot().hunger).toBeCloseTo(72.5, 5);
  });

  it('ignores invalid steps without changing the exposure environment or countdown', () => {
    const vitals = new PlayerVitals();
    vitals.step(5, 5, false, true);
    const before = vitals.snapshot();
    for (const dt of [0, -1, NaN, Infinity]) vitals.step(dt, 6);
    vitals.step(1, NaN);
    vitals.step(1, 0);
    expect(vitals.snapshot()).toEqual(before);
  });
});
