import { FORAGING_CONFIG, type BerryBushDefinition, type BerryBushSnapshot, type CommandResult, type PlayerSnapshot } from '@forest-survival/shared';
import { selectTarget, type VisibilityQueries } from '../combat/TargetQuery';
import type { Inventory } from '../items/Inventory';

export class ForagingWorld {
  private readonly bushes: Array<{ definition: BerryBushDefinition; remaining: number }>;
  constructor(definitions: readonly BerryBushDefinition[]) { this.bushes = definitions.map((definition) => ({ definition, remaining: definition.stock })); }
  snapshot(): BerryBushSnapshot[] { return this.bushes.map(({ definition, remaining }) => ({ ...definition, position: { ...definition.position }, remaining })); }

  target(player: PlayerSnapshot, yaw: number, visibility: VisibilityQueries) {
    return selectTarget(this.bushes.filter((bush) => bush.remaining > 0).map(({ definition }) => ({ id: definition.id, position: { ...definition.position, y: definition.position.y + FORAGING_CONFIG.targetHeight }, radius: 0 })), player.position, yaw, FORAGING_CONFIG.range, FORAGING_CONFIG.halfAngle, FORAGING_CONFIG.maxHeight, visibility);
  }

  gather(id: string, player: PlayerSnapshot, inventory: Inventory, visibility: VisibilityQueries): CommandResult {
    const bush = this.bushes.find((entry) => entry.definition.id === id);
    if (!bush || bush.remaining <= 0) return { accepted: false, reason: 'missing' };
    const position = { ...bush.definition.position, y: bush.definition.position.y + FORAGING_CONFIG.targetHeight };
    if (Math.hypot(position.x - player.position.x, position.z - player.position.z) > FORAGING_CONFIG.range || Math.abs(position.y - player.position.y) > FORAGING_CONFIG.maxHeight) return { accepted: false, reason: 'out-of-range' };
    if (!visibility.hasLineOfSight(player.position, position, id)) return { accepted: false, reason: 'blocked' };
    const result = inventory.insert({ id: id + '/berries/' + (bush.definition.stock - bush.remaining), itemId: 'berries', amount: 1 });
    if (result.accepted) bush.remaining--;
    return result;
  }
}
