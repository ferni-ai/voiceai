/**
 * Pronunciation Memory Types
 *
 * @module speech/pronunciation-memory/types
 */

// ============================================================================
// TYPES
// ============================================================================

export type PronunciationSource =
  | 'user_introduction' // User said "I'm Siobhan"
  | 'user_correction' // User corrected us "It's pronounced..."
  | 'context_inference' // Inferred from domain (technical, medical, etc.)
  | 'phonetic_pattern' // Applied linguistic rules
  | 'default'; // Standard pronunciation

export interface PronunciationEntry {
  /** The word/term as written */
  text: string;

  /** Phonetic representation (sounds-like or IPA) */
  phonetic: string;

  /** Type of phonetic representation */
  phoneticType: 'sounds_like' | 'ipa';

  /** How we learned this pronunciation */
  source: PronunciationSource;

  /** Optional context (e.g., "medical", "name", "place") */
  context?: string;

  /** Confidence in this pronunciation (0-1) */
  confidence: number;

  /** When this was learned */
  learnedAt: Date;

  /** Number of times used */
  useCount: number;
}

export interface PronunciationMemoryState {
  /** Session ID */
  sessionId: string;

  /** User's name pronunciation */
  userName?: PronunciationEntry;

  /** Other learned pronunciations */
  entries: Map<string, PronunciationEntry>;

  /** Names that commonly need pronunciation help */
  commonDifficultNames: Map<string, string>;
}

export interface ExportedPronunciationState {
  userName?: PronunciationEntry;
  entries: Array<[string, PronunciationEntry]>;
}
