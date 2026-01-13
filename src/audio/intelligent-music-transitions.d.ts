/**
 * Intelligent Music Transitions
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When music ends, the right response depends on EVERYTHING:
 * - Why music started (emotional processing vs celebration vs background)
 * - What the conversation was about
 * - The user's emotional state
 * - The relationship depth
 * - Whether they were mid-thought
 * - What's worked for THIS user in the past (per-user learning)
 * - Whether we have music memories to reference
 *
 * This system generates contextually appropriate transitions instead of
 * randomly selecting from static phrases like "Ready to continue?"
 *
 * Philosophy: Sometimes the most human response is SILENCE.
 * A friend who just sat with you through a hard moment doesn't immediately
 * ask "Ready to move on?" — they let you come back when you're ready.
 *
 * ENHANCED FEATURES:
 * - Analytics: Tracks which transitions lead to better engagement
 * - User Learning: Learns what works for each individual user (Thompson Sampling)
 * - Music Memory: Remembers what music helped in what situations
 * - A/B Testing: Compare transition strategies to improve over time
 */
import type { MusicSessionContext, MusicStartReason } from './music-session-context.js';
import { type MusicCallbackPhrase } from './music-memory-integration.js';
import { type EngagementSignals, type TransitionEvent } from './music-transition-analytics.js';
export interface TransitionResult {
    /** Whether to speak at all */
    shouldSpeak: boolean;
    /** The phrase to say (if shouldSpeak is true) */
    phrase?: string;
    /** Why we chose this response */
    reasoning: string;
    /** How confident we are this is the right response (0-1) */
    confidence: number;
    /** The type of transition for logging/analytics */
    transitionType: TransitionType;
}
export type TransitionType = 'silence' | 'presence' | 'gentle_return' | 'topic_callback' | 'celebration_close' | 'acknowledgment' | 'check_in' | 'invitation' | 'persona_specific' | 'dj_vibes';
export interface TransitionInput {
    /** The music session context */
    musicContext: MusicSessionContext | null;
    /** Current persona ID */
    personaId: string;
    /** Current relationship stage (from intelligence system) */
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
    /** Current time context */
    isLateNight?: boolean;
    isEarlyMorning?: boolean;
    /** User ID for per-user learning (optional) */
    userId?: string;
    /** Session ID for analytics (optional) */
    sessionId?: string;
    /** Enable enhanced features (analytics, learning, memory) */
    enableEnhancements?: boolean;
}
/**
 * Enhanced transition result with analytics data
 */
export interface EnhancedTransitionResult extends TransitionResult {
    /** Event ID for tracking engagement (if analytics enabled) */
    eventId?: string;
    /** Exploration rate for this decision (0-1, higher = more exploration) */
    explorationRate?: number;
    /** Music memory callback (if available and relevant) */
    musicCallback?: MusicCallbackPhrase;
    /** A/B test variant this user is in */
    experimentVariant?: string;
    /** Whether this was influenced by user learning */
    usedUserLearning: boolean;
}
/**
 * Generate an intelligent music transition based on context
 *
 * This is the main entry point. It analyzes the music session context
 * and determines the most human response.
 *
 * @param input - The transition context
 * @returns Transition result with phrase (if any) and reasoning
 */
export declare function getIntelligentMusicTransition(input: TransitionInput): TransitionResult;
/**
 * Get an intelligent music transition with all enhancements
 *
 * This is the recommended entry point. It:
 * 1. Uses per-user learning to select the best transition type (Thompson Sampling)
 * 2. Records analytics for improving the system
 * 3. Checks for relevant music memories to reference
 * 4. Supports A/B testing for experimentation
 *
 * @param input - The transition context
 * @returns Enhanced transition result with analytics data
 */
export declare function getMusicTransition(input: TransitionInput): EnhancedTransitionResult;
/**
 * Record user feedback after a transition
 *
 * Call this when you have signals about how the user responded.
 * The system uses this to improve future transitions.
 *
 * @param eventId - The event ID from getMusicTransition
 * @param feedback - Engagement signals
 */
export declare function recordTransitionFeedback(eventId: string, userId: string, transitionType: TransitionType, feedback: {
    wasPositive: boolean;
    confidence: number;
    timeToUserSpeechMs?: number;
    userResponse?: string;
    continuedSession?: boolean;
}, context?: {
    startReason?: MusicStartReason;
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    isLateNight?: boolean;
    musicContext?: MusicSessionContext;
}): void;
/**
 * Get analytics dashboard data
 */
export declare function getTransitionAnalyticsDashboard(): {
    globalStats: Record<TransitionType, {
        count: number;
        positiveRate: number;
    }>;
    recentDecisions: Array<{
        type: TransitionType;
        reasoning: string;
        timestamp: number;
    }>;
    abTestResults: Record<string, {
        count: number;
        positiveRate: number;
    }> | null;
};
/**
 * Log a transition decision for analytics
 */
export declare function logTransitionDecision(sessionId: string, input: TransitionInput, result: TransitionResult): void;
export { type EngagementSignals, type TransitionEvent, };
declare const _default: {
    getIntelligentMusicTransition: typeof getIntelligentMusicTransition;
    getMusicTransition: typeof getMusicTransition;
    logTransitionDecision: typeof logTransitionDecision;
    recordTransitionFeedback: typeof recordTransitionFeedback;
    getTransitionAnalyticsDashboard: typeof getTransitionAnalyticsDashboard;
};
export default _default;
//# sourceMappingURL=intelligent-music-transitions.d.ts.map