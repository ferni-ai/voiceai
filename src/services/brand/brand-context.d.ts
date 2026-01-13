/**
 * Brand Context Loader
 *
 * Loads and merges all brand rules from documentation and tokens
 * into a queryable context for AI systems.
 *
 * @module @ferni/brand/brand-context
 */
import type { BrandContext, BrandVoice, ContextType, ToneConfig, WordReplacement } from './types.js';
/**
 * Load the complete brand context
 */
export declare function loadBrandContext(): Promise<BrandContext>;
/**
 * Clear the brand context cache (for updates)
 */
export declare function clearBrandContextCache(): void;
/**
 * Get brand context for a specific persona
 */
export declare function getBrandContextForPersona(personaId: string): Promise<BrandContext>;
/**
 * Get just the voice rules (lightweight)
 */
export declare function getVoiceRules(): BrandVoice;
/**
 * Get banned phrases for quick checking
 */
export declare function getBannedPhrases(): string[];
/**
 * Get words to avoid for quick checking
 */
export declare function getWordsToAvoid(): WordReplacement[];
/**
 * Get tone config for a context
 */
export declare function getToneConfig(context: ContextType): ToneConfig;
/**
 * Export for client-side validation (minimal payload)
 */
export declare function getClientBrandRules(): {
    bannedPhrases: string[];
    wordsToAvoid: string[];
    wordsToUse: string[];
};
//# sourceMappingURL=brand-context.d.ts.map