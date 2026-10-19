import { AXE_CONFIG } from '@forest-survival/shared';

export interface Strike { readonly id: string; readonly yaw: number }

export class AttackController {
  private current: { id: string; yaw: number; startedAt: number; struck: boolean; windup: number; recovery: number } | undefined;

  begin(id: string, yaw: number, now: number, timing: { windup: number; recovery: number } = AXE_CONFIG): boolean {
    if (this.isBusy(now) || !Number.isFinite(yaw)) return false;
    this.current = { id, yaw, startedAt: now, struck: false, windup: timing.windup, recovery: timing.recovery };
    return true;
  }

  isBusy(now: number): boolean {
    return !!this.current && now + 1e-9 < this.current.startedAt + this.current.windup + this.current.recovery;
  }

  update(now: number): Strike | null {
    const attack = this.current;
    if (!attack) return null;
    let strike: Strike | null = null;
    if (!attack.struck && now + 1e-9 >= attack.startedAt + attack.windup) {
      attack.struck = true;
      strike = { id: attack.id, yaw: attack.yaw };
    }
    if (!this.isBusy(now)) this.current = undefined;
    return strike;
  }

  cancel(): void { this.current = undefined; }

  getYaw(now: number): number | undefined { return this.isBusy(now) ? this.current?.yaw : undefined; }

  getSnapshot(now: number) {
    if (!this.current || !this.isBusy(now)) return { phase: 'idle' as const, progress: 0 };
    const elapsed = Math.max(0, now - this.current.startedAt);
    return { phase: elapsed < this.current.windup ? 'windup' as const : 'recovery' as const, progress: Math.min(1, elapsed / (this.current.windup + this.current.recovery)) };
  }
}
