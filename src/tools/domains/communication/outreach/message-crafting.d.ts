/**
 * Message Crafting - LLM-Powered "Better than Human" Personalization
 *
 * This is where the magic happens. Instead of templates, we use the LLM
 * to craft genuinely personal messages based on:
 * - Relationship history (what you've talked about)
 * - Recent context (what's going on in their life)
 * - Appropriate tone for the relationship
 * - The specific purpose/occasion
 *
 * Why "Better than Human":
 * - Perfect memory of every conversation topic
 * - No cognitive load remembering details
 * - Consistent thoughtfulness at scale
 * - Never forgets important dates or follow-ups
 */
import type { OutreachIntent } from './unified-outreach.js';
export interface MessageCraftingContext {
    contactName: string;
    purpose: string;
    intent: OutreachIntent;
    recentTopics: string[];
    daysSinceLastContact: number;
    relationshipStrength: number;
    pendingFollowUp?: string;
    personaId: string;
    channel?: 'text' | 'email' | 'voicemail' | 'call' | 'conversation';
}
export declare function craftPersonalizedMessage(ctx: MessageCraftingContext): Promise<string>;
/**
 * Craft a conversation opener for real-time calls
 * This is what the agent says when the call connects
 */
export declare function craftConversationOpener(ctx: MessageCraftingContext): Promise<string>;
/**
 * Craft a follow-up message referencing a specific topic
 */
export declare function craftFollowUpMessage(ctx: MessageCraftingContext, originalTopic: string): Promise<string>;
/**
 * Craft a "thinking of you" message that feels genuine
 */
export declare function craftThinkingOfYouMessage(ctx: MessageCraftingContext): Promise<string>;
export default craftPersonalizedMessage;
//# sourceMappingURL=message-crafting.d.ts.map