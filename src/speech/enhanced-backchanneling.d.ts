/**
 * Enhanced Backchanneling System
 *
 * Research-backed active listening sounds that signal presence and engagement.
 *
 * Key improvements over basic backchanneling:
 * 1. **Faster response** - Triggers at shorter pauses (3-5s vs 8s)
 * 2. **Context-aware** - Different sounds for different emotional states
 * 3. **Varied repertoire** - More natural variety in responses
 * 4. **Persona-specific** - Each persona has distinct listening style
 *
 * Research shows backchanneling:
 * - Reduces awkward pauses
 * - Encourages users to continue speaking
 * - Increases perceived attentiveness and trust
 *
 * NOTE: This module is kept for backward compatibility.
 * New code should use the unified backchanneling module at ./backchanneling/
 *
 * @see docs/VOICE-HUMANIZATION-RESEARCH.md
 * @see ./backchanneling/index.ts for unified API
 */
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import { type BackchannelCategory } from './persona-phrases.js';
/**
 * @deprecated Use BackchannelCategory from persona-phrases.ts
 */
export type BackchannelType = BackchannelCategory;
export interface BackchannelTiming {
    /** Minimum user speech duration before backchannel (ms) */
    minSpeechDuration: number;
    /** Pause duration that triggers backchannel (ms) */
    pauseTriggerDuration: number;
    /** Minimum time between backchannels (ms) */
    cooldownPeriod: number;
    /** Maximum backchannels per conversation turn */
    maxPerTurn: number;
}
export interface EnhancedBackchannelContext {
    /** How long user has been speaking (ms) */
    userSpeechDuration: number;
    /** Current pause duration (ms) */
    currentPauseDuration: number;
    /** User's detected emotion */
    userEmotion: EmotionResult;
    /** Conversation topic weight */
    topicWeight: 'light' | 'medium' | 'heavy';
    /** Persona ID for style */
    personaId?: string;
    /** User's recent content (for context-aware responses) */
    recentContent?: string;
    /** Number of backchannels already given this turn */
    backchannelCountThisTurn: number;
    /** Time of last backchannel (ms timestamp) */
    lastBackchannelTime?: number;
}
export interface BackchannelDecision {
    /** Whether to emit a backchannel */
    shouldEmit: boolean;
    /** The backchannel phrase to use */
    phrase: string | null;
    /** Type of backchannel */
    type: BackchannelType | null;
    /** SSML-formatted output */
    ssml: string | null;
    /** Reason for decision */
    reason: string;
}
/**
 * Core backchannel library with variations
 * @see persona-phrases.ts for source of truth
 */
export declare const BACKCHANNEL_LIBRARY: Record<BackchannelCategory, string[]>;
/**
 * Persona-specific backchannel preferences
 * @see persona-phrases.ts for source of truth
 */
export declare const PERSONA_BACKCHANNEL_STYLE: Record<string, import("./persona-phrases.js").PersonaBackchannelStyle>;
/**
 * Enhanced backchannel decision engine
 *
 * Makes intelligent decisions about when and what to backchannel
 * based on context, timing, and user state.
 */
export declare class EnhancedBackchannelingEngine {
    private lastBackchannelTime;
    private backchannelHistory;
    private turnBackchannelCount;
    private readonly maxHistorySize;
    constructor();
    /**
     * Decide whether to emit a backchannel
     */
    decide(context: EnhancedBackchannelContext): BackchannelDecision;
    /**
     * Get timing config based on topic weight
     */
    private getTimingConfig;
    /**
     * Check if timing conditions are met
     */
    private checkTiming;
    /**
     * Select appropriate backchannel type based on context
     */
    private selectBackchannelType;
    /**
     * Select phrase, avoiding recent repetition
     */
    private selectPhrase;
    /**
     * Build SSML-formatted backchannel
     */
    private buildSsml;
    /**
     * Record backchannel for history
     */
    private recordBackchannel;
    /**
     * Reset for new turn
     */
    newTurn(): void;
    /**
     * Reset for new session
     */
    reset(): void;
    /**
     * Get statistics
     */
    getStats(): {
        totalBackchannels: number;
        lastBackchannelTime: number;
        recentTypes: BackchannelType[];
    };
}
/**
 * Get or create enhanced backchanneling engine for session
 */
export declare function getEnhancedBackchannelingEngine(sessionId: string): EnhancedBackchannelingEngine;
/**
 * Reset and remove session's backchanneling engine (on session end)
 */
export declare function resetEnhancedBackchannelingEngine(sessionId: string): void;
/**
 * Get a quick backchannel phrase based on emotion only
 * For use when full context isn't available
 */
export declare function getQuickBackchannel(userDistressLevel: number, personaId?: string): string;
declare const _default: {
    EnhancedBackchannelingEngine: typeof EnhancedBackchannelingEngine;
    getEnhancedBackchannelingEngine: typeof getEnhancedBackchannelingEngine;
    resetEnhancedBackchannelingEngine: typeof resetEnhancedBackchannelingEngine;
    getQuickBackchannel: typeof getQuickBackchannel;
    BACKCHANNEL_LIBRARY: Record<BackchannelCategory, string[]>;
    PERSONA_BACKCHANNEL_STYLE: Record<string, import("./persona-phrases.js").PersonaBackchannelStyle>;
};
export default _default;
//# sourceMappingURL=enhanced-backchanneling.d.ts.map