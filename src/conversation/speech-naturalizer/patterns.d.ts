/**
 * Speech Naturalizer Patterns
 *
 * Persona-specific disfluency patterns and templates.
 *
 * @module @ferni/conversation/speech-naturalizer/patterns
 */
import type { DisfluencyPatterns } from './types.js';
/**
 * Persona-specific disfluency patterns
 */
export declare const PERSONA_DISFLUENCIES: Record<string, DisfluencyPatterns>;
/**
 * Default patterns for unknown personas
 */
export declare const DEFAULT_DISFLUENCIES: DisfluencyPatterns;
/**
 * Type-specific thinking patterns
 */
export declare const TYPE_SPECIFIC_THINKING: Record<'processing' | 'recalling' | 'considering' | 'uncertain', string[]>;
/**
 * Hedges by strength level
 */
export declare const HEDGES_BY_STRENGTH: {
    soft: string[];
    medium: string[];
    strong: string[];
};
/**
 * Get patterns for a persona
 */
export declare function getPatternsForPersona(personaId: string): DisfluencyPatterns;
//# sourceMappingURL=patterns.d.ts.map