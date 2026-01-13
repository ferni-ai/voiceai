/**
 * Community Wisdom Service
 *
 * Privacy-safe, pre-written wisdom from aggregate human experiences.
 * NOT real-time aggregation - these are curated insights that feel
 * like "others have been here too."
 *
 * Philosophy: This is comfort through shared humanity, not
 * algorithmic recommendations. "You're not alone" is the message.
 *
 * @module services/personal-journey/community-wisdom
 */
import type { JourneyMoment } from './types.js';
/**
 * Find relevant wisdom based on conversation context
 */
export declare function findRelevantWisdom(text: string, recentTopics?: string[]): JourneyMoment | null;
/**
 * Get a universal pattern insight
 */
export declare function getUniversalInsight(text: string): JourneyMoment | null;
/**
 * Get wisdom about what helps for a specific journey type
 */
export declare function getWhatHelps(journeyType: string): string[];
/**
 * Get common challenges for a journey type
 */
export declare function getCommonChallenges(journeyType: string): string[];
/**
 * Detect journey type from text
 */
export declare function detectJourneyType(text: string): string | null;
/**
 * Get a comfort message for a detected journey
 */
export declare function getComfortMessage(journeyType: string): string | null;
/**
 * Get all available journey types
 */
export declare function getAvailableJourneyTypes(): string[];
//# sourceMappingURL=community-wisdom.d.ts.map