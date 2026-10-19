export const DAY_NIGHT_CONFIG = { daySeconds: 180, nightSeconds: 60, targetDays: 99, maxDayMultiplier: 9 } as const;
export const DIAGNOSTIC_SPEEDS = [1, 5, 20] as const;
export type SimulationSpeed = typeof DIAGNOSTIC_SPEEDS[number];

export interface WorldClockSnapshot {
  readonly phase: 'day' | 'night';
  readonly cycleNumber: number;
  readonly phaseElapsed: number;
  readonly phaseDuration: number;
  readonly secondsRemaining: number;
  readonly physicalCycles: number;
  readonly creditedDays: number;
  readonly dayMultiplier: number;
  readonly lastDawnAt: number | null;
}

const EPSILON = 1e-7;
const CYCLE_SECONDS = DAY_NIGHT_CONFIG.daySeconds + DAY_NIGHT_CONFIG.nightSeconds;

/** Pure rules driven by the owning session's absolute simulation time. */
export class WorldClock {
  private time = 0;
  private physicalCycles = 0;
  private creditedDays = 0;
  private multiplier = 1;

  update(now: number, dayMultiplier = 1): void {
    if (!Number.isFinite(now) || now < this.time || !Number.isInteger(dayMultiplier) || dayMultiplier < 1 || dayMultiplier > DAY_NIGHT_CONFIG.maxDayMultiplier) return;
    const completed = Math.floor((now + EPSILON) / CYCLE_SECONDS);
    const dawns = completed - this.physicalCycles;
    this.creditedDays = Math.min(DAY_NIGHT_CONFIG.targetDays, this.creditedDays + dawns * dayMultiplier);
    this.physicalCycles = completed;
    this.multiplier = dayMultiplier;
    this.time = now;
  }

  snapshot(): WorldClockSnapshot {
    const elapsed = Math.max(0, this.time - this.physicalCycles * CYCLE_SECONDS);
    const phase = elapsed + EPSILON >= DAY_NIGHT_CONFIG.daySeconds ? 'night' : 'day';
    const duration = phase === 'day' ? DAY_NIGHT_CONFIG.daySeconds : DAY_NIGHT_CONFIG.nightSeconds;
    const phaseElapsed = Math.max(0, Math.min(duration, elapsed - (phase === 'night' ? DAY_NIGHT_CONFIG.daySeconds : 0)));
    return { phase, cycleNumber: this.physicalCycles + 1, phaseElapsed, phaseDuration: duration, secondsRemaining: Math.max(0, duration - phaseElapsed), physicalCycles: this.physicalCycles, creditedDays: this.creditedDays, dayMultiplier: this.multiplier, lastDawnAt: this.physicalCycles ? this.physicalCycles * CYCLE_SECONDS : null };
  }
}
