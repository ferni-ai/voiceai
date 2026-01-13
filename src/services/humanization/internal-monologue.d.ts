/**
 * Internal Monologue System
 *
 * Ferni has a stream of "active thoughts" running during conversation.
 * These aren't reactive to keywords - they're EMERGENT from context:
 *
 * - A memory stirred by something said
 * - A concern forming about the user
 * - A realization happening in real-time
 * - Wrestling with uncertainty
 * - Noticing patterns
 *
 * Some thoughts surface naturally. Others stay internal.
 * This is what makes Ferni feel like they're actually PRESENT.
 *
 * "Wait, this reminds me of something..."
 * "I'm not sure if I should say this, but..."
 * "Something's been bothering me about what you said..."
 *
 * @module @ferni/internal-monologue
 */
import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';
/**
 * A thought in Ferni's active stream
 */
export interface ActiveThought {
    id: string;
    type: ThoughtType;
    /** The internal thought content */
    internalContent: string;
    /** How it might be expressed if surfaced */
    externalExpression: string;
    /** What triggered this thought */
    trigger: ThoughtTrigger;
    /** How likely to surface (0-1) */
    surfaceProbability: number;
    /** How "loud" this thought is internally (0-1) */
    urgency: number;
    /** When this thought arose */
    timestamp: number;
    /** How many turns this thought has been active */
    turnsActive: number;
    /** Topic association */
    topic?: string;
    /** Emotional weight */
    emotionalWeight: 'light' | 'medium' | 'heavy';
}
export type ThoughtType = 'memory_stirred' | 'concern_forming' | 'realization' | 'wrestling' | 'pattern_noticed' | 'vulnerability_urge' | 'question_forming' | 'appreciation' | 'tangent_impulse';
export interface ThoughtTrigger {
    type: 'word_match' | 'emotion_shift' | 'pattern_repeat' | 'silence' | 'topic_weight' | 'spontaneous';
    source?: string;
}
/**
 * Context for thought generation
 */
export interface MonologueContext {
    userMessage: string;
    turn: number;
    topic?: string;
    emotion?: string;
    emotionalIntensity?: number;
    silenceDuration?: number;
    recentTopics: string[];
    relationshipStage: string;
}
/**
 * Decision about surfacing a thought
 */
export interface SurfaceDecision {
    shouldSurface: boolean;
    thought?: ActiveThought;
    expression?: string;
    transitionPhrase?: string;
}
/**
 * Process a turn and potentially generate new thoughts
 */
export declare function processForThoughts(sessionId: string, context: MonologueContext, bundleRuntime?: BundleRuntimeEngine): ActiveThought[];
/**
 * Decide whether to surface a thought right now
 */
export declare function decideSurfacing(sessionId: string, context: {
    turn: number;
    emotionalIntensity?: number;
    isVulnerableMoment?: boolean;
    currentPhase?: string;
}): SurfaceDecision;
/**
 * Mark a thought as surfaced (remove from active stream)
 */
export declare function markThoughtSurfaced(sessionId: string, thoughtId: string): void;
/**
 * Get the current internal state summary
 */
export declare function getInternalStateSummary(sessionId: string): {
    activeThoughtCount: number;
    dominantThoughtType?: ThoughtType;
    highestUrgency: number;
    topics: string[];
};
/**
 * Clear monologue for a session
 */
export declare function clearMonologue(sessionId: string): void;
/**
 * Clear all monologues (for testing)
 */
export declare function clearAllMonologues(): void;
export declare const internalMonologue: {
    process: typeof processForThoughts;
    decideSurfacing: typeof decideSurfacing;
    markSurfaced: typeof markThoughtSurfaced;
    getState: typeof getInternalStateSummary;
    clear: typeof clearMonologue;
    clearAll: typeof clearAllMonologues;
};
export default internalMonologue;
//# sourceMappingURL=internal-monologue.d.ts.map