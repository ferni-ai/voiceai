/**
 * Translation & Language Tools
 *
 * Leverage Gemini's native multilingual capabilities for translation,
 * language learning, and cross-cultural communication.
 *
 * BETTER THAN GOOGLE TRANSLATE:
 * - Context-aware translations (formal vs casual)
 * - Pronunciation guidance in natural speech
 * - Cultural notes and usage tips
 * - Learning mode with examples
 *
 * @module simple-utilities/translation-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const SUPPORTED_LANGUAGES: readonly ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch", "Russian", "Japanese", "Chinese (Mandarin)", "Chinese (Cantonese)", "Korean", "Arabic", "Hindi", "Hebrew", "Greek", "Turkish", "Vietnamese", "Thai", "Polish", "Swedish", "Norwegian", "Danish", "Finnish", "Czech", "Hungarian", "Romanian", "Ukrainian", "Indonesian", "Malay", "Tagalog", "Swahili"];
declare const PHRASE_CATEGORIES: {
    greetings: string[];
    travel: string[];
    emergency: string[];
    polite: string[];
    food: string[];
    numbers: string[];
};
declare const translateDef: ToolDefinition;
declare const pronounceDef: ToolDefinition;
declare const learnPhrasesDef: ToolDefinition;
declare const detectLanguageDef: ToolDefinition;
declare const culturalContextDef: ToolDefinition;
export declare const translationToolDefinitions: ToolDefinition[];
export { culturalContextDef, detectLanguageDef, learnPhrasesDef, PHRASE_CATEGORIES, pronounceDef, SUPPORTED_LANGUAGES, translateDef, };
export default translationToolDefinitions;
//# sourceMappingURL=translation-tools.d.ts.map