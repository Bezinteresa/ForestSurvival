import { CAMPFIRE_LEVELS, CAMPFIRE_MAX_LEVEL } from '@forest-survival/shared';
import type { PhysicsWorld } from '../world/PhysicsWorld';
import type { LocalSession } from './LocalSession';

/**
 * Scenario tests that roam the whole test map move the fog boundary to its final position.
 * Gameplay only opens it by burning fuel; this skips that grind for tests about other systems.
 */
export function openWholeMap(session: LocalSession): LocalSession {
  (session as unknown as { physics: PhysicsWorld }).physics.setMapHalfSize(CAMPFIRE_LEVELS[CAMPFIRE_MAX_LEVEL].mapHalfSize);
  return session;
}
