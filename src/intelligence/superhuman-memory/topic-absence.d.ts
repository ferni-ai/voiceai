/**
 * Topic Absence Detection
 *
 * Notice what's NOT being said.
 *
 * @module superhuman-memory/topic-absence
 */
import type { HumanMemory } from '../../types/human-memory.js';
import type { TopicAbsenceInsight } from './types.js';
/**
 * Detect topics that have gone quiet
 */
export declare function detectTopicAbsences(humanMemory: Partial<HumanMemory> | undefined, recentTopics: string[], sessionCount: number): TopicAbsenceInsight[];
//# sourceMappingURL=topic-absence.d.ts.map