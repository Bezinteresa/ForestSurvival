import { TRAP_CONFIG, type BuildingSnapshot, type CommandResult, type PlayerSnapshot, type TrapSnapshot } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

interface TrapState { armedAt: number; catches: number }
const EPSILON = 1e-7;

/** A built trap catches a hare every TRAP_CONFIG.catchSeconds of simulation time and holds one catch until collected. */
export class TrapWorld {
  private readonly states = new Map<string, TrapState>();

  arm(trapId: string, now: number): void {
    if (!this.states.has(trapId) && Number.isFinite(now) && now >= 0) this.states.set(trapId, { armedAt: now, catches: 0 });
  }

  access(trap: BuildingSnapshot | undefined, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>): CommandResult {
    if (!trap || trap.kind !== 'rabbit-trap' || !this.states.has(trap.id)) return { accepted: false, reason: 'missing' };
    if (Math.hypot(player.position.x - trap.position.x, player.position.z - trap.position.z) > TRAP_CONFIG.range || Math.abs(player.position.y - trap.position.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    return visibility.hasLineOfSight(player.position, trap.position, trap.id) ? { accepted: true } : { accepted: false, reason: 'blocked' };
  }

  collect(trap: BuildingSnapshot | undefined, expectedCatchId: string, bag: Inventory, player: PlayerSnapshot, visibility: Pick<VisibilityQueries, 'hasLineOfSight'>, now: number): CommandResult {
    const access = this.access(trap, player, visibility);
    if (!access.accepted) return access;
    if (!Number.isFinite(now) || now < 0) return { accepted: false, reason: 'invalid' };
    const state = this.states.get(trap!.id)!;
    if (expectedCatchId !== this.catchId(trap!.id, state.catches)) return { accepted: false, reason: 'stale' };
    if (now + EPSILON < state.armedAt + TRAP_CONFIG.catchSeconds) return { accepted: false, reason: 'trap-empty' };
    const inserted = bag.insert({ id: expectedCatchId, itemId: 'raw-meat', amount: TRAP_CONFIG.meatPerCatch });
    if (!inserted.accepted) return inserted;
    // The trap re-arms when emptied, so a full trap does not keep catching.
    this.states.set(trap!.id, { armedAt: now, catches: state.catches + 1 });
    return { accepted: true };
  }

  snapshot(traps: readonly BuildingSnapshot[], now: number, inReach: ReadonlySet<string>): TrapSnapshot[] {
    return traps.filter((trap) => this.states.has(trap.id)).map((trap) => {
      const state = this.states.get(trap.id)!;
      const elapsed = Math.max(0, now - state.armedAt);
      const ready = now + EPSILON >= state.armedAt + TRAP_CONFIG.catchSeconds;
      return { id: trap.id, siteId: trap.siteId, position: { ...trap.position }, inReach: inReach.has(trap.id), catchId: this.catchId(trap.id, state.catches), progressSeconds: ready ? TRAP_CONFIG.catchSeconds : elapsed, durationSeconds: TRAP_CONFIG.catchSeconds, ready };
    });
  }

  private catchId(trapId: string, index: number): string { return trapId + '/catch/' + index; }
}
