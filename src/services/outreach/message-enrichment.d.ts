/**
 * Message Enrichment Service
 *
 * Transforms brief user requests into warm, natural, "better than human" messages.
 *
 * When a user says "call my mom and say good morning", we don't just pass
 * "say good morning" to the call - we enrich it into what a loving son would
 * actually say: a warm greeting with natural pauses, personal touches, and
 * genuine connection.
 *
 * Philosophy: Every message should feel like it came from someone who truly
 * cares, not a robot executing a template.
 *
 * @module services/outreach/message-enrichment
 */
import type { RelationshipStage } from './persona-voice-generator.js';
export interface EnrichmentContext {
    originalMessage: string;
    relationship: {
        contactName: string;
        relationship: string;
        stage?: RelationshipStage;
    };
    sender: {
        userName: string;
        preferredName?: string;
    };
    context?: {
        recentTopics?: string[];
        recentWins?: string[];
        currentStruggles?: string[];
        upcomingEvents?: string[];
        lastConversationSummary?: string;
        timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
        occasion?: string;
    };
    settings?: {
        isVoicemail: boolean;
        maxLength?: 'short' | 'medium' | 'long';
    };
}
export interface EnrichedMessage {
    message: string;
    ssmlMessage?: string;
    components?: {
        opening: string;
        personalContext?: string;
        mainMessage: string;
        close: string;
    };
    metadata: {
        originalMessage: string;
        enrichedAt: Date;
        enrichmentType: 'llm' | 'template' | 'passthrough';
    };
}
/**
 * Enrich a brief message request into a warm, natural message
 *
 * Strategy:
 * 1. Classify the semantic intent
 * 2. If known intent → use semantic templates (fast, free, consistent)
 * 3. If custom intent → use LLM (slower, but handles edge cases)
 *
 * This gives us the best of both worlds: human warmth at scale.
 */
export declare function enrichMessage(context: EnrichmentContext): Promise<EnrichedMessage>;
/**
 * Enrich specifically for voicemail with component structure
 */
export declare function enrichVoicemailMessage(context: EnrichmentContext): Promise<EnrichedMessage>;
declare const _default: {
    enrichMessage: typeof enrichMessage;
    enrichVoicemailMessage: typeof enrichVoicemailMessage;
};
export default _default;
//# sourceMappingURL=message-enrichment.d.ts.map