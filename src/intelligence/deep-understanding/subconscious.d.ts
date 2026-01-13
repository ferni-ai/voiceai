/**
 * Subconscious Goal Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting what users want but haven't articulated - the desires that
 * emerge through patterns across multiple conversations.
 *
 * "You've mentioned wanting more creative work in three different
 * conversations now. I wonder if that's trying to tell you something."
 *
 * This is superhuman because it requires tracking subtle signals across
 * time that even the person themselves may not consciously recognize.
 */
export type GoalCategory = 'career' | 'relationship' | 'self' | 'health' | 'financial' | 'creative' | 'lifestyle' | 'legacy';
export interface EmergingDesire {
    /** Unique identifier */
    id: string;
    /** The inferred goal/desire */
    goal: string;
    /** Category */
    category: GoalCategory;
    /** Evidence from conversations */
    evidence: Array<{
        quote: string;
        timestamp: Date;
        topic: string;
        emotionIntensity: number;
    }>;
    /** Confidence in this inference (0-1) */
    confidence: number;
    /** First detected */
    firstDetected: Date;
    /** Last signal */
    lastSignal: Date;
    /** Signals count */
    signalCount: number;
    /** When/how to surface this */
    surfacing: {
        strategy: 'prompted' | 'when_ready' | 'gently_now' | 'never';
        optimalMoment: string;
        hasBeenSurfaced: boolean;
        surfacedAt?: Date;
        userReaction?: 'resonated' | 'rejected' | 'considered' | 'unknown';
    };
}
export interface Contradiction {
    /** What they state consciously */
    stated: string;
    /** What their signals suggest */
    signaled: string;
    /** The tension between them */
    tension: string;
    /** Evidence */
    evidence: string[];
    /** Confidence */
    confidence: number;
    /** First noticed */
    firstNoticed: Date;
    /** Still active? */
    resolved: boolean;
}
export interface RecurringPattern {
    /** The theme/topic that recurs */
    theme: string;
    /** Times it's come up */
    occurrences: Array<{
        date: Date;
        context: string;
        emotionIntensity: number;
    }>;
    /** What this might indicate */
    possibleMeaning: string;
    /** Frequency (occurrences per conversation) */
    frequency: number;
}
export interface SubconsciousProfile {
    userId: string;
    /** Emerging desires/goals detected */
    emergingDesires: EmergingDesire[];
    /** Contradictions between stated and signaled */
    contradictions: Contradiction[];
    /** Recurring themes */
    recurringThemes: RecurringPattern[];
    /** "What if..." statements */
    fantasies: Array<{
        statement: string;
        timestamp: Date;
        category: GoalCategory;
        emotionIntensity: number;
    }>;
    /** Questions they keep asking */
    unresolvedQuestions: Array<{
        question: string;
        timesAsked: number;
        lastAsked: Date;
        possibleUnderlying: string;
    }>;
    /** Metadata */
    metadata: {
        totalConversations: number;
        lastUpdated: Date;
        confidence: number;
    };
}
/**
 * Get or create subconscious profile
 */
export declare function getSubconsciousProfile(userId: string): SubconsciousProfile;
export interface SubconsciousAnalysis {
    /** New desires detected in this message */
    newDesires: Array<{
        goal: string;
        category: GoalCategory;
        evidence: string;
        confidence: number;
    }>;
    /** Existing desires reinforced */
    reinforcedDesires: EmergingDesire[];
    /** Fantasy/what-if detected */
    fantasyDetected: boolean;
    fantasyContent: string | null;
    /** Contradiction detected */
    contradictionDetected: Contradiction | null;
    /** Should surface an insight? */
    surfaceOpportunity: {
        shouldSurface: boolean;
        desire: EmergingDesire | null;
        phrase: string | null;
    };
}
/**
 * Analyze message for subconscious signals
 */
export declare function analyzeSubconscious(userId: string, text: string, topics: string[], emotionIntensity: number): SubconsciousAnalysis;
/**
 * Record user reaction when we surface an insight
 */
export declare function recordSurfaceReaction(userId: string, desireId: string, reaction: 'resonated' | 'rejected' | 'considered'): void;
/**
 * Format subconscious insights for prompt
 */
export declare function formatSubconsciousForPrompt(userId: string, analysis: SubconsciousAnalysis): string | null;
/**
 * Get summary of subconscious profile
 */
export declare function getSubconsciousSummary(userId: string): string | null;
/**
 * Import a subconscious profile into memory (for persistence)
 */
export declare function importSubconsciousProfile(profile: SubconsciousProfile): void;
/**
 * Reset all subconscious goals state (for testing)
 */
export declare function resetSubconsciousGoals(): void;
declare const _default: {
    getSubconsciousProfile: typeof getSubconsciousProfile;
    analyzeSubconscious: typeof analyzeSubconscious;
    recordSurfaceReaction: typeof recordSurfaceReaction;
    formatSubconsciousForPrompt: typeof formatSubconsciousForPrompt;
    getSubconsciousSummary: typeof getSubconsciousSummary;
    resetSubconsciousGoals: typeof resetSubconsciousGoals;
};
export default _default;
//# sourceMappingURL=subconscious.d.ts.map