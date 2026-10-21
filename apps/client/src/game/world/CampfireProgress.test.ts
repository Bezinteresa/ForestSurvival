import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMPFIRE_LEVELS, CAMPFIRE_MAX_LEVEL, NEUTRAL_PLAYER_INPUT, SIMULATION_CONFIG, type CampfireLevel, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { LocalSession } from '../session/LocalSession';
import { Campfire } from './Campfire';
import { GameplayWorld } from './GameplayWorld';
import type { PhysicsWorld } from './PhysicsWorld';

const player: PlayerSnapshot = { id: 'player', position: { x: 0, y: 0.92, z: 1.2 }, grounded: true, yaw: 0 };
function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => null, setMapHalfSize: vi.fn() }; }
function burn(fire: Campfire, itemId: 'wood' | 'coal', count: number) {
  const bag = new Inventory(1, []);
  for (let index = 0; index < count; index++) {
    expect(bag.insert({ id: itemId + '-' + index, itemId, amount: 1 }).accepted).toBe(true);
    expect(fire.addFuel(bag, 0, itemId + '-' + index, player, queries()).accepted).toBe(true);
  }
}

describe('campfire levels by burning fuel', () => {
  it('climbs every level only through burned fuel points, carrying overflow and stopping at the maximum', () => {
    const fire = new Campfire();
    let total = 0;
    for (let level = 1; level < CAMPFIRE_MAX_LEVEL; level++) {
      const required = CAMPFIRE_LEVELS[level as CampfireLevel].progressToNext!;
      burn(fire, 'wood', required - 1);
      expect(fire.snapshot(player, true)).toMatchObject({ level, progress: required - 1 });
      burn(fire, 'wood', 1);
      total += required;
      expect(fire.snapshot(player, true)).toMatchObject({ level: level + 1, progress: 0 });
    }
    expect(total).toBe(40);
    burn(fire, 'coal', 3);
    expect(fire.snapshot(player, true)).toMatchObject({ level: CAMPFIRE_MAX_LEVEL, progress: 0, progressRequired: null, mapHalfSize: CAMPFIRE_LEVELS[6].mapHalfSize, zoneRadius: 15 });
  });

  it('counts coal double and carries the remainder past a level boundary', () => {
    const fire = new Campfire();
    burn(fire, 'wood', 3);
    burn(fire, 'coal', 1);
    expect(fire.snapshot(player, true)).toMatchObject({ level: 2, progress: 1 });
  });

  it('opens a strictly larger map and warm zone at every level, always containing the camp', () => {
    for (let level = 2; level <= CAMPFIRE_MAX_LEVEL; level++) {
      const previous = CAMPFIRE_LEVELS[(level - 1) as CampfireLevel], current = CAMPFIRE_LEVELS[level as CampfireLevel];
      expect(current.mapHalfSize).toBeGreaterThan(previous.mapHalfSize);
      expect(current.safeRadius).toBeGreaterThan(previous.safeRadius);
    }
    expect(CAMPFIRE_LEVELS[1].mapHalfSize).toBeGreaterThanOrEqual(11);
  });

  it('refusals add no progress, and a level-up moves the fog boundary once with a clear message', () => {
    const visibility = queries();
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'wood', itemId: 'wood', amount: 3 }], [2, { id: 'coal', itemId: 'coal', amount: 1 }]]);
    const world = new GameplayWorld(visibility, [], bag, [], false, []);
    expect(world.fuelFire(0, 'axe', player, 0).reason).toBe('wrong-fuel');
    expect(world.fuelFire(1, 'other', player, 0).reason).toBe('stale');
    expect(world.fuelFire(1, 'wood', { ...player, position: { x: 0, y: 0.92, z: 9 } }, 0).reason).toBe('out-of-range');
    expect(world.useItem('swing', 0, 0).accepted).toBe(true);
    expect(world.fuelFire(1, 'wood', player, 0.05).reason).toBe('busy');
    expect(world.getSnapshot(1).campfire.progress).toBe(0);
    for (let index = 0; index < 3; index++) expect(world.fuelFire(1, 'wood', player, 1).accepted).toBe(true);
    expect(visibility.setMapHalfSize).not.toHaveBeenCalled();
    expect(world.getSnapshot(1).feedback?.text).toContain('75%');
    expect(world.fuelFire(2, 'coal', player, 1).accepted).toBe(true);
    expect(visibility.setMapHalfSize).toHaveBeenCalledTimes(1);
    expect(visibility.setMapHalfSize).toHaveBeenCalledWith(CAMPFIRE_LEVELS[2].mapHalfSize);
    expect(world.getSnapshot(1).feedback?.text).toContain('Карта стала больше');
  });
});

describe('fog boundary with real physics', () => {
  const sessions: LocalSession[] = [];
  afterEach(() => { for (const session of sessions.splice(0)) session.destroy(); });

  it('stops the player at the level-1 edge and lets them through once the map opens', async () => {
    const session = await LocalSession.create();
    sessions.push(session);
    session.start();
    const east = (steps: number) => { for (let index = 0; index < steps; index++) session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveX: 1, moveY: 0 }); };
    const walkZ = (z: number) => { for (let index = 0; index < 300 && Math.abs(session.getSnapshot().player.position.z - z) > 0.1; index++) session.step(SIMULATION_CONFIG.fixedStep, { ...NEUTRAL_PLAYER_INPUT, moveY: session.getSnapshot().player.position.z > z ? 1 : -1 }); };
    walkZ(6.5);
    east(300);
    const blocked = session.getSnapshot().player.position.x;
    expect(blocked).toBeLessThan(CAMPFIRE_LEVELS[1].mapHalfSize);
    expect(blocked).toBeGreaterThan(CAMPFIRE_LEVELS[1].mapHalfSize - 1);
    (session as unknown as { physics: PhysicsWorld }).physics.setMapHalfSize(CAMPFIRE_LEVELS[2].mapHalfSize);
    east(120);
    expect(session.getSnapshot().player.position.x).toBeGreaterThan(CAMPFIRE_LEVELS[1].mapHalfSize + 0.5);
  });
});
