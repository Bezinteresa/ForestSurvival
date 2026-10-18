import type { DamageInfo, EquippedItemId } from '@forest-survival/shared';

export class DamageReceiver {
  private health: number;
  private readonly received = new Set<string>();

  constructor(readonly id: string, readonly maxHealth: number, private readonly requiredTool?: EquippedItemId) {
    this.health = maxHealth;
  }

  get currentHealth(): number { return this.health; }
  get exhausted(): boolean { return this.health <= 0; }

  receiveDamage(info: DamageInfo): { applied: boolean; defeated: boolean } {
    if (info.targetId !== this.id || this.exhausted || !Number.isFinite(info.amount) || info.amount <= 0 || info.tool === 'none' || (this.requiredTool && info.tool !== this.requiredTool) || this.received.has(info.attackId)) return { applied: false, defeated: false };
    this.received.add(info.attackId);
    this.health = Math.max(0, this.health - info.amount);
    return { applied: true, defeated: this.exhausted };
  }
}
