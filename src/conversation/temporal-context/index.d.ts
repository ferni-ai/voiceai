/**
 * Temporal Context Module
 *
 * Clean architecture refactoring of the temporal context system.
 *
 * @module @ferni/conversation/temporal-context
 */
export type { DayType, TemporalGuidance, TemporalMood, TemporalState, TimeOfDay, UpcomingEvent, } from './types.js';
export { CLOSINGS, DAY_CONTEXT_PHRASES, EVENT_FOLLOW_UPS, GREETINGS, TEMPORAL_MOODS, } from './content.js';
export { TemporalContextEngine, default } from './engine.js';
import { TemporalContextEngine } from './engine.js';
export declare function getTemporalContextEngine(userId: string): TemporalContextEngine;
export declare function resetTemporalContextEngine(userId: string): void;
export declare function clearTemporalContextEngine(userId: string): void;
export declare function getActiveTemporalContextCount(): number;
//# sourceMappingURL=index.d.ts.map