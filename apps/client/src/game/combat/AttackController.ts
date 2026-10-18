import { AXE_CONFIG } from '@forest-survival/shared';

export interface Strike { readonly id: string; readonly yaw: number }

export class AttackController {
  private current: { id: string; yaw: number; startedAt: number; struck: boolean } | undefined;

  begin(id: string, yaw: number, now: number): boolean {
    if (this.isBusy(now) || !Number.isFinite(yaw)) return false;
    this.current = { id, yaw, startedAt: now, struck: false };
    return true;
  }

  isBusy(now: number): boolean {
    return !!this.current && now + 1e-9 < this.current.startedAt + AXE_CONFIG.windup + AXE_CONFIG.recovery;
  }

  update(now: number): Strike | null {
    const attack = this.current;
    if (!attack) return null;
    let strike: Strike | null = null;
    if (!attack.struck && now + 1e-9 >= attack.startedAt + AXE_CONFIG.windup) {
      attack.struck = true;
      strike = { id: attack.id, yaw: attack.yaw };
    }
    if (!this.isBusy(now)) this.current = undefined;
    return strike;
  }

  getYaw(now: number): number | undefined { return this.isBusy(now) ? this.current?.yaw : undefined; }

  getSnapshot(now: number) {
    if (!this.current || !this.isBusy(now)) return { phase: 'idle' as const, progress: 0 };
    const elapsed = Math.max(0, now - this.current.startedAt);
    return { phase: elapsed < AXE_CONFIG.windup ? 'windup' as const : 'recovery' as const, progress: Math.min(1, elapsed / (AXE_CONFIG.windup + AXE_CONFIG.recovery)) };
  }
}
