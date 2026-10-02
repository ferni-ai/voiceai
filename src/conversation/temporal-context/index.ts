/**
 * Temporal Context Module
 *
 * Clean architecture refactoring of the temporal context system.
 *
 * @module @ferni/conversation/temporal-context
 */

// Types
export type {
  DayType,
  TemporalGuidance,
  TemporalMood,
  TemporalState,
  TimeOfDay,
  UpcomingEvent,
} from './types.js';

// Content
export {
  CLOSINGS,
  DAY_CONTEXT_PHRASES,
  EVENT_FOLLOW_UPS,
  GREETINGS,
  TEMPORAL_MOODS,
} from './content.js';

// Engine
export { TemporalContextEngine, default } from './engine.js';

// ============================================================================
// SINGLETON
// ============================================================================

import { createUserKeyedRegistry } from '../../utils/session-registry.js';
import { TemporalContextEngine } from './engine.js';

const temporalContextRegistry = createUserKeyedRegistry(
  'TemporalContext',
  () => new TemporalContextEngine()
);

export function getTemporalContextEngine(userId: string): TemporalContextEngine {
  return temporalContextRegistry.get(userId);
}

export function resetTemporalContextEngine(userId: string): void {
  const engine = temporalContextRegistry.get(userId);
  engine.reset();
}

export function clearTemporalContextEngine(userId: string): void {
  temporalContextRegistry.reset(userId);
}

export function getActiveTemporalContextCount(): number {
  return temporalContextRegistry.getActiveCount();
}
