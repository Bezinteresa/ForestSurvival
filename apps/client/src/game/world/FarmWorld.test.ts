import { describe, expect, it } from 'vitest';
import { FARM_SITES, buildingBox, type BuildingSnapshot, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { FarmWorld } from './FarmWorld';
import { GameplayWorld } from './GameplayWorld';

const buildings: BuildingSnapshot[] = FARM_SITES.map((site) => ({ ...buildingBox({ kind: 'farm', siteId: site.id, rotation: 0 })!, kind: 'farm', siteId: site.id, rotation: 0 }));
const first = buildings[0]!, second = buildings[1]!;
const player: PlayerSnapshot = { id: 'player', position: { x: -4, y: 0.92, z: 4.2 }, grounded: true, yaw: 0 };
const otherPlayer = { ...player, position: { x: 1, y: 0.92, z: 8 } };
const queries = { hasLineOfSight: () => true, removeEntityCollider: () => {}, findDropPosition: () => null, canPlaceWorkbench: () => true, addWorkbenchCollider: () => {}, canPlaceBuilding: () => true, activateBuildingCollider: () => {} };
function seedBag() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'seed', itemId: 'carrot', amount: 5 }]]); }
function snapshot(world: FarmWorld, now = 0) { return world.snapshot(buildings, now, new Set([first.id, second.id])); }

describe('farm crop transactions and absolute growth time', () => {
  it('pays one carrot before planting and yields three only after the full physical growth duration', () => {
    const world = new FarmWorld(), bag = seedBag(), id = snapshot(world)[0]!.nextCycleId;
    bag.select(1);
    expect(world.plant(first, id, bag, 1, 'seed', player, queries, 10).accepted).toBe(true);
    expect(bag.getStack(1)).toEqual({ id: 'seed', itemId: 'carrot', amount: 4 });
    expect(bag.snapshot().activeSlot).toBe(1);
    expect(snapshot(world, 10)[0]?.crop).toMatchObject({ id, plantedAt: 10, readyAt: 130, progressSeconds: 0, ready: false });
    expect(world.harvest(first, id, bag, player, queries, 129.999).reason).toBe('not-grown');
    expect(snapshot(world, 130)[0]?.crop).toMatchObject({ progressSeconds: 120, ready: true });
    // A ready plant waits, even across many later cycles; reads cannot auto-harvest or replant it.
    for (let repeat = 0; repeat < 20; repeat++) expect(snapshot(world, 2000)[0]?.crop?.id).toBe(id);
    expect(world.harvest(first, id, bag, player, queries, 2000).accepted).toBe(true);
    expect(bag.count('carrot')).toBe(7);
    expect(bag.snapshot().slots.find((stack) => stack?.id === id + '/harvest')).toMatchObject({ amount: 2 });
    expect(world.harvest(first, id, bag, player, queries, 2000).reason).toBe('stale');
    expect(snapshot(world, 2000)[0]?.crop).toBeNull();
  });

  it('keeps seeds and cycle IDs on wrong items, stale slots, missing farms, obstruction, range and occupied crops', () => {
    const world = new FarmWorld(), bag = seedBag(), before = bag.snapshot(), id = snapshot(world)[0]!.nextCycleId;
    expect(world.plant(undefined, id, bag, 1, 'seed', player, queries, 0).reason).toBe('missing');
    expect(world.plant({ ...first, kind: 'storage' }, id, bag, 1, 'seed', player, queries, 0).reason).toBe('missing');
    expect(world.plant(first, id, bag, 1, 'seed', otherPlayer, queries, 0).reason).toBe('out-of-range');
    expect(world.plant(first, id, bag, 1, 'seed', player, { hasLineOfSight: () => false }, 0).reason).toBe('blocked');
    expect(world.plant(first, id, bag, 1, 'changed', player, queries, 0).reason).toBe('stale');
    expect(world.plant(first, id, bag, 0, 'axe', player, queries, 0).reason).toBe('wrong-seed');
    for (const now of [-1, NaN, Infinity]) expect(world.plant(first, id, bag, 1, 'seed', player, queries, now).reason).toBe('invalid');
    expect(bag.snapshot()).toEqual(before);
    expect(snapshot(world)[0]).toMatchObject({ nextCycleId: id, crop: null });
    expect(world.plant(first, id, bag, 1, 'seed', player, queries, 0).accepted).toBe(true);
    const planted = bag.snapshot(), next = snapshot(world)[0]!.nextCycleId;
    expect(world.plant(first, next, bag, 1, 'seed', player, queries, 1).reason).toBe('farm-busy');
    expect(world.plant(first, id, bag, 1, 'seed', player, queries, 1).reason).toBe('stale');
    expect(bag.snapshot()).toEqual(planted);
  });

  it('keeps the entire ready crop when only part of the harvest fits and retries with the same output ID', () => {
    const world = new FarmWorld(), seed = seedBag(), id = snapshot(world)[0]!.nextCycleId;
    world.plant(first, id, seed, 1, 'seed', player, queries, 0);
    const bag = new Inventory(2, [[0, { id: 'existing', itemId: 'carrot', amount: 4 }], [1, { id: 'axe', itemId: 'axe', amount: 1 }]]), before = bag.snapshot();
    expect(world.harvest(first, id, bag, player, queries, 120).reason).toBe('inventory-full');
    expect(bag.snapshot()).toEqual(before);
    expect(snapshot(world, 120)[0]?.crop).toMatchObject({ id, ready: true });
    expect(world.harvest(first, id, bag, otherPlayer, queries, 120).reason).toBe('out-of-range');
    expect(world.harvest(first, id, bag, player, { hasLineOfSight: () => false }, 120).reason).toBe('blocked');
    bag.remove(1);
    expect(world.harvest(first, id, bag, player, queries, 120).accepted).toBe(true);
    expect(bag.snapshot().slots).toEqual([{ id: 'existing', itemId: 'carrot', amount: 5 }, { id: id + '/harvest', itemId: 'carrot', amount: 2 }]);
  });

  it('keeps two farms independent and rejects old planting and harvest IDs during a later crop cycle', () => {
    const world = new FarmWorld(), bag = seedBag(), id = snapshot(world)[0]!.nextCycleId, other = snapshot(world)[1]!.nextCycleId;
    world.plant(first, id, bag, 1, 'seed', player, queries, 0);
    world.plant(second, other, bag, 1, 'seed', otherPlayer, queries, 30);
    expect(snapshot(world, 120).map((farm) => farm.crop?.ready)).toEqual([true, false]);
    expect(world.harvest(first, id, bag, player, queries, 120).accepted).toBe(true);
    const next = snapshot(world, 120)[0]!.nextCycleId;
    expect(world.plant(first, next, bag, 1, 'seed', player, queries, 120).accepted).toBe(true);
    const before = bag.snapshot();
    expect(world.plant(first, id, bag, 1, 'seed', player, queries, 240).reason).toBe('stale');
    expect(world.harvest(first, id, bag, player, queries, 240).reason).toBe('stale');
    expect(bag.snapshot()).toEqual(before);
    expect(world.harvest(first, next, bag, player, queries, 240).accepted).toBe(true);
    expect(world.harvest(second, other, bag, otherPlayer, queries, 240).accepted).toBe(true);
    const copy = snapshot(world, 240); (copy[0]!.position as { x: number }).x = 999;
    expect(snapshot(world, 240)[0]?.position.x).toBe(-4);
  });

  it.each([30, 60, 144])('keeps the same crop deadline when read at %i FPS', (fps) => {
    const world = new FarmWorld(), bag = seedBag(), id = snapshot(world)[0]!.nextCycleId;
    world.plant(first, id, bag, 1, 'seed', player, queries, 17);
    for (let frame = 1; frame < 120 * fps; frame++) expect(snapshot(world, 17 + frame / fps)[0]?.crop?.ready).toBe(false);
    expect(snapshot(world, 137)[0]?.crop).toMatchObject({ ready: true, readyAt: 137, progressSeconds: 120 });
    expect(bag.count('carrot')).toBe(4);
  });

  it('blocks farm commands during an attack, routes E to the farm and clears access on end', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'stone', itemId: 'stone', amount: 1 }], [3, { id: 'farm-wood', itemId: 'wood', amount: 2 }], [4, { id: 'seed', itemId: 'carrot', amount: 2 }]]);
    const world = new GameplayWorld(queries, [], bag, [], false, []);
    world.buildWorkbench({ ...player, position: { x: 0.6, y: 0.92, z: -3 } }, 0);
    expect(world.placeBuilding({ kind: 'farm', siteId: first.siteId, rotation: 0 }, player, 0).accepted).toBe(true);
    world.update(0, player, 0);
    expect(world.getSnapshot(0).interaction?.kind).toBe('farm');
    expect(world.interact(player, 0, 0).accepted).toBe(true);
    expect(world.getSnapshot(0).farms[0]?.crop).toBeNull();
    const id = world.getSnapshot(0).farms[0]!.nextCycleId;
    world.useItem('attack', 0, 0);
    expect(world.plantFarm(first.id, id, 4, 'seed', player, 0).reason).toBe('busy');
    expect(world.harvestFarm(first.id, id, player, 0).reason).toBe('busy');
    expect(bag.count('carrot')).toBe(2);
    world.update(1, player, 0);
    expect(world.plantFarm(first.id, id, 4, 'seed', player, 1).accepted).toBe(true);
    world.step(120);
    expect(world.getSnapshot(121)).toMatchObject({ campfire: { fuelSeconds: 0 }, farms: [{ crop: { ready: true } }] });
    world.end(); expect(world.getSnapshot(121).farms[0]?.inReach).toBe(false);
  });
});
