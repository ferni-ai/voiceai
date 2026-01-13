/**
 * Mirroring and Emotional Echoing
 *
 * Vocabulary mirroring and emotional echo generation.
 *
 * @module conversation/active-listening/mirroring
 */
import type { MirroredPhrase } from './types.js';
/**
 * Generate a mirrored phrase that echoes the user's vocabulary
 */
export declare function mirrorUserVocabulary(userText: string, responseText: string, extractedVocabulary: Set<string>): MirroredPhrase | null;
/**
 * Extract notable words from text (excluding common words)
 */
export declare function extractNotableWords(text: string): string[];
/**
 * Generate an emotional echo phrase
 */
export declare function generateEmotionalEcho(userEmotion: string, userText: string, intensity?: 'low' | 'medium' | 'high'): string;
//# sourceMappingURL=mirroring.d.ts.map