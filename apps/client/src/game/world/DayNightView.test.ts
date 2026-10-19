import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldClock } from '@forest-survival/shared';
import { DayNightView, daylightFor } from './DayNightView';

describe('day and night scene presentation without WebGL', () => {
  it('fades dusk and dawn continuously using simulation time', () => {
    const clock = new WorldClock();
    const sample = (time: number) => { clock.update(time); return daylightFor(clock.snapshot()); };
    expect(sample(0)).toBe(0);
    expect(sample(5)).toBeCloseTo(0.5);
    expect(sample(10)).toBe(1);
    expect(sample(170)).toBe(1);
    expect(sample(175)).toBeCloseTo(0.5);
    expect(sample(180)).toBe(0);
    expect(sample(239.999)).toBe(0);
    expect(sample(240)).toBe(0);
    expect(sample(245)).toBeCloseTo(0.5);
  });

  it('changes existing light and fog objects and keeps positive night illumination', () => {
    const scene = new THREE.Scene();
    const view = new DayNightView(scene);
    const clock = new WorldClock();
    clock.update(30);
    view.update(clock.snapshot());
    const dayColor = (scene.background as THREE.Color).clone();
    const lights = scene.children.filter((object): object is THREE.Light => object instanceof THREE.Light);
    const dayIntensity = lights.reduce((sum, light) => sum + light.intensity, 0);
    for (let second = 31; second <= 210; second++) { clock.update(second); view.update(clock.snapshot()); }
    const nightIntensity = lights.reduce((sum, light) => sum + light.intensity, 0);
    expect(nightIntensity).toBeGreaterThan(0);
    expect(nightIntensity).toBeLessThan(dayIntensity);
    expect((scene.background as THREE.Color).equals(dayColor)).toBe(false);
    expect((scene.fog as THREE.Fog).color.equals(scene.background as THREE.Color)).toBe(true);
    expect(scene.children).toEqual(lights);
    view.update(clock.snapshot());
    expect(scene.children).toHaveLength(2);
  });
});
