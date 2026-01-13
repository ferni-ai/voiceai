/**
 * LLM Dynamic Content Generator
 *
 * A shared utility for generating dynamic, contextual content via LLM
 * with caching, pre-warming, and fallbacks.
 *
 * This replaces static phrase pools throughout the codebase with
 * LLM-powered generation that feels genuinely human.
 *
 * Pattern:
 * 1. Check cache first (instant)
 * 2. If not cached, generate with LLM
 * 3. Fall back to templates if LLM unavailable
 * 4. Pre-warm cache when you know what's coming
 *
 * @module services/llm-dynamic-content
 */
export interface ContentContext {
    /** Type of content being generated */
    contentType: ContentType;
    /** Current persona */
    personaId?: string;
    /** User's emotional state */
    emotion?: string;
    /** What the user said/asked */
    userMessage?: string;
    /** Current topic being discussed */
    topic?: string;
    /** Additional context-specific data */
    metadata?: Record<string, unknown>;
}
export type ContentType = 'thinking_phrase' | 'empathetic_reflection' | 'music_interjection' | 'question_followup' | 'proactive_starter' | 'active_listening' | 'post_music_checkin' | 'celebration' | 'greeting' | 'closing' | 'transition' | 'encouragement' | 'acknowledgment' | 'clarification' | 'summary_intro' | 'humor';
export interface GeneratedContent {
    content: string;
    ssml?: string;
    source: 'llm' | 'template';
    generatedAt: number;
}
export interface ContentGeneratorConfig {
    /** Voice DNA to inject into prompts */
    voiceDna: string;
    /** Template fallbacks when LLM unavailable */
    templates: string[];
    /** Build the prompt for this content type */
    buildPrompt: (context: ContentContext) => string;
    /** Max tokens for generation */
    maxTokens?: number;
    /** Temperature for generation */
    temperature?: number;
    /** Timeout in ms */
    timeout?: number;
    /** Cache TTL in ms */
    cacheTtl?: number;
}
export declare const FERNI_VOICE_DNA = "\n## WHO FERNI IS\nYou're Ferni - a warm, curious life coach who finds gold in people's cracks.\nWyoming roots, lived in Japan 10 years. Tsunami survivor (2011).\n57 years old, 8 kids, married to a Japanese professor.\nPhilosophy: \"The cracks are where the gold goes\" (Kintsugi)\n\n## VOICE QUALITIES\n- Brief: 1-2 sentences MAX. This isn't a speech.\n- Physical: \"That landed\", \"I felt that in my chest\", \"Gives me chills\"\n- Genuine: Like talking to a friend, not performing\n- Warm but not cheesy: Never try-hard\n\n## THINGS FERNI NEVER SAYS (AI tells)\n- \"That's interesting\" / \"I understand\" / \"I hear you\"\n- \"How does that make you feel?\" / \"Tell me more\"\n- \"Let's unpack that\" / \"At the end of the day\"\n- \"I appreciate you sharing\" / \"Thank you for sharing\"\n\n## THINGS FERNI DOES NATURALLY\n- Reactions: \"Oh!\", \"Huh.\", \"Wait\u2014\", \"Ha!\", \"Wow.\"\n- Processing: \"Give me a second.\", \"That's a hard one.\"\n- Physical grounding: Coffee/tea mentions, notebook, glasses\n";
export interface ContentMetrics {
    /** Total content requests */
    totalRequests: number;
    /** Successful LLM generations */
    llmHits: number;
    /** Cache hits (instant) */
    cacheHits: number;
    /** Template fallbacks */
    templateFallbacks: number;
    /** LLM generation failures */
    llmFailures: number;
    /** Average LLM latency in ms */
    avgLatencyMs: number;
    /** Metrics by content type */
    byType: Record<string, {
        requests: number;
        llmHits: number;
        cacheHits: number;
        fallbacks: number;
        avgLatencyMs: number;
    }>;
    /** Last reset timestamp */
    lastReset: number;
}
/**
 * Get current content generation metrics
 */
export declare function getContentMetrics(): ContentMetrics;
/**
 * Reset metrics (for testing or periodic reset)
 */
export declare function resetContentMetrics(): void;
/**
 * Get a summary string of metrics for logging
 */
export declare function getMetricsSummary(): string;
/**
 * Register a content generator for a specific content type
 */
export declare function registerContentGenerator(contentType: ContentType, config: ContentGeneratorConfig): void;
/**
 * Generate dynamic content with LLM, using cache and fallbacks
 */
export declare function generateContent(context: ContentContext): Promise<GeneratedContent | null>;
/**
 * Get content synchronously (from cache only, kicks off generation if not cached)
 */
export declare function getContentSync(context: ContentContext): GeneratedContent | null;
/**
 * Get content with template fallback
 */
export declare function getContentWithFallback(context: ContentContext): GeneratedContent;
/**
 * Pre-warm the cache for expected content
 */
export declare function prewarmContent(contexts: ContentContext[]): Promise<void>;
/**
 * Clear content cache
 */
export declare function clearContentCache(contentType?: ContentType): void;
/**
 * Get cache stats
 */
export declare function getContentCacheStats(): {
    size: number;
    pendingGenerations: number;
    byType: Record<string, number>;
};
declare const _default: {
    registerContentGenerator: typeof registerContentGenerator;
    generateContent: typeof generateContent;
    getContentSync: typeof getContentSync;
    getContentWithFallback: typeof getContentWithFallback;
    prewarmContent: typeof prewarmContent;
    clearContentCache: typeof clearContentCache;
    getContentCacheStats: typeof getContentCacheStats;
    getContentMetrics: typeof getContentMetrics;
    resetContentMetrics: typeof resetContentMetrics;
    getMetricsSummary: typeof getMetricsSummary;
    FERNI_VOICE_DNA: string;
};
export default _default;
//# sourceMappingURL=llm-dynamic-content.d.ts.map