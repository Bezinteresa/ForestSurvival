import { describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_CONFIG, type MaterialCost, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { Campfire } from './Campfire';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => null }; }
function fullPrice() { return new Inventory(7, [[0, { id: 'axe', itemId: 'axe', amount: 1, level: 2 }], [1, { id: 'wood-a', itemId: 'wood', amount: 3 }], [2, { id: 'wood-b', itemId: 'wood', amount: 3 }], [3, { id: 'stone-a', itemId: 'stone', amount: 3 }], [4, { id: 'stone-b', itemId: 'stone', amount: 3 }], [5, { id: 'scrap', itemId: 'scrap', amount: 2 }]]); }

describe('campfire level purchases', () => {
  it('purchases both levels with their exact prices, expanding the zone without changing fuel', () => {
    const fire = new Campfire();
    const bag = fullPrice();
    const tool = bag.getStack(0);
    const outside = { x: 6, y: 0.92, z: CAMPFIRE_CONFIG.position.z };
    expect(fire.contains(outside)).toBe(false);
    expect(fire.upgrade(1, bag, player, queries()).accepted).toBe(true);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 2, safeRadius: 7, zoneRadius: 7, fuelSeconds: 60, maxFuelSeconds: 180 });
    expect(fire.contains(outside)).toBe(true);
    expect([bag.count('wood'), bag.count('stone'), bag.count('scrap')]).toEqual([3, 3, 2]);
    expect(fire.upgrade(2, bag, player, queries()).accepted).toBe(true);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 3, safeRadius: 9, zoneRadius: 9, fuelSeconds: 60, nextUpgrade: { level: 4 } });
    expect(fire.contains({ ...outside, x: 8.9 })).toBe(true);
    expect(fire.contains({ ...outside, x: 9.1 })).toBe(false);
    expect(bag.snapshot().slots.filter(Boolean)).toEqual([tool]);
    expect(fire.upgrade(3, bag, player, queries()).reason).toBe('insufficient-materials');
    fire.step(60);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 3, zoneRadius: 9, safeRadius: 0, lit: false });
    bag.insert({ id: 'fuel', itemId: 'wood', amount: 1 });
    fire.addFuel(bag, 1, 'fuel', player, queries());
    expect(fire.snapshot(player, true)).toMatchObject({ level: 3, safeRadius: 9, fuelSeconds: 30 });
  });

  it('does not lose any ingredients when the last material is missing', () => {
    const fire = new Campfire();
    const bag = fullPrice();
    fire.upgrade(1, bag, player, queries());
    bag.remove(5);
    const before = bag.snapshot();
    expect(fire.upgrade(2, bag, player, queries()).reason).toBe('insufficient-materials');
    expect(bag.snapshot()).toEqual(before);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 2, fuelSeconds: 60, safeRadius: 7 });
  });

  it('requires the expected current level and keeps stale or invalid requests from buying another level', () => {
    const fire = new Campfire();
    const bag = fullPrice();
    const initial = bag.snapshot();
    expect(fire.upgrade(2, bag, player, queries()).reason).toBe('stale');
    expect(fire.upgrade(3, bag, player, queries()).reason).toBe('stale');
    for (const level of [0, 7, NaN, 1.5]) expect(fire.upgrade(level, bag, player, queries()).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(initial);
    fire.upgrade(1, bag, player, queries());
    const remaining = bag.snapshot();
    expect(fire.upgrade(1, bag, player, queries()).reason).toBe('stale');
    expect(bag.snapshot()).toEqual(remaining);
    expect(fire.snapshot(player, true).level).toBe(2);
  });

  it('requires a visible, nearby, burning fire and blocks buying during an attack', () => {
    const fire = new Campfire();
    const bag = fullPrice();
    const before = bag.snapshot();
    const visibility = queries();
    expect(fire.upgrade(1, bag, { ...player, position: { x: 10, y: 0.92, z: 0 } }, visibility).reason).toBe('out-of-range');
    expect(fire.upgrade(1, bag, { ...player, position: { ...player.position, y: 6 } }, visibility).reason).toBe('out-of-range');
    visibility.hasLineOfSight.mockReturnValue(false);
    expect(fire.upgrade(1, bag, player, visibility).reason).toBe('blocked');
    visibility.hasLineOfSight.mockReturnValue(true);
    fire.step(60);
    expect(fire.upgrade(1, bag, player, visibility).reason).toBe('fire-out');
    expect(fire.snapshot(player, true)).toMatchObject({ level: 1, safeRadius: 0, fuelSeconds: 0 });
    const world = new GameplayWorld(visibility, [], bag);
    world.useItem('attack', 0, 0);
    expect(world.upgradeFire(1, player, 0.1).reason).toBe('busy');
    expect(world.getSnapshot(0.1).campfire.level).toBe(1);
    expect(bag.snapshot()).toEqual(before);
  });

  it('does not let a modified offer or a fuel addition change the upgrade price or grant a level', () => {
    const fire = new Campfire();
    const bag = fullPrice();
    const offer = fire.snapshot(player, true).nextUpgrade!;
    (offer.cost as { wood: number }).wood = 0;
    (offer as { safeRadius: number }).safeRadius = 999;
    expect(fire.snapshot(player, true).nextUpgrade?.cost).toEqual({ wood: 3, stone: 3 });
    expect(fire.snapshot(player, true).nextUpgrade?.safeRadius).toBe(7);
    fire.addFuel(bag, 1, 'wood-a', player, queries());
    expect(fire.snapshot(player, true)).toMatchObject({ level: 1, safeRadius: 5, fuelSeconds: 90 });
    expect(fire.upgrade(1, bag, player, queries()).accepted).toBe(true);
    expect(bag.count('wood')).toBe(2);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 2, fuelSeconds: 90 });
    expect(bag.spendMaterials({ axe: 1 } as MaterialCost).reason).toBe('invalid');
  });
});
