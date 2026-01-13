/**
 * Reading Between the Lines
 *
 * Understanding what's NOT being said - the gaps, the deflections,
 * the "I'm fine" that isn't fine.
 *
 * Philosophy: A great friend notices when you're holding back.
 * Not to push, but to create space. "You don't have to talk about it,
 * but I'm here if you want to."
 *
 * This system detects:
 * - Emotional/verbal mismatches ("I'm fine" + heavy topic)
 * - Topic avoidance patterns (consistently steering away)
 * - Deflection behaviors (changing subject, minimizing)
 * - Permission-seeking ("Can I tell you something?")
 * - Unfinished thoughts ("Never mind", trailing off)
 *
 * PERSISTENCE: User emotional profiles are persisted to Firestore.
 *
 * @module ReadingBetweenLines
 */
export interface UnsaidSignal {
    type: 'emotional_mismatch' | 'topic_avoidance' | 'deflection' | 'permission_seeking' | 'unfinished_thought' | 'minimizing_pain' | 'false_closure';
    /** What we detected */
    observation: string;
    /** The topic or emotion being avoided/suppressed */
    underlying: string;
    /** How confident we are (0-1) */
    confidence: number;
    /** Suggested response approach */
    approach: 'create_space' | 'gentle_probe' | 'acknowledge_silently' | 'wait' | 'name_gently';
    /** Optional phrase to use */
    phrase?: string;
    /** Context that led to this detection */
    context: {
        userMessage: string;
        recentTopics?: string[];
        statedEmotion?: string;
        detectedEmotion?: string;
        previousTopic?: string;
    };
}
export interface ConversationPattern {
    topic: string;
    avoidanceCount: number;
    lastAvoided: Date;
    deflectionPhrases: string[];
}
export interface UserUnsaidProfile {
    userId: string;
    /** Topics they consistently avoid */
    avoidedTopics: ConversationPattern[];
    /** Times they said "I'm fine" when they weren't */
    falseFines: Array<{
        timestamp: Date;
        context: string;
        actualEmotion?: string;
    }>;
    /** Unfinished stories that were never completed */
    hangingThreads: Array<{
        topic: string;
        lastMentioned: Date;
        timesStarted: number;
        neverFinished: boolean;
    }>;
    /** Things they seem to want to say but haven't */
    permissionMoments: Array<{
        timestamp: Date;
        leadUp: string;
        didShare: boolean;
    }>;
}
export interface PersistedConversationPattern {
    topic: string;
    avoidanceCount: number;
    lastAvoided: string;
    deflectionPhrases: string[];
}
export interface PersistedUserUnsaidProfile {
    userId: string;
    avoidedTopics: PersistedConversationPattern[];
    falseFines: Array<{
        timestamp: string;
        context: string;
        actualEmotion?: string;
    }>;
    hangingThreads: Array<{
        topic: string;
        lastMentioned: string;
        timesStarted: number;
        neverFinished: boolean;
    }>;
    permissionMoments: Array<{
        timestamp: string;
        leadUp: string;
        didShare: boolean;
    }>;
}
/**
 * Flush persistence
 */
export declare function flushReadingBetweenLinesPersistence(): Promise<void>;
/**
 * Shutdown reading between lines service
 */
export declare function shutdownReadingBetweenLines(): Promise<void>;
/**
 * Detect signals of what's NOT being said
 */
export declare function detectUnsaidSignals(userId: string, userMessage: string, context: {
    recentTopics?: string[];
    statedEmotion?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    topicBeforeThis?: string;
}): UnsaidSignal[];
/**
 * Get a user's unsaid profile for context building
 */
export declare function getUnsaidProfile(userId: string): UserUnsaidProfile | null;
/**
 * Get topics this user consistently avoids
 */
export declare function getAvoidedTopics(userId: string): string[];
/**
 * Check if a topic should be avoided for this user
 */
export declare function shouldAvoidTopic(userId: string, topic: string): boolean;
/**
 * Record that user actually did share after permission-seeking
 */
export declare function recordDidShare(userId: string): void;
/**
 * Export the unsaid profile for persistence.
 */
export declare function exportUnsaidProfile(userId: string): PersistedUserUnsaidProfile | null;
/**
 * Import a persisted unsaid profile into memory.
 * This restores deflection patterns from Firestore on session start.
 */
export declare function importUnsaidProfile(data: PersistedUserUnsaidProfile): void;
/**
 * Record a deflection pattern (called when detectUnsaidSignals finds deflection).
 * This enables tracking across sessions.
 */
export declare function recordDeflectionPattern(userId: string, signal: UnsaidSignal): void;
/**
 * Get deflection statistics for a user (for LLM context).
 */
export declare function getDeflectionStats(userId: string): {
    topics: Array<{
        topic: string;
        count: number;
        lastSeen: Date;
    }>;
    totalDeflections: number;
    mostAvoided: string | null;
};
/**
 * Build deflection awareness context for LLM injection.
 */
export declare function buildDeflectionContext(userId: string): string;
declare const _default: {
    detectUnsaidSignals: typeof detectUnsaidSignals;
    getUnsaidProfile: typeof getUnsaidProfile;
    exportUnsaidProfile: typeof exportUnsaidProfile;
    importUnsaidProfile: typeof importUnsaidProfile;
    getAvoidedTopics: typeof getAvoidedTopics;
    shouldAvoidTopic: typeof shouldAvoidTopic;
    recordDidShare: typeof recordDidShare;
    recordDeflectionPattern: typeof recordDeflectionPattern;
    getDeflectionStats: typeof getDeflectionStats;
    buildDeflectionContext: typeof buildDeflectionContext;
};
export default _default;
//# sourceMappingURL=reading-between-lines.d.ts.map