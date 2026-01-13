/**
 * Temporal Content
 *
 * Greetings, closings, and context-aware phrases.
 *
 * @module @ferni/conversation/temporal-context/content
 */
import type { DayType, TemporalMood, TimeOfDay } from './types.js';
export declare const TEMPORAL_MOODS: Record<string, Array<{
    days: number[];
    hours: number[];
    mood: TemporalMood;
}>>;
export declare const GREETINGS: Record<TimeOfDay, string[]>;
export declare const CLOSINGS: Record<TimeOfDay, string[]>;
export declare const DAY_CONTEXT_PHRASES: Record<DayType, Record<TimeOfDay, string[]>>;
export declare const EVENT_FOLLOW_UPS: {
    approaching: string[];
    today: string[];
    past: string[];
};
//# sourceMappingURL=content.d.ts.map