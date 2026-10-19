import { describe, expect, it } from 'vitest';
import { PlayerVitals } from './PlayerVitals';

describe('health and hunger rules', () => {
  it('bounds initial values and returns independent snapshots', () => {
    const vitals = new PlayerVitals({ health: 1000, hunger: -5 });
    expect(vitals.snapshot()).toMatchObject({ health: 100, hunger: 0, dead: false });
    const snapshot = vitals.snapshot();
    (snapshot as { health: number }).health = -10;
    expect(vitals.snapshot().health).toBe(100);
    expect(new PlayerVitals({ health: Number.NaN, hunger: Infinity }).snapshot()).toMatchObject({ health: 100, hunger: 100 });
    expect(new PlayerVitals({ health: -1 }).snapshot()).toMatchObject({ health: 0, dead: true, deathAt: 0 });
  });

  it('charges damage only for the portion of the step spent starving', () => {
    const vitals = new PlayerVitals({ hunger: 0.5 });
    vitals.step(2, 2);
    expect(vitals.snapshot()).toMatchObject({ health: 100, hunger: 0 });
    vitals.step(1, 3);
    expect(vitals.snapshot().health).toBe(95);
    const crossing = new PlayerVitals({ hunger: 0.5 });
    crossing.step(3, 3);
    expect(crossing.snapshot().health).toBe(95);
  });

  it.each([30, 60, 144])('has the same hunger and death time at %i update FPS', (fps) => {
    const vitals = new PlayerVitals();
    for (let frame = 1; frame <= 410 * fps; frame++) vitals.step(1 / fps, frame / fps);
    expect(vitals.snapshot().health).toBeCloseTo(50, 5);
    expect(vitals.dead).toBe(false);
    for (let frame = 410 * fps + 1; frame <= 421 * fps; frame++) vitals.step(1 / fps, frame / fps);
    expect(vitals.snapshot()).toMatchObject({ health: 0, hunger: 0, dead: true, deathReason: 'starvation' });
    expect(vitals.snapshot().deathAt).toBeCloseTo(420, 5);
  });

  it('records death once, clamps health to zero and cannot be revived by food', () => {
    const vitals = new PlayerVitals({ health: 10, hunger: 20 });
    expect(vitals.takeDamage(1000, 4)).toBe(true);
    const dead = vitals.snapshot();
    expect(dead).toMatchObject({ health: 0, dead: true, deathAt: 4, deathReason: 'damage' });
    expect(vitals.takeDamage(100, 9)).toBe(false);
    expect(vitals.eat(25)).toBe(false);
    vitals.step(100, 104);
    expect(vitals.snapshot()).toEqual(dead);
  });

  it('restores hunger within its limit and keeps health unchanged', () => {
    const vitals = new PlayerVitals({ health: 40, hunger: 90 });
    expect(vitals.eat(25)).toBe(true);
    expect(vitals.snapshot()).toMatchObject({ health: 40, hunger: 100 });
    expect(vitals.eat(25)).toBe(false);
    expect(vitals.eat(-1)).toBe(false);
    expect(vitals.eat(Number.NaN)).toBe(false);
  });

  it('ignores invalid time and damage values without corrupting state', () => {
    const vitals = new PlayerVitals();
    const before = vitals.snapshot();
    vitals.step(Number.NaN, 1);
    vitals.step(-1, 1);
    vitals.step(1, Number.NaN);
    for (const amount of [0, -1, Number.NaN, Infinity]) expect(vitals.takeDamage(amount, 1)).toBe(false);
    expect(vitals.snapshot()).toEqual(before);
  });
});
