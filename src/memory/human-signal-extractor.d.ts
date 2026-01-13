/**
 * Human Signal Extractor
 *
 * Extracts human-centric memory signals from conversations.
 * These patterns are what make someone feel truly known.
 *
 * Used at session end to detect:
 * - Important dates mentioned
 * - Emotional patterns and tells
 * - Values and dreams expressed
 * - Growth moments observed
 * - Topics avoided
 * - Inside joke potential
 *
 * @module HumanSignalExtractor
 */
import type { ImportantDate, InsideJoke, RunningTheme, CoreValue, Dream, Fear, GrowthMarker, ChallengeProgress, RecurringAvoidance, ComfortPattern, StressTrigger, EmotionalTell, HumanMemory } from '../types/human-memory.js';
interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}
interface ExtractionContext {
    userId: string;
    personaId: string;
    userName?: string;
    existingMemory?: Partial<HumanMemory>;
    sessionEmotion?: string;
}
interface ExtractionResult {
    importantDates: ImportantDate[];
    insideJokes: InsideJoke[];
    runningThemes: RunningTheme[];
    values: CoreValue[];
    dreams: Dream[];
    fears: Fear[];
    growthMarkers: GrowthMarker[];
    challenges: ChallengeProgress[];
    avoidances: RecurringAvoidance[];
    comfortPatterns: ComfortPattern[];
    stressTriggers: StressTrigger[];
    emotionalTells: EmotionalTell[];
}
/**
 * Extract all human-centric memory signals from a conversation
 *
 * @param turns - Conversation turns
 * @param context - Extraction context (userId, existing memory, etc.)
 * @returns Extracted signals for each domain
 */
export declare function extractHumanSignals(turns: ConversationTurn[], context: ExtractionContext): ExtractionResult;
/**
 * Merge extracted signals into existing human memory with deduplication
 */
export declare function mergeSignalsIntoMemory(existing: Partial<HumanMemory> | undefined, extracted: ExtractionResult): Partial<HumanMemory>;
declare const _default: {
    extractHumanSignals: typeof extractHumanSignals;
    mergeSignalsIntoMemory: typeof mergeSignalsIntoMemory;
};
export default _default;
//# sourceMappingURL=human-signal-extractor.d.ts.map