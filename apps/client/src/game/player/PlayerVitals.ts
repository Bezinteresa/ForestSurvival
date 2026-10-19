import { SURVIVAL_CONFIG, type VitalsSnapshot } from '@forest-survival/shared';

export interface ConsumableEffect { readonly hunger: number; readonly health: number }

const EPSILON = 1e-9;
export class PlayerVitals {
  private health: number;
  private hunger: number;
  private deathAt: number | null = null;
  private deathReason: VitalsSnapshot['deathReason'] = null;
  private coldExposed = false;
  private coldExposureSeconds = 0;

  constructor(initial: { health?: number; hunger?: number } = {}) {
    this.health = this.clamp(initial.health, SURVIVAL_CONFIG.maxHealth);
    this.hunger = this.clamp(initial.hunger, SURVIVAL_CONFIG.maxHunger);
    if (this.health === 0) { this.deathAt = 0; this.deathReason = 'damage'; }
  }

  get dead(): boolean { return this.deathAt !== null; }
  canEat(amount: number): boolean { return !this.dead && Number.isFinite(amount) && amount > 0 && this.hunger < SURVIVAL_CONFIG.maxHunger; }
  eat(amount: number): boolean {
    if (!this.canEat(amount)) return false;
    this.hunger = Math.min(SURVIVAL_CONFIG.maxHunger, this.hunger + amount);
    return true;
  }

  /** Why a consumable would be wasted, or null when at least one of its effects applies. */
  consumeBlocker(effect: ConsumableEffect): 'dead' | 'satiated' | 'full-health' | 'invalid' | null {
    if (this.dead) return 'dead';
    const hunger = Number.isFinite(effect.hunger) ? Math.max(0, effect.hunger) : -1;
    const health = Number.isFinite(effect.health) ? Math.max(0, effect.health) : -1;
    if (hunger < 0 || health < 0 || hunger + health === 0) return 'invalid';
    if ((hunger > 0 && this.hunger < SURVIVAL_CONFIG.maxHunger) || (health > 0 && this.health < SURVIVAL_CONFIG.maxHealth)) return null;
    return hunger > 0 ? 'satiated' : 'full-health';
  }

  /** Applies hunger and healing together; each is capped by its current maximum. */
  consume(effect: ConsumableEffect): boolean {
    if (this.consumeBlocker(effect) !== null) return false;
    this.hunger = Math.min(SURVIVAL_CONFIG.maxHunger, this.hunger + effect.hunger);
    this.health = Math.min(SURVIVAL_CONFIG.maxHealth, this.health + effect.health);
    return true;
  }

  setColdEnvironment(exposed: boolean): void {
    if (this.dead) return;
    this.coldExposed = exposed;
    if (!exposed) this.coldExposureSeconds = 0;
  }

  step(dt: number, now: number, sprinting = false, exposedToCold = false): void {
    if (this.dead || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(now) || now < dt) return;
    this.setColdEnvironment(exposedToCold);
    const hungerPerSecond = SURVIVAL_CONFIG.hungerPerSecond * (sprinting ? SURVIVAL_CONFIG.sprintHungerMultiplier : 1);
    const untilEmpty = this.hunger / hungerPerSecond;
    const untilFreezing = exposedToCold ? Math.max(0, SURVIVAL_CONFIG.coldGraceSeconds - this.coldExposureSeconds) : Infinity;
    // Both damage sources share one timeline, including the step that crosses zero hunger or the cold grace period.
    const boundaries = [Math.min(dt, untilEmpty), Math.min(dt, untilFreezing), dt].sort((a, b) => a - b);
    let start = 0;
    let aliveFor = dt;
    for (const end of boundaries) {
      if (end <= start) continue;
      const starving = start >= untilEmpty;
      const freezing = start >= untilFreezing;
      const damagePerSecond = (starving ? SURVIVAL_CONFIG.starvationDamagePerSecond : 0) + (freezing ? SURVIVAL_CONFIG.coldDamagePerSecond : 0);
      if (damagePerSecond > 0) {
        const duration = Math.min(end - start, this.health / damagePerSecond);
        this.takeDamage((end - start) * damagePerSecond, now - dt + start + duration, starving ? 'starvation' : 'cold');
        if (this.dead) { aliveFor = start + duration; break; }
      }
      start = end;
    }
    this.hunger = Math.max(0, this.hunger - aliveFor * hungerPerSecond);
    if (this.hunger < EPSILON) this.hunger = 0;
    if (exposedToCold) {
      this.coldExposureSeconds += aliveFor;
      if (Math.abs(this.coldExposureSeconds - SURVIVAL_CONFIG.coldGraceSeconds) < EPSILON) this.coldExposureSeconds = SURVIVAL_CONFIG.coldGraceSeconds;
    }
  }

  takeDamage(amount: number, now: number, cause: NonNullable<VitalsSnapshot['deathReason']> = 'damage'): boolean {
    if (this.dead || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(now) || now < 0) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health < EPSILON) {
      this.health = 0;
      this.deathAt = now;
      this.deathReason = cause;
    }
    return true;
  }

  snapshot(): VitalsSnapshot { return { health: this.health, maxHealth: SURVIVAL_CONFIG.maxHealth, hunger: this.hunger, maxHunger: SURVIVAL_CONFIG.maxHunger, dead: this.dead, deathAt: this.deathAt, deathReason: this.deathReason, cold: { exposed: this.coldExposed, exposureSeconds: this.coldExposureSeconds, graceSeconds: SURVIVAL_CONFIG.coldGraceSeconds, damagePerSecond: SURVIVAL_CONFIG.coldDamagePerSecond, freezing: this.coldExposed && this.coldExposureSeconds >= SURVIVAL_CONFIG.coldGraceSeconds } }; }
  private clamp(value: number | undefined, maximum: number): number { return value === undefined || !Number.isFinite(value) ? maximum : Math.max(0, Math.min(maximum, value)); }
}
