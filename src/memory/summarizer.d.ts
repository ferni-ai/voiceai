/**
 * Conversation Summarizer
 *
 * Generates summaries of conversations for long-term memory.
 * Uses LLM for intelligent summarization or falls back to extraction.
 */
import type { ConversationSummary } from '../types/user-profile.js';
/**
 * A single turn in a conversation
 */
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}
/**
 * Options for summarization
 */
export interface SummarizationOptions {
    maxLength?: number;
    includeEmotionalArc?: boolean;
    includeKeyTopics?: boolean;
    generateEmbedding?: boolean;
    /** Use LLM for richer summarization (optional, falls back to extraction) */
    useLLM?: boolean;
    /** LLM call function for summarization */
    llmCall?: (prompt: string) => Promise<string>;
}
/**
 * Generate a conversation summary
 */
export declare function summarizeConversation(sessionId: string, turns: ConversationTurn[], options?: SummarizationOptions): Promise<ConversationSummary>;
/**
 * Generate a summary using LLM for richer understanding
 * Falls back to extraction if LLM fails
 */
export declare function summarizeWithLLM(sessionId: string, turns: ConversationTurn[], llmCall: (prompt: string) => Promise<string>, options?: Omit<SummarizationOptions, 'useLLM' | 'llmCall'>): Promise<ConversationSummary>;
/**
 * Generate a rolling summary (for long conversations)
 */
export declare function generateRollingSummary(turns: ConversationTurn[], previousSummary?: string): Promise<string>;
/**
 * Extract questions that weren't fully answered
 */
export declare function extractOpenQuestions(turns: ConversationTurn[]): string[];
/**
 * Extract follow-up items mentioned in conversation
 */
export declare function extractFollowUpItems(turns: ConversationTurn[]): string[];
declare const _default: {
    summarizeConversation: typeof summarizeConversation;
    generateRollingSummary: typeof generateRollingSummary;
    extractOpenQuestions: typeof extractOpenQuestions;
    extractFollowUpItems: typeof extractFollowUpItems;
};
export default _default;
//# sourceMappingURL=summarizer.d.ts.map