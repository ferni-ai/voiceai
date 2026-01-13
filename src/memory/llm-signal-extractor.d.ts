/**
 * LLM-Powered Signal Extraction
 *
 * Uses LLM for nuanced extraction of human-centric memory signals.
 * Falls back to regex patterns when LLM is unavailable.
 *
 * Philosophy: Human communication is nuanced. "My birthday's coming up next month"
 * and "I turn 30 on the 15th" both express the same thing, but regex patterns
 * miss these variations. LLM understands meaning, not just patterns.
 *
 * @module memory/llm-signal-extractor
 */
import type { HumanSignalExtractor, ConversationTurn, ExtractionContext, ExtractedSignals } from './interfaces/index.js';
import type { HumanMemory } from '../types/human-memory.js';
type LLMCallFn = (prompt: string) => Promise<string>;
interface ExtractionConfig {
    /** Use LLM for extraction (falls back to regex if false or LLM fails) */
    useLLM: boolean;
    /** Maximum transcript length before truncation */
    maxTranscriptLength: number;
    /** LLM call function */
    llmCall?: LLMCallFn;
}
export declare class LLMSignalExtractor implements HumanSignalExtractor {
    private config;
    constructor(config?: Partial<ExtractionConfig>);
    /**
     * Set the LLM call function
     */
    setLLMCall(llmCall: LLMCallFn): void;
    /**
     * Extract signals from conversation using LLM (with regex fallback)
     */
    extractSignals(turns: ConversationTurn[], context: ExtractionContext): Promise<ExtractedSignals>;
    /**
     * Merge extracted signals with existing memory
     */
    mergeWithExisting(existing: Partial<HumanMemory>, extracted: ExtractedSignals): Partial<HumanMemory>;
    private llmExtraction;
    private regexFallback;
    /**
     * Validate extracted dates
     */
    private validateDates;
    /**
     * Convert to legacy format for mergeSignalsIntoMemory
     */
    private convertToLegacyFormat;
}
export declare function getLLMSignalExtractor(): LLMSignalExtractor;
export declare function resetLLMSignalExtractor(): void;
/**
 * Configure the global LLM signal extractor with an LLM call function
 */
export declare function configureLLMSignalExtractor(llmCall: LLMCallFn): void;
declare const _default: {
    LLMSignalExtractor: typeof LLMSignalExtractor;
    getLLMSignalExtractor: typeof getLLMSignalExtractor;
    resetLLMSignalExtractor: typeof resetLLMSignalExtractor;
    configureLLMSignalExtractor: typeof configureLLMSignalExtractor;
};
export default _default;
//# sourceMappingURL=llm-signal-extractor.d.ts.map