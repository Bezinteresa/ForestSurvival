import * as THREE from 'three';
import type { WorldClockSnapshot } from '@forest-survival/shared';

const TRANSITION_SECONDS = 10;
export function daylightFor(clock: WorldClockSnapshot): number {
  if (clock.phase === 'night') return 0;
  const progress = Math.min(1, Math.max(0, Math.min(clock.phaseElapsed, clock.secondsRemaining) / TRANSITION_SECONDS));
  return progress * progress * (3 - 2 * progress);
}

export class DayNightView {
  private readonly sky = new THREE.Color();
  private readonly daySky = new THREE.Color(0x9dbaa8);
  private readonly nightSky = new THREE.Color(0x172435);
  private readonly hemisphere = new THREE.HemisphereLight(0xd8efff, 0x44552d, 2.4);
  private readonly sun = new THREE.DirectionalLight(0xffe4ac, 3.1);
  private readonly fog: THREE.Fog;

  constructor(scene: THREE.Scene) {
    this.sky.copy(this.nightSky);
    scene.background = this.sky;
    this.fog = new THREE.Fog(this.sky, 35, 80);
    scene.fog = this.fog;
    this.hemisphere.intensity = 0.8;
    this.sun.intensity = 0.35;
    this.sun.position.set(-8, 14, 7);
    scene.add(this.hemisphere, this.sun);
  }

  update(clock: WorldClockSnapshot): void {
    const daylight = daylightFor(clock);
    this.sky.lerpColors(this.nightSky, this.daySky, daylight);
    this.fog.color.copy(this.sky);
    // Keep the prototype readable at night before lamps and final lighting exist.
    this.hemisphere.intensity = 0.8 + 1.6 * daylight;
    this.sun.intensity = 0.35 + 2.75 * daylight;
  }
}
