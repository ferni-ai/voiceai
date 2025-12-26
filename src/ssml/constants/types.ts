/**
 * Pronunciation Types
 * Shared type definitions for pronunciation constants
 *
 * @module ssml/constants/types
 */

/**
 * Entry for pronunciation dictionary
 */
export interface PronunciationEntry {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Replacement text (phonetic representation) */
  replacement: string;
  /** Optional description for documentation */
  description?: string;
}

