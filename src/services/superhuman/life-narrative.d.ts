/**
 * Life Narrative Service - Better Than Human Service
 *
 * What no human friend can do: Remember EVERY chapter perfectly.
 *
 * Builds a coherent narrative of the user's life journey across
 * conversations, tracking key events, growth arcs, and identity evolution.
 *
 * @module services/superhuman/life-narrative
 */
export type ChapterType = 'struggle' | 'growth' | 'triumph' | 'transition' | 'loss' | 'discovery' | 'connection' | 'decision';
export type NarrativeArc = 'hero_journey' | 'phoenix_rising' | 'coming_of_age' | 'healing' | 'transformation' | 'in_progress';
export interface LifeChapter {
    id: string;
    userId: string;
    title: string;
    summary: string;
    type: ChapterType;
    startDate: number;
    endDate?: number;
    duration?: string;
    keyQuotes: string[];
    keyPeople: string[];
    keyEmotions: string[];
    keyThemes: string[];
    insightsGained: string[];
    strengthsRevealed: string[];
    patternsIdentified: string[];
    arcRole?: 'beginning' | 'middle' | 'climax' | 'resolution';
    precedingChapterId?: string;
    followingChapterId?: string;
    createdAt: number;
    lastUpdated: number;
    conversationCount: number;
}
export interface IdentityEvolution {
    userId: string;
    coreValues: string[];
    coreStrengths: string[];
    coreFears: string[];
    pastIdentityMarkers: string[];
    currentIdentityMarkers: string[];
    aspirationalIdentityMarkers: string[];
    transformations: Array<{
        from: string;
        to: string;
        when: number;
        evidence: string;
    }>;
    lastUpdated: number;
}
export interface NarrativeContext {
    currentChapter?: LifeChapter;
    recentChapters: LifeChapter[];
    activeArcs: NarrativeArc[];
    identityNow: string[];
    growthEvidence: string[];
    journeyMilestones: string[];
}
export declare function detectChapterMoment(transcript: string): {
    type: ChapterType;
    significance: number;
} | null;
export declare function loadUserChapters(userId: string): Promise<LifeChapter[]>;
export declare function saveChapter(chapter: LifeChapter): Promise<void>;
export declare function createOrUpdateChapter(userId: string, data: {
    type: ChapterType;
    quote: string;
    theme?: string;
    person?: string;
    emotion?: string;
}): Promise<LifeChapter>;
export declare function loadIdentity(userId: string): Promise<IdentityEvolution | null>;
export declare function recordIdentityShift(userId: string, shift: {
    from: string;
    to: string;
    evidence: string;
}): Promise<void>;
export declare function identifyNarrativeArc(chapters: LifeChapter[]): NarrativeArc[];
export declare function buildNarrativeContext(userId: string): Promise<NarrativeContext>;
export declare function buildNarrativeContextString(userId: string): Promise<string>;
export declare const lifeNarrative: {
    detectChapter: typeof detectChapterMoment;
    loadChapters: typeof loadUserChapters;
    createOrUpdateChapter: typeof createOrUpdateChapter;
    loadIdentity: typeof loadIdentity;
    recordIdentityShift: typeof recordIdentityShift;
    identifyArcs: typeof identifyNarrativeArc;
    buildContext: typeof buildNarrativeContext;
    buildContextString: typeof buildNarrativeContextString;
};
//# sourceMappingURL=life-narrative.d.ts.map