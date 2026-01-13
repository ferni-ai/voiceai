/**
 * LLM Utility Functions
 *
 * Provides supplementary LLM capabilities for:
 * - Emotion inference (when keyword detection is uncertain)
 * - Conversation summarization (richer than extraction)
 * - Intent disambiguation
 * - Context enrichment
 *
 * These are NOT for main conversation - that goes through the realtime model.
 * These are for background analysis that enhances the agent's understanding.
 *
 * Uses Vertex AI (enterprise tier) for higher quotas than consumer Google AI API.
 *
 * @module services/llm-utils
 */
export type LLMProvider = 'vertex' | 'openai' | 'anthropic';
export interface LLMCallOptions {
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
}
/**
 * Make a supplementary LLM call with automatic fallback
 *
 * Priority depends on USE_VERTEX_AI setting:
 * - If USE_VERTEX_AI=true (default): Vertex AI → OpenAI → null
 * - If USE_VERTEX_AI=false: Gemini API (consumer) → OpenAI → null
 *
 * Use this for:
 * - Emotion inference when keyword detection is uncertain
 * - Conversation summarization
 * - Intent disambiguation
 *
 * DO NOT use for main conversation responses (those go through realtime model)
 */
export declare function callLLM(prompt: string, options?: LLMCallOptions): Promise<string | null>;
/**
 * Make an LLM call that expects JSON response
 * Parses the response and returns the object
 */
export declare function callLLMForJSON<T>(prompt: string, options?: LLMCallOptions): Promise<T | null>;
/**
 * Create LLM call function for emotion detection
 * This can be passed to EmotionDetector.detectWithLLM()
 */
export declare function createEmotionLLMCaller(): (prompt: string) => Promise<string>;
/**
 * Create LLM call function for summarization
 * This can be passed to summarizeWithLLM()
 */
export declare function createSummarizationLLMCaller(): (prompt: string) => Promise<string>;
/**
 * Initialize LLM utilities
 * Checks for available clients and initializes them
 */
export declare function initializeLLMUtils(): Promise<{
    vertexAI: boolean;
    openAI: boolean;
}>;
declare const _default: {
    callLLM: typeof callLLM;
    callLLMForJSON: typeof callLLMForJSON;
    createEmotionLLMCaller: typeof createEmotionLLMCaller;
    createSummarizationLLMCaller: typeof createSummarizationLLMCaller;
    initializeLLMUtils: typeof initializeLLMUtils;
};
export default _default;
//# sourceMappingURL=llm-utils.d.ts.map