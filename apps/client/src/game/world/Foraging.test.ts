import { describe, expect, it, vi } from 'vitest';
import type { BerryBushDefinition, PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { PlayerVitals } from '../player/PlayerVitals';
import { ForagingWorld } from './ForagingWorld';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'local-player', position: { x: 0, y: 0.92, z: 0 }, grounded: true, yaw: 0 };
const bush: BerryBushDefinition = { id: 'bush', position: { x: 0, y: 0, z: 1.5 }, stock: 3 };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => ({ x: 0, y: 0.23, z: 1 }) }; }

describe('foraging and consuming food', () => {
  it('collects finite stock once per accepted action with stable unique item IDs', () => {
    const world = new ForagingWorld([bush]);
    const bag = new Inventory(5, []);
    const visibility = queries();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      expect(world.gather(bush.id, player, bag, visibility).accepted).toBe(true);
      ids.push(bag.remove(0)!.id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(world.gather(bush.id, player, bag, visibility).reason).toBe('missing');
    expect(world.target(player, 0, visibility)).toBeNull();
    expect(world.snapshot()[0]?.remaining).toBe(0);
  });

  it('preserves a bush on full inventory, obstruction or distant pickup', () => {
    const world = new ForagingWorld([bush]);
    const bag = new Inventory(1);
    const visibility = queries();
    expect(world.gather(bush.id, player, bag, visibility).reason).toBe('inventory-full');
    visibility.hasLineOfSight.mockReturnValue(false);
    expect(world.gather(bush.id, player, bag, visibility).reason).toBe('blocked');
    expect(world.gather(bush.id, { ...player, position: { x: 10, y: 0.92, z: 0 } }, bag, visibility).reason).toBe('out-of-range');
    expect(world.snapshot()[0]?.remaining).toBe(3);
    expect(bag.getStack(0)?.itemId).toBe('axe');
  });

  it('consumes exactly one food item and rejects full hunger, stale slots and non-food', () => {
    const bag = new Inventory(5, [[0, { id: 'food', itemId: 'berries', amount: 2 }], [1, { id: 'axe', itemId: 'axe', amount: 1 }]]);
    const world = new GameplayWorld(queries(), [], bag, [], false, [bush]);
    const vitals = new PlayerVitals({ hunger: 90, health: 40 });
    expect(world.consumeFood(0, 'old-id', vitals, 0).reason).toBe('stale');
    expect(world.consumeFood(1, 'axe', vitals, 0).reason).toBe('invalid');
    expect(world.consumeFood(0, 'food', vitals, 0).accepted).toBe(true);
    expect(bag.getStack(0)?.amount).toBe(1);
    expect(vitals.snapshot()).toMatchObject({ hunger: 100, health: 40 });
    expect(world.consumeFood(0, 'food', vitals, 0).reason).toBe('satiated');
    expect(bag.getStack(0)?.amount).toBe(1);
  });

  it('does not allow eating during a swing and cancels a pending hit at the end of a run', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'food', itemId: 'berries', amount: 1 }]]);
    const tree = { id: 'tree', position: { x: 0, y: 0, z: 1.5 }, radius: 0.4, trunkHeight: 2.4 };
    const world = new GameplayWorld(queries(), [tree], bag);
    const vitals = new PlayerVitals({ hunger: 50 });
    world.useItem('hit', 0, 0);
    expect(world.consumeFood(1, 'food', vitals, 0.1).reason).toBe('busy');
    expect(bag.getStack(1)?.amount).toBe(1);
    world.end();
    world.update(0.3, player, 0);
    expect(world.getSnapshot(0.3).resources[0]?.health).toBe(100);
    expect(world.getSnapshot(0.3).attack.phase).toBe('idle');
    vitals.takeDamage(1000, 1);
    expect(world.consumeFood(1, 'food', vitals, 1).reason).toBe('dead');
    expect(bag.getStack(1)?.amount).toBe(1);
  });
});
