/**
 * Nayan's Superhuman Wisdom Services
 *
 * "Better Than Human" persistence layer for Nayan's wisdom capabilities.
 * These services provide the superhuman memory that makes Nayan's wisdom transcendent.
 *
 * SERVICES:
 *   1. Paradox Keeper - Track contradictions without resolution
 *   2. Enough Tracker - Remember "enough" declarations
 *   3. Wisdom Incubation - Track things needing time to ripen
 *   4. Wisdom Synthesis - Pattern recognition across wisdom-seeking
 *   5. Legacy Echo - Track stated legacy/meaning goals
 *   6. Cyclical Wisdom - Seasonal/cyclical pattern tracking
 *   7. Life Chapter Narrator - Life as chapters with themes
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/paradoxes
 *   bogle_users/{userId}/enough_statements
 *   bogle_users/{userId}/wisdom_incubation
 *   bogle_users/{userId}/wisdom_patterns
 *   bogle_users/{userId}/legacy_statements
 *   bogle_users/{userId}/cyclical_patterns
 *   bogle_users/{userId}/life_chapters
 */
export interface Paradox {
    desire1: string;
    desire2: string;
    context?: string;
    recordedAt: string;
    status?: 'active' | 'resolved' | 'accepted';
    resolutionNotes?: string;
}
export interface EnoughStatement {
    domain: string;
    statement: string;
    recordedAt: string;
    reachedAt?: string;
    wasItEnough?: boolean;
    notes?: string;
}
export interface IncubatingWisdom {
    question: string;
    suggestedDuration?: string;
    recordedAt: string;
    status: 'incubating' | 'ready' | 'resolved';
    resolvedAt?: string;
    insight?: string;
}
export interface WisdomPattern {
    theme: string;
    occurrences: number;
    contexts: string[];
    firstSeen: string;
    lastSeen: string;
    patternType: 'recurring-question' | 'growth-theme' | 'stuck-point' | 'breakthrough';
    insight?: string;
}
export interface LegacyStatement {
    statement: string;
    domain: string;
    recordedAt: string;
    importance: 'core' | 'significant' | 'emerging';
    context?: string;
}
export interface CyclicalPattern {
    pattern: string;
    cycle: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'annual';
    observations: Array<{
        date: string;
        note: string;
    }>;
    insight?: string;
    firstObserved: string;
    lastObserved: string;
}
export interface LifeChapter {
    title: string;
    theme: string;
    startDate: string;
    endDate?: string;
    status: 'current' | 'completed' | 'emerging';
    keyEvents: string[];
    lessonsLearned: string[];
    nextChapterHints?: string[];
}
export declare function recordParadox(userId: string, paradox: Paradox): Promise<void>;
export declare function getParadoxes(userId: string, status?: 'active' | 'resolved' | 'accepted' | 'all'): Promise<Paradox[]>;
export declare function updateParadoxStatus(userId: string, paradoxId: string, status: 'resolved' | 'accepted', notes?: string): Promise<void>;
export declare function recordEnoughStatement(userId: string, statement: EnoughStatement): Promise<void>;
export declare function getEnoughStatements(userId: string, domain?: string): Promise<EnoughStatement[]>;
export declare function markEnoughReached(userId: string, statementId: string, wasItEnough: boolean, notes?: string): Promise<void>;
export declare function recordIncubatingWisdom(userId: string, item: IncubatingWisdom): Promise<void>;
export declare function getIncubatingWisdom(userId: string, status?: 'incubating' | 'ready' | 'resolved' | 'all'): Promise<IncubatingWisdom[]>;
export declare function markIncubationReady(userId: string, itemId: string, insight?: string): Promise<void>;
export declare function recordWisdomPattern(userId: string, pattern: WisdomPattern): Promise<void>;
export declare function getWisdomPatterns(userId: string, patternType?: WisdomPattern['patternType']): Promise<WisdomPattern[]>;
export declare function recordLegacyStatement(userId: string, statement: LegacyStatement): Promise<void>;
export declare function getLegacyStatements(userId: string, importance?: LegacyStatement['importance']): Promise<LegacyStatement[]>;
export declare function recordCyclicalPattern(userId: string, pattern: Omit<CyclicalPattern, 'firstObserved' | 'lastObserved' | 'observations'>, observation: {
    date: string;
    note: string;
}): Promise<void>;
export declare function getCyclicalPatterns(userId: string, cycle?: CyclicalPattern['cycle']): Promise<CyclicalPattern[]>;
export declare function recordLifeChapter(userId: string, chapter: LifeChapter): Promise<void>;
export declare function getLifeChapters(userId: string, status?: LifeChapter['status']): Promise<LifeChapter[]>;
export declare function updateLifeChapter(userId: string, chapterId: string, updates: Partial<LifeChapter>): Promise<void>;
/**
 * Build comprehensive wisdom context for Nayan
 * This aggregates all wisdom services into a context injection
 */
export declare function buildNayanWisdomContext(userId: string): Promise<string>;
declare const _default: {
    recordParadox: typeof recordParadox;
    getParadoxes: typeof getParadoxes;
    updateParadoxStatus: typeof updateParadoxStatus;
    recordEnoughStatement: typeof recordEnoughStatement;
    getEnoughStatements: typeof getEnoughStatements;
    markEnoughReached: typeof markEnoughReached;
    recordIncubatingWisdom: typeof recordIncubatingWisdom;
    getIncubatingWisdom: typeof getIncubatingWisdom;
    markIncubationReady: typeof markIncubationReady;
    recordWisdomPattern: typeof recordWisdomPattern;
    getWisdomPatterns: typeof getWisdomPatterns;
    recordLegacyStatement: typeof recordLegacyStatement;
    getLegacyStatements: typeof getLegacyStatements;
    recordCyclicalPattern: typeof recordCyclicalPattern;
    getCyclicalPatterns: typeof getCyclicalPatterns;
    recordLifeChapter: typeof recordLifeChapter;
    getLifeChapters: typeof getLifeChapters;
    updateLifeChapter: typeof updateLifeChapter;
    buildNayanWisdomContext: typeof buildNayanWisdomContext;
};
export default _default;
//# sourceMappingURL=nayan-wisdom-services.d.ts.map