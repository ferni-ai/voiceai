/**
 * Life Chapter Detector
 *
 * Recognizes and honors the phases/chapters of someone's life.
 * Enables moments like:
 * - "It feels like you're entering a new chapter. I'm here for it."
 * - "This growth chapter has been something, hasn't it?"
 * - "The person I'm talking to now is different from who started this chapter."
 *
 * Philosophy: Life has chapters. Recognizing them helps people
 * see their own story. This is narrative awareness, not diagnosis.
 *
 * @module services/personal-journey/chapter-detector
 */
import type { JourneyMoment, LifeChapters } from './types.js';
/**
 * Get or create chapters for user
 */
export declare function getChapters(userId: string): LifeChapters;
/**
 * Initialize from persisted data
 */
export declare function initializeChapters(userId: string, persistedData?: Partial<LifeChapters>): void;
/**
 * Update chapter detection based on conversation analysis
 *
 * Call this after conversations with:
 * - Recent topics discussed
 * - Recent emotions detected
 * - Any explicit life event mentions
 */
export declare function updateChapterDetection(userId: string, data: {
    recentTopics: string[];
    recentEmotions: string[];
    conversationText?: string;
}): void;
/**
 * Record a challenge in the current chapter
 */
export declare function recordChapterChallenge(userId: string, challenge: string): void;
/**
 * Record growth in the current chapter
 */
export declare function recordChapterGrowth(userId: string, growth: string): void;
/**
 * Get chapter-related journey moments
 */
export declare function getChapterMoments(userId: string): JourneyMoment[];
/**
 * Get chapter context for greetings
 */
export declare function getChapterGreetingContext(userId: string): {
    hasChapterInsight: boolean;
    insight?: string;
    insightType?: 'transition' | 'growth' | 'theme';
};
/**
 * Get current chapter summary for context
 */
export declare function getCurrentChapterSummary(userId: string): {
    hasChapter: boolean;
    theme?: string;
    daysInChapter?: number;
    isInTransition?: boolean;
    transitionType?: string;
};
/**
 * Get data for persistence
 */
export declare function getChaptersForPersistence(userId: string): LifeChapters | null;
/**
 * Clear cache
 */
export declare function clearChapterCache(userId: string): void;
//# sourceMappingURL=chapter-detector.d.ts.map