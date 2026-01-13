/**
 * Life Chapter Awareness System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understanding major life transitions and phases - knowing when someone
 * is building a career, navigating parenthood, healing from loss,
 * or exploring identity.
 *
 * "It sounds like you're in a real transition right now—leaving behind
 * the person you were at that company and figuring out who you want to become."
 *
 * This is superhuman because it synthesizes patterns across conversations
 * into a coherent narrative understanding of someone's life journey.
 */
export type ChapterType = 'building_career' | 'career_transition' | 'early_relationship' | 'relationship_deepening' | 'relationship_struggle' | 'relationship_ending' | 'early_parenthood' | 'active_parenthood' | 'empty_nest' | 'caregiving' | 'health_journey' | 'healing_journey' | 'identity_exploration' | 'midlife_reflection' | 'retirement_transition' | 'grief_processing' | 'fresh_start' | 'stability_seeking' | 'unknown';
export type TransitionPhase = 'entering' | 'middle' | 'exiting' | 'stable';
export interface ChapterEvidence {
    /** Quote or signal */
    signal: string;
    /** When observed */
    timestamp: Date;
    /** What chapter it points to */
    suggestsChapter: ChapterType;
    /** Strength of signal */
    strength: number;
}
export interface LifeChapter {
    /** Current primary chapter */
    current: {
        chapter: ChapterType;
        subPhase: string;
        durationEstimate: number;
        confidence: number;
    };
    /** Secondary chapters (can be in multiple) */
    secondary: ChapterType[];
    /** Transition state */
    transition: {
        phase: TransitionPhase;
        entering: ChapterType | null;
        leaving: ChapterType | null;
        grief: string[];
        excitement: string[];
        resistance: string[];
    };
    /** What they need in this chapter */
    needs: {
        validation: string[];
        permission: string[];
        guidance: string[];
        witnessing: string[];
    };
}
export interface ChapterProfile {
    userId: string;
    /** Current life chapter assessment */
    chapter: LifeChapter;
    /** Historical evidence */
    evidence: ChapterEvidence[];
    /** Chapter history */
    history: Array<{
        chapter: ChapterType;
        entered: Date;
        exited?: Date;
        keyThemes: string[];
    }>;
    /** Metadata */
    metadata: {
        firstAssessed: Date;
        lastUpdated: Date;
        totalEvidence: number;
        assessmentConfidence: number;
    };
}
/**
 * Get or create chapter profile
 */
export declare function getChapterProfile(userId: string): ChapterProfile;
export interface ChapterAnalysis {
    /** Updated chapter assessment */
    chapter: LifeChapter;
    /** New evidence detected */
    newEvidence: ChapterEvidence[];
    /** Chapter-specific guidance */
    guidance: {
        approach: string;
        validate: string[];
        explore: string[];
        avoid: string[];
    };
    /** Narrative insight */
    narrativeInsight: string | null;
}
/**
 * Analyze for life chapter signals
 */
export declare function analyzeChapter(userId: string, text: string, topics: string[], emotions: string[]): ChapterAnalysis;
/**
 * Format chapter analysis for prompt
 */
export declare function formatChapterForPrompt(analysis: ChapterAnalysis): string;
/**
 * Import a chapter profile into memory (for persistence)
 */
export declare function importChapterProfile(profile: ChapterProfile): void;
/**
 * Reset all life chapter awareness state (for testing)
 */
export declare function resetLifeChapterAwareness(): void;
declare const _default: {
    getChapterProfile: typeof getChapterProfile;
    analyzeChapter: typeof analyzeChapter;
    formatChapterForPrompt: typeof formatChapterForPrompt;
    resetLifeChapterAwareness: typeof resetLifeChapterAwareness;
};
export default _default;
//# sourceMappingURL=life-chapter.d.ts.map