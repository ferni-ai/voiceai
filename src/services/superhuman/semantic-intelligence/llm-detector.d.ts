/**
 * LLM-Powered Detection for Semantic Intelligence
 *
 * Uses Gemini Flash 2.0 for high-accuracy detection of:
 * - Advice patterns (when regex is uncertain)
 * - Person mentions (NER-like extraction)
 * - Advice outcomes (did user follow advice?)
 *
 * This provides "Better than Human" accuracy by combining:
 * - Fast regex pre-filtering
 * - LLM classification for edge cases
 * - Caching for repeated patterns
 *
 * @module services/superhuman/semantic-intelligence/llm-detector
 */
import type { ExtractedPerson, PersonRelationship } from './person-extractor.js';
export interface LLMAdviceResult {
    containsAdvice: boolean;
    adviceText: string | null;
    category: 'behavioral' | 'emotional' | 'practical' | 'relational' | 'philosophical' | null;
    confidence: number;
}
/**
 * Detect advice using Gemini Flash.
 * Falls back to regex if LLM is unavailable.
 */
export declare function detectAdviceWithLLM(text: string): Promise<LLMAdviceResult>;
export interface LLMPersonResult {
    persons: Array<{
        name: string;
        relationship: PersonRelationship | null;
        isProperName: boolean;
        confidence: number;
    }>;
}
/**
 * Extract persons using Gemini Flash.
 * Provides NER-like extraction with relationship classification.
 */
export declare function extractPersonsWithLLM(text: string): Promise<ExtractedPerson[]>;
export interface LLMOutcomeResult {
    referencesAdvice: boolean;
    outcome: 'followed' | 'ignored' | 'failed' | 'partial' | null;
    sentiment: 'positive' | 'negative' | 'neutral' | null;
    confidence: number;
}
/**
 * Detect if user message references and reports outcome of previous advice.
 */
export declare function detectAdviceOutcomeWithLLM(userMessage: string, previousAdvice: string): Promise<LLMOutcomeResult>;
/**
 * Hybrid advice detection: regex first, LLM for uncertain cases.
 *
 * Strategy:
 * - High regex confidence (>0.7) → use regex result
 * - Low regex confidence (<0.3) → no advice
 * - Middle range (0.3-0.7) → use LLM for classification
 */
export declare function detectAdviceHybrid(text: string): Promise<LLMAdviceResult>;
/**
 * Hybrid person extraction: regex first, LLM to enhance.
 *
 * Strategy:
 * - Always try regex first
 * - If regex finds nothing, try LLM
 * - Merge results if both find something
 */
export declare function extractPersonsHybrid(text: string): Promise<ExtractedPerson[]>;
/**
 * Clear the LLM detector cache.
 */
export declare function clearLLMDetectorCache(): void;
/**
 * Reset the client state (for testing).
 */
export declare function resetLLMDetectorClient(): void;
/**
 * Get cache stats for monitoring.
 */
export declare function getLLMDetectorStats(): {
    cacheSize: number;
    circuitOpen: boolean;
};
//# sourceMappingURL=llm-detector.d.ts.map