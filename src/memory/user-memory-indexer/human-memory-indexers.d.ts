/**
 * Human Memory Indexers
 *
 * Index human-centric memory data: important dates, inside jokes, running themes,
 * values, dreams, fears, growth markers, challenges, avoidances, temporal patterns,
 * comfort patterns, stress triggers, emotional tells.
 *
 * @module memory/user-memory-indexer/human-memory-indexers
 */
import type { HumanMemory, ImportantDate, InsideJoke, RunningTheme, CoreValue, Dream, Fear, GrowthMarker, ChallengeProgress, RecurringAvoidance, SeasonalPattern, ComfortPattern, StressTrigger, EmotionalTell } from '../../types/human-memory.js';
import { type AnyVectorStore } from './types.js';
/**
 * Index important dates (birthdays, anniversaries, etc.)
 */
export declare function indexImportantDates(userId: string, dates: ImportantDate[], store: AnyVectorStore): Promise<number>;
/**
 * Index inside jokes for relationship texture
 */
export declare function indexInsideJokes(userId: string, jokes: InsideJoke[], store: AnyVectorStore): Promise<number>;
/**
 * Index running themes in conversations
 */
export declare function indexRunningThemes(userId: string, themes: RunningTheme[], store: AnyVectorStore): Promise<number>;
/**
 * Index core values
 */
export declare function indexValues(userId: string, values: CoreValue[], store: AnyVectorStore): Promise<number>;
/**
 * Index dreams and aspirations
 */
export declare function indexDreams(userId: string, dreams: Dream[], store: AnyVectorStore): Promise<number>;
/**
 * Index fears and worries
 */
export declare function indexFears(userId: string, fears: Fear[], store: AnyVectorStore): Promise<number>;
/**
 * Index growth markers ("look how far you've come")
 */
export declare function indexGrowthMarkers(userId: string, markers: GrowthMarker[], store: AnyVectorStore): Promise<number>;
/**
 * Index challenges they're working through
 */
export declare function indexChallenges(userId: string, challenges: ChallengeProgress[], store: AnyVectorStore): Promise<number>;
/**
 * Index recurring avoidances (what they don't want to talk about)
 */
export declare function indexAvoidances(userId: string, avoidances: RecurringAvoidance[], store: AnyVectorStore): Promise<number>;
/**
 * Index seasonal/temporal patterns
 */
export declare function indexTemporalPatterns(userId: string, patterns: SeasonalPattern[], store: AnyVectorStore): Promise<number>;
/**
 * Index comfort patterns (what helps when they're struggling)
 */
export declare function indexComfortPatterns(userId: string, patterns: ComfortPattern[], store: AnyVectorStore): Promise<number>;
/**
 * Index stress triggers
 */
export declare function indexStressTriggers(userId: string, triggers: StressTrigger[], store: AnyVectorStore): Promise<number>;
/**
 * Index emotional tells
 */
export declare function indexEmotionalTells(userId: string, tells: EmotionalTell[], store: AnyVectorStore): Promise<number>;
/**
 * Index complete human memory profile
 */
export declare function indexHumanMemory(userId: string, humanMemory: Partial<HumanMemory>, store: AnyVectorStore): Promise<Record<string, number>>;
//# sourceMappingURL=human-memory-indexers.d.ts.map