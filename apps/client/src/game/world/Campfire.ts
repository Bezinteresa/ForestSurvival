import { CAMPFIRE_CONFIG, CAMPFIRE_LEVELS, CAMPFIRE_MAX_LEVEL, FUEL_DEFINITIONS, isFuel, nextCampfireUpgrade, type CampfireLevel, type CampfireSnapshot, type CommandResult, type PlayerSnapshot, type Vector3Data } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

const EPSILON = 1e-9;

export class Campfire {
  private fuelSeconds: number = CAMPFIRE_CONFIG.initialFuelSeconds;
  private level: CampfireLevel = 1;

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.fuelSeconds = Math.max(0, this.fuelSeconds - dt);
    if (this.fuelSeconds < EPSILON) this.fuelSeconds = 0;
  }

  contains(position: Vector3Data): boolean {
    const center = CAMPFIRE_CONFIG.position;
    return this.fuelSeconds > 0
      && position.y >= center.y - 0.1 && position.y <= center.y + CAMPFIRE_CONFIG.safeHeight
      && Math.hypot(position.x - center.x, position.z - center.z) <= CAMPFIRE_LEVELS[this.level].safeRadius;
  }

  warmthDuration(dt: number, position: Vector3Data): number {
    return Number.isFinite(dt) && dt > 0 && this.contains(position) ? Math.min(dt, this.fuelSeconds) : 0;
  }

  access(player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    const center = CAMPFIRE_CONFIG.position;
    const target = { ...center, y: center.y + CAMPFIRE_CONFIG.targetHeight };
    if (Math.hypot(player.position.x - center.x, player.position.z - center.z) > CAMPFIRE_CONFIG.range || Math.abs(player.position.y - target.y) > 1.5) return { accepted: false, reason: 'out-of-range' };
    if (!visibility.hasLineOfSight(player.position, target, CAMPFIRE_CONFIG.id)) return { accepted: false, reason: 'blocked' };
    return { accepted: true };
  }

  addFuel(inventory: Inventory, slot: number, expectedItemId: string, player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    const access = this.access(player, visibility);
    if (!access.accepted) return access;
    const stack = inventory.getStack(slot);
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (!isFuel(stack.itemId)) return { accepted: false, reason: 'wrong-fuel' };
    const seconds = FUEL_DEFINITIONS[stack.itemId].seconds;
    if (this.fuelSeconds + seconds > CAMPFIRE_CONFIG.maxFuelSeconds + EPSILON) return { accepted: false, reason: 'fire-full' };
    const consumed = inventory.consume(slot, expectedItemId);
    if (!consumed.accepted) return consumed;
    this.fuelSeconds = Math.min(CAMPFIRE_CONFIG.maxFuelSeconds, this.fuelSeconds + seconds);
    return { accepted: true };
  }

  upgrade(expectedLevel: number, inventory: Inventory, player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    const access = this.access(player, visibility);
    if (!access.accepted) return access;
    if (!Number.isInteger(expectedLevel) || expectedLevel < 1 || expectedLevel > CAMPFIRE_MAX_LEVEL) return { accepted: false, reason: 'invalid' };
    if (expectedLevel !== this.level) return { accepted: false, reason: 'stale' };
    const next = nextCampfireUpgrade(this.level);
    if (!next) return { accepted: false, reason: 'max-level' };
    if (this.fuelSeconds <= 0) return { accepted: false, reason: 'fire-out' };
    const spent = inventory.spendMaterials(next.cost);
    if (!spent.accepted) return spent;
    this.level = next.level;
    return { accepted: true };
  }

  snapshot(player: PlayerSnapshot, inReach: boolean): CampfireSnapshot {
    return { id: CAMPFIRE_CONFIG.id, level: this.level, maxLevel: CAMPFIRE_MAX_LEVEL, zoneRadius: CAMPFIRE_LEVELS[this.level].safeRadius, nextUpgrade: nextCampfireUpgrade(this.level), position: { ...CAMPFIRE_CONFIG.position }, fuelSeconds: this.fuelSeconds, maxFuelSeconds: CAMPFIRE_CONFIG.maxFuelSeconds, secondsPerWood: CAMPFIRE_CONFIG.secondsPerWood, secondsPerCoal: CAMPFIRE_CONFIG.secondsPerCoal, lit: this.fuelSeconds > 0, safeRadius: this.fuelSeconds > 0 ? CAMPFIRE_LEVELS[this.level].safeRadius : 0, playerInside: this.contains(player.position), inReach };
  }
}
