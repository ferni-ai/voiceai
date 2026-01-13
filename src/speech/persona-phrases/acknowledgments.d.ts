/**
 * Persona Phrases - Acknowledgments
 *
 * Acknowledgment prefixes for all personas.
 *
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * @module persona-phrases/acknowledgments
 */
import type { AcknowledgmentMood } from './types.js';
/**
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance
 * Kept for backward compatibility, returns empty strings.
 */
export declare const ACKNOWLEDGMENT_PREFIXES: Record<string, Record<AcknowledgmentMood, string[]>>;
/**
 * Get acknowledgment prefix for a persona
 *
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * Returns only a brief pause. The LLM will generate contextually appropriate
 * acknowledgments naturally based on what the user said and the persona's identity.
 */
export declare function getAcknowledgmentPrefix(_personaId: string, _mood?: AcknowledgmentMood): string;
//# sourceMappingURL=acknowledgments.d.ts.map