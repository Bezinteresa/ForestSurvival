import { CAMPFIRE_CONFIG, type CampfireSnapshot, type CommandResult, type PlayerSnapshot, type Vector3Data } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

const EPSILON = 1e-9;

export class Campfire {
  private fuelSeconds: number = CAMPFIRE_CONFIG.initialFuelSeconds;

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.fuelSeconds = Math.max(0, this.fuelSeconds - dt);
    if (this.fuelSeconds < EPSILON) this.fuelSeconds = 0;
  }

  contains(position: Vector3Data): boolean {
    const center = CAMPFIRE_CONFIG.position;
    return this.fuelSeconds > 0
      && position.y >= center.y - 0.1 && position.y <= center.y + CAMPFIRE_CONFIG.safeHeight
      && Math.hypot(position.x - center.x, position.z - center.z) <= CAMPFIRE_CONFIG.safeRadius;
  }

  access(player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    const center = CAMPFIRE_CONFIG.position;
    const target = { ...center, y: center.y + CAMPFIRE_CONFIG.targetHeight };
    if (Math.hypot(player.position.x - center.x, player.position.z - center.z) > CAMPFIRE_CONFIG.range || Math.abs(player.position.y - target.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    if (!visibility.hasLineOfSight(player.position, target, CAMPFIRE_CONFIG.id)) return { accepted: false, reason: 'blocked' };
    return { accepted: true };
  }

  addWood(inventory: Inventory, slot: number, expectedItemId: string, player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    const access = this.access(player, visibility);
    if (!access.accepted) return access;
    const stack = inventory.getStack(slot);
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (stack.itemId !== 'wood') return { accepted: false, reason: 'wrong-fuel' };
    if (this.fuelSeconds + CAMPFIRE_CONFIG.secondsPerWood > CAMPFIRE_CONFIG.maxFuelSeconds + EPSILON) return { accepted: false, reason: 'fire-full' };
    const consumed = inventory.consume(slot, expectedItemId);
    if (!consumed.accepted) return consumed;
    this.fuelSeconds = Math.min(CAMPFIRE_CONFIG.maxFuelSeconds, this.fuelSeconds + CAMPFIRE_CONFIG.secondsPerWood);
    return { accepted: true };
  }

  snapshot(player: PlayerSnapshot, inReach: boolean): CampfireSnapshot {
    return { id: CAMPFIRE_CONFIG.id, position: { ...CAMPFIRE_CONFIG.position }, fuelSeconds: this.fuelSeconds, maxFuelSeconds: CAMPFIRE_CONFIG.maxFuelSeconds, secondsPerWood: CAMPFIRE_CONFIG.secondsPerWood, lit: this.fuelSeconds > 0, safeRadius: this.fuelSeconds > 0 ? CAMPFIRE_CONFIG.safeRadius : 0, playerInside: this.contains(player.position), inReach };
  }
}
