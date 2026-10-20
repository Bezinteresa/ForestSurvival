import { afterEach, describe, expect, it, vi } from 'vitest';
import { BED_SITES, BUILD_SITES, CAMP_PASSAGE, buildingBox, blocksCampPassage, type BuildingPlan, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { CampBuilding } from './CampBuilding';
import { PhysicsWorld } from './PhysicsWorld';
import { LocalSession } from '../session/LocalSession';
import { Game } from '../core/Game';
import { FakeScheduler } from '../core/FakeScheduler.test-helper';

const plan: BuildingPlan = { kind: 'storage', siteId: 'plot-1', rotation: 0 };
const player: PlayerSnapshot = { id: 'player', position: { x: -2, y: 0.92, z: 3 }, grounded: true, yaw: 0 };
const queries = { hasLineOfSight: () => true, canPlaceBuilding: () => true, activateBuildingCollider: vi.fn() };
function bag() { return new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'scrap', itemId: 'scrap', amount: 2 }]]); }
const resources: Array<{ destroy(): void }> = [];
afterEach(() => { for (const resource of resources.splice(0)) resource.destroy(); queries.activateBuildingCollider.mockClear(); });

describe('authored camp construction', () => {
  it('reserves four bed places, charges once per unique bed and rejects general plots, fifth places and shortages', () => {
    const camp = new CampBuilding();
    for (const site of BUILD_SITES) {
      const near = { ...player, position: { ...site.position, y: 0.92, z: site.position.z - 2 } };
      expect(camp.place({ kind: 'storage', siteId: site.id, rotation: 0 }, bag(), near, 1, queries, []).accepted).toBe(true);
    }
    for (const [index, site] of BED_SITES.entries()) {
      const bed: BuildingPlan = { kind: 'bed', siteId: site.id, rotation: index % 2 as 0 | 1 };
      const near = { ...player, position: { ...site.position, y: 0.92, z: site.position.z - 2 } };
      const inventory = bag(), before = inventory.snapshot();
      expect(camp.preview(bed, inventory, near, 1, queries, []).result.accepted).toBe(true);
      expect(inventory.snapshot()).toEqual(before);
      expect(camp.place(bed, inventory, near, 0, queries, []).reason).toBe('station-required');
      expect(inventory.snapshot()).toEqual(before);
      expect(camp.place(bed, inventory, near, 1, queries, []).accepted).toBe(true);
      expect([inventory.count('wood'), inventory.count('scrap')]).toEqual([1, 1]);
      expect(camp.place({ ...bed, rotation: bed.rotation ? 0 : 1 }, inventory, near, 1, queries, []).reason).toBe('already-built');
      expect(camp.bedIds()).toHaveLength(index + 1);
    }
    expect(camp.snapshot()).toHaveLength(10);
    const ids = camp.bedIds(); ids.pop(); expect(camp.bedIds()).toHaveLength(4);
    for (const siteId of ['plot-1', 'bed-plot-5']) expect(camp.place({ kind: 'bed', siteId, rotation: 0 }, bag(), player, 1, queries, []).reason).toBe('invalid');
    expect(buildingBox({ ...plan, siteId: 'bed-plot-1' })).toBeNull();
    const emptyCamp = new CampBuilding(), missing = new Inventory(5, [[0, { id: 'wood', itemId: 'wood', amount: 2 }]]), before = missing.snapshot();
    const near = { ...player, position: { x: -5, y: 0.92, z: 8.5 } };
    expect(emptyCamp.place({ kind: 'bed', siteId: 'bed-plot-1', rotation: 0 }, missing, near, 1, queries, []).reason).toBe('insufficient-materials');
    expect(missing.snapshot()).toEqual(before);
    expect(emptyCamp.bedIds()).toEqual([]);
  });
  it('previews without payment, confirms one whole price and refuses a second object on the same site', () => {
    const camp = new CampBuilding(), inventory = bag(), before = inventory.snapshot();
    expect(camp.preview(plan, inventory, player, 1, queries, []).result.accepted).toBe(true);
    expect(inventory.snapshot()).toEqual(before);
    expect(camp.snapshot()).toEqual([]);
    expect(camp.place(plan, inventory, player, 1, queries, []).accepted).toBe(true);
    expect([inventory.count('wood'), inventory.count('scrap')]).toEqual([0, 1]);
    const after = inventory.snapshot();
    expect(camp.place({ ...plan, kind: 'barricade', rotation: 1 }, inventory, player, 2, queries, []).reason).toBe('already-built');
    expect(inventory.snapshot()).toEqual(after);
    expect(queries.activateBuildingCollider).toHaveBeenCalledTimes(1);
    const snapshot = camp.snapshot();
    (snapshot[0]!.position as { x: number }).x = 999;
    expect(camp.snapshot()[0]!.position).toEqual(buildingBox(plan)!.position);
  });

  it('rejects unknown sites/types/rotations, distant or airborne players and missing station levels', () => {
    const camp = new CampBuilding(), inventory = bag(), before = inventory.snapshot();
    for (const invalid of [{ ...plan, siteId: 'outside' }, { ...plan, kind: '__proto__' }, { ...plan, kind: 'constructor' }, { ...plan, rotation: 2 }, { ...plan, rotation: NaN }]) {
      expect(camp.place(invalid as BuildingPlan, inventory, player, 3, queries, []).reason).toBe('invalid');
    }
    expect(camp.place(plan, inventory, player, 0, queries, []).reason).toBe('station-required');
    expect(camp.place({ ...plan, kind: 'barricade' }, inventory, player, 1, queries, []).reason).toBe('station-level');
    expect(camp.place(plan, inventory, { ...player, grounded: false }, 1, queries, []).reason).toBe('out-of-range');
    expect(camp.place(plan, inventory, { ...player, position: { x: 8, y: 0.92, z: 8 } }, 1, queries, []).reason).toBe('out-of-range');
    expect(camp.place(plan, inventory, { ...player, position: { ...player.position, y: 4 } }, 1, queries, []).reason).toBe('out-of-range');
    expect(inventory.snapshot()).toEqual(before);
    expect(camp.snapshot()).toEqual([]);
  });

  it('keeps every ingredient on occlusion, intersection, ground loot or a missing final material', () => {
    const camp = new CampBuilding(), inventory = bag(), before = inventory.snapshot();
    expect(camp.place(plan, inventory, player, 1, { ...queries, hasLineOfSight: () => false }, []).reason).toBe('blocked');
    expect(camp.place(plan, inventory, player, 1, { ...queries, canPlaceBuilding: () => false }, []).reason).toBe('blocked');
    expect(camp.place(plan, inventory, player, 1, queries, [{ id: 'dropped', itemId: 'axe', amount: 1, position: { x: -2, y: 0.23, z: 4.5 } }]).reason).toBe('blocked');
    expect(inventory.snapshot()).toEqual(before);
    const missing = new Inventory(5, [[0, { id: 'wood', itemId: 'wood', amount: 3 }]]);
    const unchanged = missing.snapshot();
    expect(camp.place(plan, missing, player, 1, queries, []).reason).toBe('insufficient-materials');
    expect(missing.snapshot()).toEqual(unchanged);
    expect(queries.activateBuildingCollider).not.toHaveBeenCalled();
  });

  it('gives each new storage its own empty container and preserves item identities on transfer', () => {
    const camp = new CampBuilding(), inventory = bag();
    camp.place(plan, inventory, player, 1, queries, []);
    const first = camp.storage(buildingBox(plan)!.id)!;
    expect(first.snapshot().slots).toHaveLength(8);
    expect(first.snapshot().slots.every((slot) => slot === null)).toBe(true);
    expect(first.transfer(inventory, 'deposit', 0, 'axe', player, { ...queries, removeEntityCollider: () => {} }).accepted).toBe(true);
    expect(inventory.getStack(0)).toBeNull();
    const slot = first.snapshot().slots.findIndex((stack) => stack?.id === 'axe');
    expect(first.transfer(inventory, 'withdraw', slot, 'wrong-id', player, { ...queries, removeEntityCollider: () => {} }).reason).toBe('stale');
    expect(first.transfer(inventory, 'withdraw', slot, 'axe', player, { ...queries, removeEntityCollider: () => {} }).accepted).toBe(true);
    expect(inventory.getStack(0)?.id).toBe('axe');
    const secondPlan: BuildingPlan = { ...plan, siteId: 'plot-2' };
    const otherPlayer = { ...player, position: { x: 1, y: 0.92, z: 5 } };
    const otherBag = bag();
    expect(camp.place(secondPlan, otherBag, otherPlayer, 1, queries, []).accepted).toBe(true);
    expect(camp.storage(buildingBox(secondPlan)!.id)).not.toBe(first);
  });

  it('uses server-defined footprints and keeps all supported footprints away from the protected exit', () => {
    const first = buildingBox(plan)!;
    (first.position as { z: number }).z = 1000;
    expect(buildingBox(plan)!.position.z).toBe(4.5);
    expect(buildingBox({ ...plan, rotation: 1 })!.halfSize).toEqual({ x: 0.4, y: 0.5, z: 0.6 });
    for (const site of BUILD_SITES) for (const kind of ['storage', 'barricade'] as const) for (const rotation of [0, 1] as const) {
      expect(blocksCampPassage(buildingBox({ kind, siteId: site.id, rotation })!)).toBe(false);
    }
    expect(blocksCampPassage({ id: 'seal-exit', position: { x: 0, y: 0.6, z: 0 }, halfSize: { x: 1, y: 0.6, z: 1 } })).toBe(true);
  });
});

describe('construction with live Rapier and lifecycle', () => {
  it.each([['storage', 0], ['storage', 1], ['barricade', 0], ['barricade', 1]] as const)('fits all four reserved beds with general plots occupied by %s at rotation %i', async (kind, rotation) => {
    const physics = await PhysicsWorld.create(); resources.push(physics);
    for (let step = 0; step < 180; step++) physics.step(1 / 60);
    for (const site of BUILD_SITES) {
      const box = buildingBox({ kind, siteId: site.id, rotation: kind === 'barricade' && site.id === 'plot-6' ? 1 : rotation })!;
      expect(physics.canPlaceBuilding(box), site.id).toBe(true);
      physics.activateBuildingCollider(box);
    }
    for (const site of BED_SITES) {
      const box = buildingBox({ kind: 'bed', siteId: site.id, rotation })!;
      expect(blocksCampPassage(box)).toBe(false);
      expect(physics.canPlaceBuilding(box), site.id).toBe(true);
      physics.activateBuildingCollider(box);
      const from = { ...box.position, z: box.position.z - 2 };
      expect(physics.hasLineOfSight(from, { ...from, z: box.position.z + 2 })).toBe(false);
    }
    for (const target of [...CAMP_PASSAGE.slice(1), { x: -12, z: 8 }, { x: -10, z: 10 }, { x: -10, z: 13 }, { x: -8, z: 13 }, { x: -5, z: 12.5 }, { x: -1, z: 12.5 }, { x: 5.5, z: 12.5 }, { x: 8, z: 11 }, { x: 11.5, z: 11 }, { x: 11.5, z: 8.5 }, { x: 11, z: 5 }, { x: 10, z: -3 }]) {
      let reached = false;
      for (let step = 0; step < 300; step++) {
        const p = physics.getPlayerSnapshot().position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
        if (distance < 0.12) { reached = true; break; }
        physics.step(1 / 60, { x: dx / distance * 0.07, z: dz / distance * 0.07 });
      }
      expect(reached, JSON.stringify(target)).toBe(true);
    }
  });
  it('ignores unbuilt plots, activates a collider without advancing physics and immediately blocks rays/drop/movement', async () => {
    const physics = await PhysicsWorld.create(); resources.push(physics);
    for (let step = 0; step < 180; step++) physics.step(1 / 60);
    const box = buildingBox({ kind: 'barricade', siteId: 'plot-1', rotation: 0 })!;
    const before = physics.getPlayerSnapshot();
    expect(physics.canPlaceBuilding(box)).toBe(true);
    expect(physics.hasLineOfSight({ x: -2, y: 0.7, z: 3 }, { x: -2, y: 0.7, z: 6 })).toBe(true);
    physics.activateBuildingCollider(box);
    expect(physics.getPlayerSnapshot()).toEqual(before);
    expect(physics.hasLineOfSight({ x: -2, y: 0.7, z: 3 }, { x: -2, y: 0.7, z: 6 })).toBe(false);
    expect(physics.findDropPosition({ ...player, position: { x: -2, y: 0.92, z: 3.3 } }, 0)).toBeNull();
    for (let step = 0; step < 28; step++) physics.step(1 / 60, { x: -0.07, z: 0 });
    for (let step = 0; step < 120; step++) physics.step(1 / 60, { x: 0, z: 0.07 });
    expect(physics.getPlayerSnapshot().position.z).toBeLessThan(4);
  });

  it('detects the player on a plot and existing fixed geometry', async () => {
    const physics = await PhysicsWorld.create(); resources.push(physics);
    for (let step = 0; step < 180; step++) physics.step(1 / 60);
    for (let step = 0; step < 28; step++) physics.step(1 / 60, { x: -0.07, z: 0 });
    for (let step = 0; step < 64; step++) physics.step(1 / 60, { x: 0, z: 0.07 });
    expect(physics.canPlaceBuilding(buildingBox(plan)!)).toBe(false);
    expect(physics.canPlaceBuilding(buildingBox({ kind: 'barricade', siteId: 'plot-6', rotation: 0 })!)).toBe(false);
  });

  it('preserves a real walking route with every supported site occupied by a wide footprint', async () => {
    const physics = await PhysicsWorld.create(); resources.push(physics);
    for (let step = 0; step < 180; step++) physics.step(1 / 60);
    for (const site of BUILD_SITES) {
      const box = buildingBox({ kind: 'barricade', siteId: site.id, rotation: 0 })!;
      if (physics.canPlaceBuilding(box)) physics.activateBuildingCollider(box);
    }
    for (const target of CAMP_PASSAGE.slice(1)) {
      let reached = false;
      for (let step = 0; step < 250; step++) {
        const p = physics.getPlayerSnapshot().position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
        if (distance < 0.12) { reached = true; break; }
        physics.step(1 / 60, { x: dx / distance * 0.07, z: dz / distance * 0.07 });
      }
      expect(reached, JSON.stringify(target)).toBe(true);
    }
  });

  it('keeps preview mode from sending gameplay input while simulation continues; pause and destroy stay safe', async () => {
    const session = await LocalSession.create(); resources.push(session);
    const scheduler = new FakeScheduler(), render = vi.fn();
    const game = new Game(session, { render, destroy: () => {} }, scheduler); resources.push(game);
    game.start(); game.toggleInventory(); game.setBuildingPlan(plan);
    expect(game.input.enabled).toBe(false);
    const initial = session.getSnapshot();
    game.input.setHeld('Primary', 'test', true); game.input.setMove('test', 1, 1);
    scheduler.advance(0); scheduler.advance(20); scheduler.advance(40);
    expect(session.getSnapshot().simulationTime).toBeGreaterThan(initial.simulationTime);
    expect(session.getSnapshot().gameplay.attack.phase).toBe('idle');
    expect(render.mock.lastCall?.[0].buildingPreview.plan).toEqual(plan);
    game.pause();
    expect(game.previewBuilding(plan).result.reason).toBe('paused');
    game.start(); expect(game.input.enabled).toBe(false);
    game.setBuildingPlan(null); expect(game.input.enabled).toBe(true);
    game.destroy();
    expect(() => game.previewBuilding(plan)).not.toThrow();
    expect(() => session.getSnapshot()).not.toThrow();
  });
});
