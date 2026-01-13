/**
 * Awareness Facts System
 *
 * This module provides FACTUAL awareness to the model - things it should
 * genuinely know about, NOT behavioral guidance.
 *
 * PHILOSOPHY:
 * - Behavioral signals = HOW to behave (don't leak)
 * - Awareness facts = WHAT to know (model should use these)
 * - Tools = DEEP knowledge model can query
 *
 * The key difference from the old context system:
 * - OLD: "[TIME AWARENESS: It's 2am. Be gentle.]" (mixes fact + behavior)
 * - NEW:
 *   - Awareness: "Time: 2:17 AM" (just the fact)
 *   - Behavioral: { tone: 'gentle', pace: 'slow' } (just the behavior)
 *
 * The model should READ and USE awareness facts. They're not "stage directions"
 * to be invisible - they're genuine knowledge the model needs.
 *
 * @module intelligence/context-builders/behavioral/awareness
 */
import type { ContextBuilderInput } from '../core/types.js';
/**
 * Core awareness facts that the model should know
 */
export interface AwarenessFacts {
    /** Current time in user's timezone */
    currentTime?: string;
    /** Current date (e.g., "December 23, 2024") */
    currentDate?: string;
    /** Time of day category */
    timeOfDay?: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
    /** Day of week */
    dayOfWeek?: string;
    /** Is it a weekend? */
    isWeekend?: boolean;
    /** Current season */
    season?: 'spring' | 'summer' | 'fall' | 'winter';
    /** User's name */
    userName?: string;
    /** How long they've been talking (this session) */
    sessionDuration?: string;
    /** Turn count in this conversation */
    turnCount?: number;
    /** Whether they're a returning user */
    isReturningUser?: boolean;
    /** Days since last conversation */
    daysSinceLastChat?: number;
    /** Current topic being discussed */
    currentTopic?: string;
    /** Topics from earlier in conversation */
    earlierTopics?: string[];
    /** What persona they're talking to */
    currentPersona?: string;
    /** One-line summary of recent relevant context */
    recentContext?: string;
    /** Goals they're working on */
    activeGoals?: string[];
    /** Open threads from previous conversations */
    openThreads?: string[];
}
/**
 * Build awareness facts from the context input
 */
export declare function buildAwarenessFacts(input: ContextBuilderInput): Promise<AwarenessFacts>;
/**
 * Format awareness facts for inclusion in the prompt.
 *
 * These are MEANT to be read by the model - they're genuine knowledge,
 * not "stage directions" to be invisible.
 */
export declare function formatAwarenessFacts(facts: AwarenessFacts): string;
/**
 * Compact format for system prompt
 */
export declare function formatAwarenessCompact(facts: AwarenessFacts): string;
import type { BehavioralSignals } from './signals.js';
/**
 * Get behavioral signals implied by time of day.
 *
 * Note: These are BEHAVIORAL implications, not the facts themselves.
 * The facts go in awareness, the behavior goes in signals.
 */
export declare function getTimeOfDayBehavior(facts: AwarenessFacts): BehavioralSignals | null;
//# sourceMappingURL=awareness.d.ts.map