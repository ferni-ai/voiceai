/**
 * Voice Agent Integration for Superhuman Trigger Intelligence
 *
 * Integrates Phase 2 (Personal Memory), Phase 3 (Temporal Intelligence),
 * Phase 4 (Effectiveness Learning), and Phase 5 (Anticipatory Triggers)
 * into the voice agent session lifecycle.
 *
 * Usage:
 * 1. On session start: loadUserTriggerContext(userId)
 * 2. On each turn: recordTriggerOutcome(...) when a trigger fires
 * 3. On session end: saveUserTriggerContext(userId)
 *
 * @module voice-agent-integration
 */
import { type PersonalContextBoost } from './personal-context-integrator.js';
import { type TemporalBoostResult } from './temporal-pattern-detector.js';
import { type UserEffectivenessAnalysis } from './effectiveness-calculator.js';
import type { UserTriggerProfile, SignificantDate, TriggerFiringEvent } from './user-trigger-profile.types.js';
/**
 * Combined context from Phase 2 + Phase 3 + Phase 4
 */
export interface TriggerContext {
    /** User ID */
    userId: string;
    /** User's trigger profile */
    profile: UserTriggerProfile;
    /** Personal context boost (Phase 2) */
    personalBoost: PersonalContextBoost;
    /** Temporal boost (Phase 3) */
    temporalBoost: TemporalBoostResult;
    /** Effectiveness analysis (Phase 4) */
    effectivenessAnalysis: UserEffectivenessAnalysis | null;
    /** Session-scoped firing events (not yet persisted) */
    sessionFirings: TriggerFiringEvent[];
    /** Whether the profile has been modified */
    isDirty: boolean;
}
/**
 * Load user trigger context at session start
 * Combines Phase 2 (personal memory) and Phase 3 (temporal patterns)
 */
export declare function loadUserTriggerContext(userId: string, sessionId: string): Promise<TriggerContext>;
/**
 * Get current session trigger context (must be loaded first)
 */
export declare function getSessionTriggerContext(sessionId: string): TriggerContext | undefined;
/**
 * Record trigger outcome during conversation
 * Called when a trigger fires and user responds
 */
export declare function recordTriggerOutcome(sessionId: string, triggerName: string, triggerCategory: string, outcome: 'engaged' | 'deflected' | 'neutral' | 'unknown'): void;
/**
 * Save user trigger context at session end
 * Persists firing events and updates temporal patterns
 */
export declare function saveUserTriggerContext(sessionId: string): Promise<boolean>;
/**
 * Get combined trigger boost for a trigger name
 * Merges personal boost (Phase 2), temporal boost (Phase 3), and effectiveness (Phase 4)
 */
export declare function getCombinedTriggerBoost(sessionId: string, triggerName: string, triggerCategory: string): {
    multiplier: number;
    shouldBoost: boolean;
    shouldSuppress: boolean;
    shouldExplore: boolean;
    contextNotes: string[];
};
/**
 * Get significant dates approaching (for proactive mentions)
 */
export declare function getApproachingSignificantDates(sessionId: string, withinDays?: number): SignificantDate[];
/**
 * Clear all session contexts (for testing)
 */
export declare function clearAllSessionContexts(): void;
/**
 * Get number of active session contexts (for monitoring)
 */
export declare function getActiveSessionCount(): number;
//# sourceMappingURL=voice-agent-integration.d.ts.map