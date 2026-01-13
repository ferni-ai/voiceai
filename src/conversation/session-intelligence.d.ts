/**
 * Session Intelligence Orchestrator
 *
 * > "Real-time emotional intelligence within a conversation session."
 *
 * This orchestrator provides **within-session** intelligence capabilities:
 *
 * 1. **Concern Detection** - Know they're struggling before they say it
 * 2. **Proactive Memory** - Remember things a human friend would forget
 * 3. **Predictive Anticipation** - Know what they need before they ask
 *
 * The orchestrator provides a unified intelligence layer that:
 * - Aggregates insights from all three systems
 * - Prioritizes which insights to act on
 * - Generates response modifications
 * - Emits signals to the frontend for avatar EQ
 *
 * **Note:** This is the **session-scoped** intelligence system.
 * For **cross-session** relationship-building features (emotional bonds,
 * inside jokes, temporal patterns), see the `superhuman/` module
 * (BetterThanHumanOrchestrator).
 *
 * @module @ferni/session-intelligence
 */
import { type BreathingSignals, type ConcernState } from './concern-detection.js';
import { type PredictionResult, type PredictiveAnticipationEngine, type ProsodyInput } from './predictive-anticipation.js';
import { type ProactiveMemoryEngine, type ProactiveMemorySuggestion } from './proactive-memory.js';
export interface SessionIntelligenceContext {
    /** Session ID */
    sessionId: string;
    /** User ID (for cross-session learning) */
    userId?: string;
    /** Current turn count */
    turnCount: number;
    /** User's message */
    userMessage: string;
    /** Detected topic */
    topic?: string;
    /** Detected emotion */
    emotion?: string;
    /** Emotional valence (-1 to 1) */
    valence?: number;
    /** Emotional arousal (0 to 1) */
    arousal?: number;
    /** Prosody signals from voice analysis */
    prosody?: ProsodyInput;
    /** Breathing signals if available */
    breathing?: BreathingSignals;
    /** Was this a vulnerable share? */
    wasVulnerable?: boolean;
    /** Is this the session start? */
    isSessionStart?: boolean;
    /** Previous topics discussed */
    previousTopics?: string[];
    /** Engagement level from scoring */
    engagementLevel?: number;
    /** Response latency */
    responseLatencyMs?: number;
}
export interface SessionIntelligenceInsight {
    /** Overall intelligence confidence (0-1) */
    confidence: number;
    /** Concern state */
    concern: ConcernState;
    /** Proactive memory suggestions */
    memorySuggestions: ProactiveMemorySuggestion[];
    /** Predictions about user state and needs */
    predictions: PredictionResult;
    /** Response modifications */
    responseModifications: ResponseModification[];
    /** Suggested opening (if session start) */
    suggestedOpening?: string;
    /** Overall guidance for the response */
    responseGuidance: ResponseGuidance;
}
export interface ResponseModification {
    /** Type of modification */
    type: 'voice_acknowledgment' | 'concern_validation' | 'memory_surface' | 'need_adaptation' | 'pacing_adjustment';
    /** The modification content */
    content: string;
    /** Where to place it */
    placement: 'prefix' | 'suffix' | 'replace_opening';
    /** Priority (higher = more important) */
    priority: number;
    /** Reason for this modification */
    reason: string;
}
export interface ResponseGuidance {
    /** Recommended approach */
    approach: 'normal' | 'gentle' | 'validate_first' | 'hold_space' | 'energize' | 'slow_down' | 'safety_check';
    /** Recommended pacing */
    pacing: 'normal' | 'slower' | 'faster' | 'deliberate';
    /** Recommended energy level */
    energy: 'normal' | 'lower' | 'higher' | 'match_user';
    /** Primary need to address */
    primaryNeed: string;
    /** Specific guidance */
    guidance: string;
    /** Things to avoid */
    avoid: string[];
}
export declare class SessionIntelligenceOrchestrator {
    private sessionId;
    private userId?;
    private concernEngine;
    private memoryEngine;
    private anticipationEngine;
    constructor(sessionId: string, userId?: string);
    /**
     * Analyze a user message and get superhuman insights
     * This is the main entry point - call on each turn
     */
    analyze(context: SessionIntelligenceContext): SessionIntelligenceInsight;
    /**
     * Apply response modifications to a draft response
     */
    applyModifications(response: string, insight: SessionIntelligenceInsight): string;
    /**
     * Get current state for debugging
     */
    getState(): {
        concern: ConcernState;
        predictions: PredictionResult;
        memoryCount: number;
    };
    /**
     * Record outcome for learning
     */
    recordOutcome(type: 'concern' | 'memory' | 'prediction', wasHelpful: boolean): void;
    /**
     * Import cross-session data
     */
    importCrossSessionData(data: {
        memories?: ReturnType<ProactiveMemoryEngine['exportMemories']>;
        patterns?: ReturnType<ProactiveMemoryEngine['exportPatterns']>;
        learning?: ReturnType<PredictiveAnticipationEngine['exportLearning']>;
    }): void;
    /**
     * Export cross-session data for persistence
     */
    exportCrossSessionData(): {
        memories: ReturnType<ProactiveMemoryEngine['exportMemories']>;
        patterns: ReturnType<ProactiveMemoryEngine['exportPatterns']>;
        learning: ReturnType<PredictiveAnticipationEngine['exportLearning']>;
    };
    /**
     * Reset for new session (preserves cross-session learning)
     */
    reset(): void;
    private generateModifications;
    private generateGuidance;
    private generateOpening;
    private emitSignals;
    private calculateConfidence;
}
export declare function getSessionIntelligence(sessionId: string, userId?: string): SessionIntelligenceOrchestrator;
export declare function resetSessionIntelligence(sessionId: string, userId?: string): void;
export declare function clearSessionIntelligence(sessionId: string, userId?: string): void;
export declare function getActiveSessionIntelligenceCount(): number;
export default SessionIntelligenceOrchestrator;
//# sourceMappingURL=session-intelligence.d.ts.map