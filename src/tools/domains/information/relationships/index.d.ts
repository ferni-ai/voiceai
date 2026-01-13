/**
 * Relationship Intelligence Tools
 *
 * "Better Than Human" relationship tracking and insights.
 *
 * Features:
 * - Add and manage relationships
 * - Birthday reminders
 * - "Friend's team won!" notifications
 * - "You haven't talked to [person]" reminders
 * - Gift suggestions
 */
import { llm } from '@livekit/agents';
import type { ToolDefinition } from '../../../registry/types.js';
import type { Relationship, RelationshipType, RelationshipInsight, GiftSuggestion } from './types.js';
import { getRelationships, saveRelationship, findRelationshipByName } from './storage.js';
import { getAllRelationshipInsights, getBirthdayInsights, getContactReminderInsights } from './insights.js';
export declare function createRelationshipTools(): {
    addRelationship: llm.FunctionTool<{
        userId: string;
        name: string;
        relationshipType: "friend" | "other" | "spouse" | "partner" | "mentor" | "colleague" | "mentee" | "family_parent" | "family_sibling" | "family_child" | "family_extended" | "friend_close" | "friend_acquaintance";
        nickname?: string | undefined;
        birthdayMonth?: number | undefined;
        birthdayDay?: number | undefined;
        interests?: string[] | undefined;
        favoriteTeams?: string[] | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    getRelationshipInfo: llm.FunctionTool<{
        userId: string;
        name: string;
    }, unknown, string>;
    recordContact: llm.FunctionTool<{
        userId: string;
        name: string;
    }, unknown, string>;
    listRelationships: llm.FunctionTool<{
        userId: string;
        type?: "family" | "all" | "close" | "colleagues" | "friends" | undefined;
    }, unknown, string>;
    getUpcomingBirthdays: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    getContactReminders: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    getGiftSuggestions: llm.FunctionTool<{
        userId: string;
        name: string;
        occasion: string;
        budget?: "moderate" | "premium" | "budget" | undefined;
    }, unknown, string>;
    getRelationshipInsights: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    addInterest: llm.FunctionTool<{
        userId: string;
        name: string;
        interest: string;
    }, unknown, string>;
    addFavoriteTeam: llm.FunctionTool<{
        userId: string;
        name: string;
        team: string;
    }, unknown, string>;
};
/**
 * Get tool definitions for relationship intelligence tools
 */
export declare function getRelationshipToolDefinitions(): ToolDefinition[];
export type { Relationship, RelationshipInsight, GiftSuggestion, RelationshipType };
export { getAllRelationshipInsights, getBirthdayInsights, getContactReminderInsights };
export { getRelationships, findRelationshipByName, saveRelationship };
//# sourceMappingURL=index.d.ts.map