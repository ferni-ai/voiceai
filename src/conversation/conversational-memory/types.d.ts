/**
 * Conversational Memory Types
 *
 * Type definitions for all conversational memory structures.
 *
 * @module conversation/conversational-memory/types
 */
export interface ConversationThread {
    id: string;
    topic: string;
    startedAtTurn: number;
    lastMentionedTurn: number;
    importance: 'high' | 'medium' | 'low';
    resolved: boolean;
    userInitiated: boolean;
    relatedQuotes: string[];
}
export interface UserStatement {
    text: string;
    turn: number;
    timestamp: number;
    type: 'fact' | 'feeling' | 'question' | 'commitment' | 'notable';
    topic?: string;
    emotion?: string;
    importance: number;
}
export interface MemoryCallback {
    phrase: string;
    ssml: string;
    referenceType: 'earlier_this_convo' | 'returning_topic' | 'commitment' | 'contradiction';
    originalStatement?: UserStatement;
}
export interface ConversationCommitment {
    what: string;
    who: 'user' | 'agent';
    turn: number;
    fulfilled: boolean;
    followedUpAt?: number;
}
/**
 * Hyper-specific quoted memory - the "magic" that makes Ferni feel human
 *
 * These are exact phrases the user said that we can reference back to
 * with specificity that exceeds human memory capability.
 */
export interface QuotedMemory {
    /** The exact phrase quoted (cleaned but verbatim) */
    phrase: string;
    /** When it was said (turn number) */
    turn: number;
    /** Timestamp for calculating "3 weeks ago", etc. */
    timestamp: number;
    /** Context around the quote */
    context: string;
    /** What topic it related to */
    topic?: string;
    /** Emotional weight when said */
    emotionalWeight: 'light' | 'medium' | 'heavy';
    /** User emotion when they said it */
    emotion?: string;
    /** Was this a vulnerable share? */
    wasVulnerable: boolean;
    /** Has this been called back yet this session? */
    usedThisSession: boolean;
}
export interface TopicChange {
    detected: boolean;
    previousTopic?: string;
    newTopic?: string;
    confidence: number;
    transitionPhrase?: string;
}
/**
 * Tuning preferences that can be exported/imported for persistence
 */
export interface ConversationTuningPreferences {
    /** Multiplier for callback probability (0.5 = half, 1.5 = 50% more) */
    callbackMultiplier: number;
    /** Number of callbacks given in this session */
    callbacksGiven: number;
    /** Number of positive reactions to callbacks */
    positiveCallbackReactions: number;
}
/**
 * Context for recording user messages
 */
export interface RecordMessageContext {
    topic?: string;
    emotion?: string;
    isQuestion?: boolean;
    wasPersonal?: boolean;
}
/**
 * Profile contradiction result
 */
export interface ProfileContradiction {
    field: string;
    storedValue: string;
    newClaim: string;
    confidence: number;
}
/**
 * Profile data for contradiction checking
 */
export interface UserProfile {
    preferences?: Record<string, unknown>;
    goals?: Array<{
        name: string;
        type: string;
    }>;
    primaryConcerns?: string[];
    smallDetails?: Array<{
        type: string;
        value: string;
    }>;
    keyMoments?: Array<{
        type: string;
        description: string;
    }>;
}
//# sourceMappingURL=types.d.ts.map