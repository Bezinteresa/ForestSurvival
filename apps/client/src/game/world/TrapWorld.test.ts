import { describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_LEVELS, CAMPFIRE_MAX_LEVEL, TEST_SUPPLIES, TRAP_CONFIG, TRAP_SITES, WORKBENCH_CONFIG, buildingBox, isGear, type BuildingSnapshot, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from './GameplayWorld';
import { TrapWorld } from './TrapWorld';

const site = TRAP_SITES[0];
const trap: BuildingSnapshot = { ...buildingBox({ siteId: site.id, kind: 'rabbit-trap', rotation: 0 })!, kind: 'rabbit-trap', siteId: site.id, rotation: 0 };
const near: PlayerSnapshot = { id: 'player', position: { x: site.position.x + 1.4, y: 0.92, z: site.position.z }, grounded: true, yaw: -Math.PI / 2 };
const visible = { hasLineOfSight: () => true };

describe('rabbit trap', () => {
  it('catches one hare per cycle, hands out raw meat once and re-arms from the collection time', () => {
    const traps = new TrapWorld(), bag = new Inventory(5, []);
    traps.arm(trap.id, 10);
    traps.arm(trap.id, 50);
    const [early] = traps.snapshot([trap], 60, new Set([trap.id]));
    expect(early).toMatchObject({ catchId: trap.id + '/catch/0', progressSeconds: 50, durationSeconds: TRAP_CONFIG.catchSeconds, ready: false, inReach: true });
    expect(traps.collect(trap, early!.catchId, bag, near, visible, 60).reason).toBe('trap-empty');
    expect(traps.collect(trap, early!.catchId, bag, near, visible, 10 + TRAP_CONFIG.catchSeconds).accepted).toBe(true);
    expect(bag.snapshot().slots[0]).toEqual({ id: trap.id + '/catch/0', itemId: 'raw-meat', amount: TRAP_CONFIG.meatPerCatch });
    expect(traps.collect(trap, early!.catchId, bag, near, visible, 200).reason).toBe('stale');
    const [rearmed] = traps.snapshot([trap], 100 + 10, new Set());
    expect(rearmed).toMatchObject({ catchId: trap.id + '/catch/1', progressSeconds: 10, ready: false });
  });

  it('keeps the catch on a full bag, distance, a wall or an unknown trap, and counts time only from arming', () => {
    const traps = new TrapWorld();
    const full = new Inventory(1, [[0, { id: 'stone', itemId: 'stone', amount: 3 }]]);
    expect(traps.collect(trap, trap.id + '/catch/0', full, near, visible, 500).reason).toBe('missing');
    traps.arm(trap.id, 0);
    const id = trap.id + '/catch/0', ready = TRAP_CONFIG.catchSeconds;
    expect(traps.collect(trap, id, full, near, visible, ready).reason).toBe('inventory-full');
    expect(traps.collect(trap, id, new Inventory(5, []), { ...near, position: { x: 0, y: 0.92, z: 0 } }, visible, ready).reason).toBe('out-of-range');
    expect(traps.collect(trap, id, new Inventory(5, []), near, { hasLineOfSight: () => false }, ready).reason).toBe('blocked');
    expect(traps.snapshot([trap], ready, new Set())[0]?.ready).toBe(true);
  });

  it('is built from the camp building list at workbench level 1 and collected with E when a hare is caught', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood-a', itemId: 'wood', amount: 3 }], [2, { id: 'wood-b', itemId: 'wood', amount: 3 }], [3, { id: 'wood-c', itemId: 'wood', amount: 2 }], [4, { id: 'stone', itemId: 'stone', amount: 1 }]]);
    const queries = { ...visible, removeEntityCollider: vi.fn(), findDropPosition: () => null, canPlaceWorkbench: () => true, addWorkbenchCollider: vi.fn(), canPlaceBuilding: () => true, activateBuildingCollider: vi.fn() };
    const world = new GameplayWorld(queries, [], bag, [], false, []);
    const bench: PlayerSnapshot = { id: 'player', position: { x: WORKBENCH_CONFIG.position.x - 1.2, y: 0.92, z: WORKBENCH_CONFIG.position.z }, grounded: true, yaw: 0 };
    expect(world.placeBuilding({ kind: 'rabbit-trap', siteId: site.id, rotation: 0 }, near, 1).reason).toBe('station-required');
    expect(world.buildWorkbench(bench, 1).accepted).toBe(true);
    expect(world.placeBuilding({ kind: 'rabbit-trap', siteId: site.id, rotation: 0 }, near, 5).accepted).toBe(true);
    expect(bag.count('wood')).toBe(0);
    world.update(5, near, near.yaw);
    expect(world.getSnapshot(5).interaction).toMatchObject({ kind: 'rabbit-trap' });
    expect(world.interact(near, 5, near.yaw).reason).toBe('trap-empty');
    const ready = 5 + TRAP_CONFIG.catchSeconds;
    world.update(ready, near, near.yaw);
    expect(world.getSnapshot(ready).interaction?.label).toBe('Ловушка: заяц пойман');
    expect(world.interact(near, ready, near.yaw).accepted).toBe(true);
    expect(bag.count('raw-meat')).toBe(TRAP_CONFIG.meatPerCatch);
    expect(world.getSnapshot(ready).traps[0]).toMatchObject({ ready: false, catchId: world.getSnapshot(ready).traps[0]!.id + '/catch/1' });
  });
});

describe('equipment from finds instead of the workbench', () => {
  it('places reinforced tools and the large backpack beyond the starting fog but inside the full map', () => {
    const equipment = TEST_SUPPLIES.filter((supply) => supply.itemId === 'axe' || supply.itemId === 'pickaxe' || supply.itemId === 'large-backpack');
    expect(equipment.map((supply) => supply.itemId).sort()).toEqual(['axe', 'large-backpack', 'pickaxe']);
    for (const supply of equipment) {
      const reach = Math.max(Math.abs(supply.position.x), Math.abs(supply.position.z));
      expect(reach).toBeGreaterThan(CAMPFIRE_LEVELS[1].mapHalfSize);
      expect(reach).toBeLessThan(CAMPFIRE_LEVELS[CAMPFIRE_MAX_LEVEL].mapHalfSize - 0.5);
    }
    expect(equipment.filter((supply) => supply.itemId !== 'large-backpack').every((supply) => supply.level === 2)).toBe(true);
    expect(['map', 'compass', 'large-backpack'].every((id) => isGear(id as 'map'))).toBe(true);
  });
});
