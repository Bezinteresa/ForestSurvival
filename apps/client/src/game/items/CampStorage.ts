import { CAMP_STORAGE, type CommandResult, type PlayerSnapshot } from '@forest-survival/shared';
import type { VisibilityQueries } from '../combat/TargetQuery';
import { Inventory } from './Inventory';

export class CampStorage {
  constructor(private readonly inventory = new Inventory(CAMP_STORAGE.slots, [[0, { id: 'starter-pickaxe', itemId: 'pickaxe', amount: 1 }]])) {}

  canAccess(player: PlayerSnapshot, visibility: VisibilityQueries): boolean {
    const position = CAMP_STORAGE.position;
    return Math.hypot(player.position.x - position.x, player.position.z - position.z) <= CAMP_STORAGE.range
      && Math.abs(player.position.y - position.y) <= 1.5
      && visibility.hasLineOfSight(player.position, position, CAMP_STORAGE.id);
  }

  snapshot() { return this.inventory.snapshot(); }

  transfer(playerInventory: Inventory, direction: 'deposit' | 'withdraw', slot: number, expectedItemId: string, player: PlayerSnapshot, visibility: VisibilityQueries): CommandResult {
    if (!this.canAccess(player, visibility)) return { accepted: false, reason: 'out-of-range' };
    if (direction === 'deposit') return playerInventory.transferTo(this.inventory, slot, expectedItemId);
    if (direction === 'withdraw') return this.inventory.transferTo(playerInventory, slot, expectedItemId);
    return { accepted: false, reason: 'invalid' };
  }
}
