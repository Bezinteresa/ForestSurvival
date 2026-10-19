import { describe, expect, it, vi } from 'vitest';
import { CONSUMABLE_DEFINITIONS, SURVIVAL_CONFIG, TEST_SUPPLIES, type PlayerSnapshot } from '@forest-survival/shared';
import { Inventory } from '../items/Inventory';
import { GameplayWorld } from '../world/GameplayWorld';
import { PlayerVitals } from './PlayerVitals';

function queries() { return { hasLineOfSight: vi.fn(() => true), removeEntityCollider: vi.fn(), findDropPosition: () => null }; }

describe('consumable effects', () => {
  it('applies hunger and healing in one use, each capped by its maximum', () => {
    const vitals = new PlayerVitals({ health: 95, hunger: 80 });
    expect(vitals.consume(CONSUMABLE_DEFINITIONS['cooked-meat'])).toBe(true);
    expect(vitals.snapshot()).toMatchObject({ health: SURVIVAL_CONFIG.maxHealth, hunger: SURVIVAL_CONFIG.maxHunger });
  });

  it('accepts an item while any of its effects still applies and names what would be wasted otherwise', () => {
    expect(new PlayerVitals({ health: 50, hunger: 100 }).consumeBlocker(CONSUMABLE_DEFINITIONS['cooked-meat'])).toBeNull();
    expect(new PlayerVitals({ health: 100, hunger: 60 }).consumeBlocker(CONSUMABLE_DEFINITIONS['cooked-meat'])).toBeNull();
    expect(new PlayerVitals({ health: 100, hunger: 100 }).consumeBlocker(CONSUMABLE_DEFINITIONS['cooked-meat'])).toBe('satiated');
    expect(new PlayerVitals({ health: 50, hunger: 100 }).consumeBlocker(CONSUMABLE_DEFINITIONS.berries)).toBe('satiated');
    expect(new PlayerVitals({ health: 100, hunger: 10 }).consumeBlocker(CONSUMABLE_DEFINITIONS.bandage)).toBe('full-health');
    expect(new PlayerVitals({ health: 0 }).consumeBlocker(CONSUMABLE_DEFINITIONS.medkit)).toBe('dead');
    expect(new PlayerVitals().consumeBlocker({ hunger: Number.NaN, health: 5 })).toBe('invalid');
  });

  it('cooked food is worth more than raw, and medicine heals without feeding', () => {
    expect(CONSUMABLE_DEFINITIONS['cooked-meat'].hunger).toBeGreaterThan(CONSUMABLE_DEFINITIONS['raw-meat'].hunger);
    expect(CONSUMABLE_DEFINITIONS['raw-meat'].health).toBe(0);
    for (const id of ['bandage', 'medkit'] as const) expect(CONSUMABLE_DEFINITIONS[id]).toMatchObject({ hunger: 0 });
  });

  it('spends one unit through the world only when it changes something, keeping it on refusal or in a swing', () => {
    const bag = new Inventory(5, [[0, { id: 'axe', itemId: 'axe', amount: 1 }], [1, { id: 'bandages', itemId: 'bandage', amount: 2 }], [2, { id: 'kit', itemId: 'medkit', amount: 1 }]]);
    const world = new GameplayWorld(queries(), [], bag, [], false, []);
    const healthy = new PlayerVitals();
    expect(world.consumeItem(1, 'bandages', healthy, 0).reason).toBe('full-health');
    expect(bag.count('bandage')).toBe(2);
    const hurt = new PlayerVitals({ health: 30, hunger: 50 });
    expect(world.consumeItem(1, 'bandages', hurt, 0).accepted).toBe(true);
    expect(hurt.snapshot()).toMatchObject({ health: 55, hunger: 50 });
    expect(bag.count('bandage')).toBe(1);
    expect(world.consumeItem(2, 'kit', hurt, 0).accepted).toBe(true);
    expect(hurt.snapshot().health).toBe(SURVIVAL_CONFIG.maxHealth);
    expect(bag.count('medkit')).toBe(0);
    expect(world.consumeItem(2, 'kit', hurt, 0).reason).toBe('stale');
    const swinging = new PlayerVitals({ health: 10 });
    expect(world.useItem('swing', 0, 0).accepted).toBe(true);
    expect(world.consumeItem(1, 'bandages', swinging, 0.05).reason).toBe('busy');
    expect(bag.count('bandage')).toBe(1);
  });

  it('places found supplies as ordinary loot that is picked up once with its own ID', () => {
    const bag = new Inventory();
    const world = new GameplayWorld(queries(), [], bag, [], false, [], TEST_SUPPLIES);
    const supply = TEST_SUPPLIES[0]!;
    expect(world.getSnapshot(0).loot.map((item) => item.id)).toEqual(TEST_SUPPLIES.map((item) => item.id));
    const near: PlayerSnapshot = { id: 'player', position: { x: supply.position.x, y: 0.92, z: supply.position.z + 1 }, grounded: true, yaw: 0 };
    expect(world.pickup(supply.id, near, 0).accepted).toBe(true);
    expect(world.pickup(supply.id, near, 0).reason).toBe('missing');
    expect(bag.snapshot().slots.find((stack) => stack?.itemId === supply.itemId)).toMatchObject({ id: supply.id, amount: supply.amount });
  });
});
