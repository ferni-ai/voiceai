/**
 * Relationship Intelligence - Insights Generator
 *
 * "Better Than Human" features:
 * - Birthday reminders that don't get forgotten
 * - "Your friend's team won!" notifications
 * - "You haven't talked to [person] in a while" gentle nudges
 * - Gift suggestions based on known interests
 */
import type { Relationship, RelationshipInsight, GiftSuggestion, RelationshipTeamUpdate } from './types.js';
/**
 * Generate birthday-related insights for a user
 */
export declare function getBirthdayInsights(userId: string): Promise<RelationshipInsight[]>;
/**
 * Generate insights when a friend's team has played
 */
export declare function getTeamInsights(userId: string, teamUpdates: RelationshipTeamUpdate[]): Promise<RelationshipInsight[]>;
/**
 * Check if any friends have teams that just played
 * Uses real ESPN API data via getTeamScore
 */
export declare function checkFriendsTeamResults(userId: string): Promise<RelationshipInsight[]>;
/**
 * Generate "you haven't talked to..." insights
 */
export declare function getContactReminderInsights(userId: string): Promise<RelationshipInsight[]>;
/**
 * Generate gift suggestions for a person
 */
export declare function generateGiftSuggestions(relationship: Relationship, occasion: string, budget?: 'budget' | 'moderate' | 'premium'): GiftSuggestion[];
/**
 * Generate gift suggestion insight
 */
export declare function getGiftSuggestionInsight(userId: string, relationshipId: string, occasion: string): Promise<RelationshipInsight | null>;
/**
 * Get all relationship insights for a user
 */
export declare function getAllRelationshipInsights(userId: string): Promise<RelationshipInsight[]>;
/**
 * Get the most important relationship insight
 */
export declare function getTopRelationshipInsight(userId: string): Promise<RelationshipInsight | null>;
//# sourceMappingURL=insights.d.ts.map