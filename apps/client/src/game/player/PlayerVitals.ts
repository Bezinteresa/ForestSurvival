import { SURVIVAL_CONFIG, type VitalsSnapshot } from '@forest-survival/shared';

const EPSILON = 1e-9;
export class PlayerVitals {
  private health: number;
  private hunger: number;
  private deathAt: number | null = null;
  private deathReason: VitalsSnapshot['deathReason'] = null;

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

  step(dt: number, now: number): void {
    if (this.dead || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(now) || now < dt) return;
    const untilEmpty = this.hunger / SURVIVAL_CONFIG.hungerPerSecond;
    this.hunger = Math.max(0, this.hunger - dt * SURVIVAL_CONFIG.hungerPerSecond);
    if (this.hunger < EPSILON) this.hunger = 0;
    const starvingFor = Math.max(0, dt - untilEmpty);
    if (starvingFor <= 0) return;
    const damage = starvingFor * SURVIVAL_CONFIG.starvationDamagePerSecond;
    const diedAt = now - dt + Math.max(0, untilEmpty) + this.health / SURVIVAL_CONFIG.starvationDamagePerSecond;
    this.takeDamage(damage, Math.min(now, diedAt), 'starvation');
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

  snapshot(): VitalsSnapshot { return { health: this.health, maxHealth: SURVIVAL_CONFIG.maxHealth, hunger: this.hunger, maxHunger: SURVIVAL_CONFIG.maxHunger, dead: this.dead, deathAt: this.deathAt, deathReason: this.deathReason }; }
  private clamp(value: number | undefined, maximum: number): number { return value === undefined || !Number.isFinite(value) ? maximum : Math.max(0, Math.min(maximum, value)); }
}
