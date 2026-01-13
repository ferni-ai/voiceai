/**
 * Growth Reflection System
 *
 * Noticing and reflecting back someone's evolution over time.
 * "A year ago, you would have spiraled. Look at you now."
 *
 * Philosophy: One of the most validating things a friend can do is
 * notice your growth before you see it yourself. This system tracks
 * patterns over time and surfaces moments of meaningful change.
 *
 * This system tracks:
 * - How they respond to similar situations over time
 * - Changes in emotional regulation
 * - Shifts in perspective or values
 * - Progress on stated goals
 * - New coping strategies they've developed
 *
 * @module GrowthReflection
 */
export interface GrowthPattern {
    id: string;
    /** What kind of growth this represents */
    type: 'emotional_regulation' | 'perspective_shift' | 'behavior_change' | 'boundary_setting' | 'self_awareness' | 'coping_upgrade' | 'goal_progress';
    /** Description of the old pattern */
    before: {
        pattern: string;
        examples: string[];
        firstSeen: Date;
    };
    /** Description of the new pattern */
    after: {
        pattern: string;
        examples: string[];
        firstSeen: Date;
    };
    /** How significant is this change */
    significance: 'subtle' | 'notable' | 'transformative';
    /** Confidence that this is real growth (not just a good day) */
    confidence: number;
    /** Number of times new pattern has been observed */
    timesObserved: number;
    /** Whether we've reflected this back to them */
    reflectedBack: boolean;
    /** Their response when we reflected it */
    responseToReflection?: 'resonated' | 'dismissed' | 'surprised' | 'emotional';
}
export interface GrowthProfile {
    userId: string;
    /** Tracked growth patterns */
    patterns: GrowthPattern[];
    /** Historical snapshots of how they handled things */
    historicalResponses: Array<{
        situation: string;
        response: string;
        emotion: string;
        timestamp: Date;
        topic?: string;
    }>;
    /** Stated values and how they've shifted */
    valueEvolution: Array<{
        value: string;
        importance: number;
        firstMentioned: Date;
        lastMentioned: Date;
        trend: 'stable' | 'increasing' | 'decreasing';
    }>;
    /** Coping strategies they've mentioned or demonstrated */
    copingStrategies: Array<{
        strategy: string;
        firstUsed: Date;
        timesUsed: number;
        effectiveness: 'helpful' | 'mixed' | 'unhelpful';
    }>;
}
export interface GrowthReflection {
    pattern: GrowthPattern;
    /** The reflection to share */
    reflection: string;
    /** When to share this (immediately, later, organically) */
    timing: 'now' | 'next_relevant_moment' | 'milestone';
    /** SSML-enhanced version for voice */
    ssml: string;
}
/**
 * Record a response to a situation for historical tracking
 */
export declare function recordResponse(userId: string, situation: string, response: string, emotion: string, topic?: string): void;
/**
 * Generate a reflection to share with the user
 */
export declare function generateGrowthReflection(userId: string, context?: {
    currentTopic?: string;
    currentEmotion?: string;
    situation?: string;
}): GrowthReflection | null;
/**
 * Record that we reflected growth back and how they responded
 */
export declare function recordReflectionResponse(userId: string, patternId: string, response: 'resonated' | 'dismissed' | 'surprised' | 'emotional'): void;
/**
 * Get unreflected growth patterns
 */
export declare function getUnreflectedGrowth(userId: string): GrowthPattern[];
/**
 * Generate a growth reflection with lowered thresholds
 * Use this for special moments like:
 * - First returning session
 * - Time-based milestones (1 month, 3 months, etc.)
 * - When user is discussing a topic where they've grown
 *
 * Philosophy: Sometimes we want to notice growth earlier, especially
 * for returning users who might not have hit the standard thresholds yet.
 */
export declare function generateEarlyGrowthReflection(userId: string, context: {
    reason: 'returning_user' | 'time_milestone' | 'topic_relevant' | 'emotional_moment';
    currentTopic?: string;
    currentEmotion?: string;
}): GrowthReflection | null;
/**
 * Check if this is a good moment to surface growth
 * Returns true if conditions are favorable for a growth reflection
 */
export declare function isGoodMomentForGrowth(userId: string, context: {
    turnCount: number;
    isReturningSession: boolean;
    daysSinceFirstSession?: number;
    currentTopic?: string;
    currentEmotion?: string;
    emotionIntensity?: number;
}): {
    shouldSurface: boolean;
    reason: string;
    useEarlyThreshold: boolean;
};
/**
 * Get a count of unreflected growth patterns at any threshold
 * Useful for session summaries and progress tracking
 */
export declare function getGrowthCount(userId: string): {
    total: number;
    unreflected: number;
    byType: Record<string, number>;
};
/**
 * Get all growth patterns for a user
 */
export declare function getGrowthPatterns(userId: string): GrowthPattern[];
/**
 * Export growth profile for persistence
 */
export declare function exportGrowthProfile(userId: string): GrowthProfile | null;
/**
 * Import growth profile from persistence
 */
export declare function importGrowthProfile(profile: GrowthProfile): void;
declare const _default: {
    recordResponse: typeof recordResponse;
    generateGrowthReflection: typeof generateGrowthReflection;
    recordReflectionResponse: typeof recordReflectionResponse;
    getUnreflectedGrowth: typeof getUnreflectedGrowth;
    getGrowthPatterns: typeof getGrowthPatterns;
    exportGrowthProfile: typeof exportGrowthProfile;
    importGrowthProfile: typeof importGrowthProfile;
};
export default _default;
//# sourceMappingURL=growth-reflection.d.ts.map