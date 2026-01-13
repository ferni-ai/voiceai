/**
 * Pronunciation Memory Service
 *
 * Captures and maintains consistent pronunciation of:
 * - User names (from introductions)
 * - Technical terms (domain-specific vocabulary)
 * - Proper nouns (places, companies, people)
 *
 * @module speech/pronunciation-memory/service
 */
import type { ExportedPronunciationState, PronunciationEntry } from './types.js';
/**
 * Pronunciation memory service
 *
 * Integrates with SSML to inject phonetic hints via:
 * - "Sounds-like" replacements (e.g., "Siobhan" → "Shi-vawn")
 * - Context-aware pronunciation selection
 */
export declare class PronunciationMemoryService {
    private state;
    constructor(sessionId: string);
    /**
     * Process user message for name introductions and pronunciation hints
     */
    processUserMessage(message: string): PronunciationEntry | null;
    /**
     * Handle a name introduction
     */
    private handleIntroduction;
    /**
     * Handle an explicit pronunciation correction
     */
    private handlePronunciationCorrection;
    /**
     * Learn a pronunciation from context (e.g., technical domain)
     */
    learnFromContext(term: string, phonetic: string, context: string, confidence?: number): void;
    /**
     * Get pronunciation for a word
     */
    getPronunciation(word: string): PronunciationEntry | null;
    /**
     * Get the user's name with pronunciation
     */
    getUserName(): PronunciationEntry | null;
    /**
     * Apply pronunciations to text, returning SSML-enhanced version
     */
    applyToText(text: string): string;
    /**
     * Generate SSML phoneme tag (for TTS engines that support it)
     * Note: Cartesia doesn't support <phoneme>, so we use sounds-like instead
     */
    generatePhonemeTag(entry: PronunciationEntry): string;
    /**
     * Get all learned pronunciations
     */
    getAllPronunciations(): PronunciationEntry[];
    /**
     * Export state for persistence
     */
    exportState(): ExportedPronunciationState;
    /**
     * Import state from persistence
     */
    importState(state: ExportedPronunciationState): void;
    /**
     * Reset the memory
     */
    reset(): void;
}
/**
 * Analyze text for words that might need pronunciation help
 */
export declare function analyzePronunciationNeeds(text: string): string[];
//# sourceMappingURL=service.d.ts.map