/**
 * Temporal Intelligence Context Builder
 *
 * "Better Than Human" - We know your rhythms, your patterns, your important moments.
 *
 * This builder synthesizes:
 * - Time of day patterns (morning person? night owl?)
 * - Day of week patterns (rough Mondays? better Fridays?)
 * - Seasonal patterns (winter blues? summer energy?)
 * - Life rhythm milestones (streaks, anniversaries)
 * - Important dates approaching (birthdays, events)
 *
 * Philosophy: Use temporal awareness to show up at the right moments
 * with the right energy. "I know Tuesday mornings are hard for you."
 *
 * PERFORMANCE:
 * - Session-scoped cache (2 min TTL) avoids repeated Firestore reads
 * - Pattern writing is rate-limited (every 5 turns)
 * - Target: <5ms cache hit, <100ms cache miss
 *
 * @module TemporalIntelligenceContext
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type TimeOfDay = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late_night';
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type Season = 'spring' | 'summer' | 'fall' | 'winter';
interface TemporalContext {
    timeOfDay: TimeOfDay;
    dayOfWeek: DayOfWeek;
    season: Season;
    isWeekend: boolean;
    isLateNight: boolean;
    hourOfDay: number;
    dayOfMonth: number;
    monthOfYear: number;
}
declare function getCurrentTemporalContext(): TemporalContext;
declare function buildTemporalIntelligenceContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Update temporal patterns based on conversation
 * Call this after each conversation to learn patterns
 */
declare function learnTemporalPatternInternal(userId: string, _sessionContext?: {
    emotion?: string;
    topic?: string;
}): Promise<void>;
export { buildTemporalIntelligenceContext, learnTemporalPatternInternal as learnTemporalPattern, getCurrentTemporalContext, };
//# sourceMappingURL=temporal-intelligence.d.ts.map