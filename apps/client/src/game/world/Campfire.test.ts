import { describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_CONFIG, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { Campfire } from './Campfire';
import { GameplayWorld } from './GameplayWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => null }; }
function woodBag() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood-a', itemId: 'wood', amount: 3 }], [2, { id: 'wood-b', itemId: 'wood', amount: 3 }]]); }

describe('campfire fuel and protection', () => {
  it('mixes coal and wood; a full fire still takes one item for level progress while burn time stays capped', () => {
    const fire = new Campfire();
    const bag = new Inventory(5, [[0, { id: 'coal', itemId: 'coal', amount: 3 }], [1, { id: 'wood', itemId: 'wood', amount: 2 }]]);
    const visibility = queries();
    expect(fire.addFuel(bag, 0, 'coal', player, visibility).accepted).toBe(true);
    expect(fire.addFuel(bag, 1, 'wood', player, visibility).accepted).toBe(true);
    expect(fire.snapshot(player, true)).toMatchObject({ fuelSeconds: 150, secondsPerWood: 30, secondsPerCoal: 60, progress: 3, level: 1 });
    expect(fire.addFuel(bag, 0, 'coal', player, visibility).accepted).toBe(true);
    expect(fire.snapshot(player, true)).toMatchObject({ fuelSeconds: 180, level: 2, progress: 1 });
    expect(bag.count('coal')).toBe(1);
    expect(bag.count('wood')).toBe(1);
  });

  it('relights with coal and reports only the warm portion of a step without burning extra fuel', () => {
    const fire = new Campfire();
    const bag = new Inventory(5, [[0, { id: 'coal', itemId: 'coal', amount: 1 }]]);
    fire.step(60);
    expect(fire.addFuel(bag, 0, 'stale', player, queries()).reason).toBe('stale');
    expect(fire.addFuel(bag, 0, 'coal', player, queries()).accepted).toBe(true);
    expect(bag.count('coal')).toBe(0);
    fire.step(59.95);
    const before = fire.snapshot(player, true);
    expect(fire.warmthDuration(0.1, player.position)).toBeCloseTo(0.05, 8);
    expect(fire.warmthDuration(0.1, { x: 10, y: 0.92, z: 2.8 })).toBe(0);
    for (const invalid of [0, -1, NaN, Infinity]) expect(fire.warmthDuration(invalid, player.position)).toBe(0);
    expect(fire.snapshot(player, true)).toEqual(before);
    fire.step(0.1);
    expect(fire.warmthDuration(0.1, player.position)).toBe(0);
  });

  it('does not consume coal when an attack or access check rejects refuelling', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'coal', itemId: 'coal', amount: 3 }]]);
    const visibility = queries();
    const world = new GameplayWorld(visibility, [], bag);
    world.useItem('swing', 0, 0);
    expect(world.fuelFire(1, 'coal', player, 0.1).reason).toBe('busy');
    visibility.hasLineOfSight.mockReturnValue(false);
    expect(world.fuelFire(1, 'coal', player, 1).reason).toBe('blocked');
    expect(world.fuelFire(1, 'coal', { ...player, position: { x: 10, y: 0.92, z: 0 } }, 1).reason).toBe('out-of-range');
    expect(bag.count('coal')).toBe(3);
    expect(world.getSnapshot(1).campfire.fuelSeconds).toBe(60);
  });

  it.each([30, 60, 144])('burns the same simulation time at %i updates per second, switching protection off at zero', (fps) => {
    const fire = new Campfire();
    for (let step = 0; step < fps * 30; step++) fire.step(1 / fps);
    expect(fire.snapshot(player, true).fuelSeconds).toBeCloseTo(30, 7);
    expect(fire.contains(player.position)).toBe(true);
    for (let step = 0; step < fps * 30; step++) fire.step(1 / fps);
    expect(fire.snapshot(player, true)).toMatchObject({ fuelSeconds: 0, lit: false, safeRadius: 0, playerInside: false });
    fire.step(1000);
    expect(fire.contains(player.position)).toBe(false);
  });

  it('limits the zone by radius and height and returns independent snapshots without changing fuel', () => {
    const fire = new Campfire();
    const center = CAMPFIRE_CONFIG.position;
    expect(fire.contains({ ...center, x: center.x + 5, y: 0.92 })).toBe(true);
    expect(fire.contains({ ...center, x: center.x + 5.01, y: 0.92 })).toBe(false);
    expect(fire.contains({ ...center, y: 4 })).toBe(false);
    expect(fire.contains({ ...center, y: -1 })).toBe(false);
    const snapshot = fire.snapshot(player, true);
    (snapshot.position as { x: number }).x = 999;
    expect(fire.snapshot(player, true).position.x).toBe(center.x);
    for (const invalid of [0, -1, NaN, Infinity]) fire.step(invalid);
    expect(fire.snapshot(player, true).fuelSeconds).toBe(60);
  });

  it('consumes one unit, refuses full/partially full fuel and preserves every rejected item', () => {
    const fire = new Campfire();
    const bag = woodBag();
    const visibility = queries();
    for (let index = 0; index < 3; index++) expect(fire.addFuel(bag, 1, 'wood-a', player, visibility).accepted).toBe(true);
    expect(bag.getStack(1)).toBeNull();
    expect(fire.addFuel(bag, 2, 'wood-b', player, visibility).accepted).toBe(true);
    expect(fire.snapshot(player, true).fuelSeconds).toBe(180);
    expect(bag.count('wood')).toBe(2);
    fire.step(10);
    expect(fire.addFuel(bag, 2, 'wood-b', player, visibility).accepted).toBe(true);
    expect(bag.count('wood')).toBe(1);
    expect(fire.snapshot(player, true)).toMatchObject({ fuelSeconds: 180, level: 2, progress: 1 });
  });

  it('rejects stale slots, wrong fuel, distance, height and blocked access without changing either source', () => {
    const fire = new Campfire();
    const bag = woodBag();
    const before = bag.snapshot();
    const visibility = queries();
    expect(fire.addFuel(bag, 1, 'old-id', player, visibility).reason).toBe('stale');
    expect(fire.addFuel(bag, 0, 'axe', player, visibility).reason).toBe('wrong-fuel');
    expect(fire.addFuel(bag, 1, 'wood-a', { ...player, position: { x: 10, y: 0.92, z: 0 } }, visibility).reason).toBe('out-of-range');
    expect(fire.addFuel(bag, 1, 'wood-a', { ...player, position: { ...player.position, y: 6 } }, visibility).reason).toBe('out-of-range');
    visibility.hasLineOfSight.mockReturnValue(false);
    expect(fire.addFuel(bag, 1, 'wood-a', player, visibility).reason).toBe('blocked');
    expect(bag.snapshot()).toEqual(before);
    expect(fire.snapshot(player, false).fuelSeconds).toBe(60);
  });

  it('relights an extinguished fire with one wood and blocks refuelling during a swing', () => {
    const bag = woodBag();
    const fire = new Campfire();
    fire.step(60);
    expect(fire.addFuel(bag, 1, 'wood-a', player, queries()).accepted).toBe(true);
    expect(bag.count('wood')).toBe(5);
    expect(fire.snapshot(player, true)).toMatchObject({ lit: true, safeRadius: 5, fuelSeconds: 30, playerInside: true });
    const world = new GameplayWorld(queries(), [], bag);
    world.useItem('swing', 0, 0);
    expect(world.fuelFire(1, 'wood-a', player, 0.1).reason).toBe('busy');
    expect(world.getSnapshot(0.1).campfire.fuelSeconds).toBe(60);
    expect(bag.count('wood')).toBe(5);
  });
});
