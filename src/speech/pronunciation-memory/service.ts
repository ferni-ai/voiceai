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

import { getLogger } from '../../utils/safe-logger.js';
import {
  COMMON_DIFFICULT_NAMES,
  INTRODUCTION_PATTERNS,
  TECHNICAL_TERM_PATTERNS,
} from './constants.js';
import type {
  ExportedPronunciationState,
  PronunciationEntry,
  PronunciationMemoryState,
} from './types.js';

const log = getLogger();

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Pronunciation memory service
 *
 * Integrates with SSML to inject phonetic hints via:
 * - "Sounds-like" replacements (e.g., "Siobhan" → "Shi-vawn")
 * - Context-aware pronunciation selection
 */
export class PronunciationMemoryService {
  private state: PronunciationMemoryState;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      entries: new Map(),
      commonDifficultNames: new Map(Object.entries(COMMON_DIFFICULT_NAMES)),
    };

    log.debug({ sessionId }, '🗣️ Pronunciation memory initialized');
  }

  /**
   * Process user message for name introductions and pronunciation hints
   */
  processUserMessage(message: string): PronunciationEntry | null {
    // Check for introduction patterns
    for (const pattern of INTRODUCTION_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        return this.handleIntroduction(match);
      }
    }

    // Check for pronunciation corrections
    if (message.toLowerCase().includes('pronounced') || message.toLowerCase().includes('say it')) {
      return this.handlePronunciationCorrection(message);
    }

    return null;
  }

  /**
   * Handle a name introduction
   */
  private handleIntroduction(match: RegExpMatchArray): PronunciationEntry | null {
    const name = match[1]?.trim();
    if (!name) return null;

    // Check if this is a difficult name we know
    const lowerName = name.toLowerCase();
    const knownPronunciation = this.state.commonDifficultNames.get(lowerName);

    if (knownPronunciation) {
      const entry: PronunciationEntry = {
        text: name,
        phonetic: knownPronunciation,
        phoneticType: 'sounds_like',
        source: 'phonetic_pattern',
        context: 'name',
        confidence: 0.8,
        learnedAt: new Date(),
        useCount: 0,
      };

      this.state.userName = entry;
      this.state.entries.set(lowerName, entry);

      log.info(
        { name, phonetic: knownPronunciation },
        '🗣️ Applied known pronunciation for difficult name'
      );

      return entry;
    }

    // Store the name even without special pronunciation
    const entry: PronunciationEntry = {
      text: name,
      phonetic: name, // Default: pronounce as written
      phoneticType: 'sounds_like',
      source: 'user_introduction',
      context: 'name',
      confidence: 0.5,
      learnedAt: new Date(),
      useCount: 0,
    };

    this.state.userName = entry;
    this.state.entries.set(lowerName, entry);

    log.debug({ name }, '🗣️ Stored user name (standard pronunciation)');

    return entry;
  }

  /**
   * Handle an explicit pronunciation correction
   */
  private handlePronunciationCorrection(message: string): PronunciationEntry | null {
    // Pattern: "It's pronounced X" or "[Name], pronounced X"
    const correctionMatch = message.match(
      /([A-Z][a-z]+)?\s*(?:it's|its)?\s*pronounced\s+(?:like\s+)?["']?([^"'\n.!?]+)["']?/i
    );

    if (correctionMatch) {
      const name = correctionMatch[1] || this.state.userName?.text;
      const phonetic = correctionMatch[2]?.trim();

      if (name && phonetic) {
        const entry: PronunciationEntry = {
          text: name,
          phonetic,
          phoneticType: 'sounds_like',
          source: 'user_correction',
          context: 'name',
          confidence: 0.95, // High confidence - user explicitly corrected us
          learnedAt: new Date(),
          useCount: 0,
        };

        const lowerName = name.toLowerCase();
        this.state.entries.set(lowerName, entry);

        // If this is the user's name, update it
        if (this.state.userName?.text.toLowerCase() === lowerName) {
          this.state.userName = entry;
        }

        log.info(
          { name, phonetic, source: 'user_correction' },
          '🗣️ Learned pronunciation from user correction!'
        );

        return entry;
      }
    }

    return null;
  }

  /**
   * Learn a pronunciation from context (e.g., technical domain)
   */
  learnFromContext(term: string, phonetic: string, context: string, confidence = 0.7): void {
    const entry: PronunciationEntry = {
      text: term,
      phonetic,
      phoneticType: 'sounds_like',
      source: 'context_inference',
      context,
      confidence,
      learnedAt: new Date(),
      useCount: 0,
    };

    this.state.entries.set(term.toLowerCase(), entry);

    log.debug({ term, phonetic, context }, '🗣️ Learned pronunciation from context');
  }

  /**
   * Get pronunciation for a word
   */
  getPronunciation(word: string): PronunciationEntry | null {
    const lowerWord = word.toLowerCase();

    // Check our learned entries first
    const entry = this.state.entries.get(lowerWord);
    if (entry) {
      entry.useCount++;
      return entry;
    }

    // Check common difficult names
    const commonPronunciation = this.state.commonDifficultNames.get(lowerWord);
    if (commonPronunciation) {
      return {
        text: word,
        phonetic: commonPronunciation,
        phoneticType: 'sounds_like',
        source: 'phonetic_pattern',
        context: 'name',
        confidence: 0.8,
        learnedAt: new Date(),
        useCount: 1,
      };
    }

    return null;
  }

  /**
   * Get the user's name with pronunciation
   */
  getUserName(): PronunciationEntry | null {
    return this.state.userName || null;
  }

  /**
   * Apply pronunciations to text, returning SSML-enhanced version
   */
  applyToText(text: string): string {
    let result = text;

    // Sort entries by length (longest first) to avoid partial replacements
    const sortedEntries = [...this.state.entries.values()].sort(
      (a, b) => b.text.length - a.text.length
    );

    for (const entry of sortedEntries) {
      // Only apply if phonetic is different from text
      if (entry.phonetic.toLowerCase() !== entry.text.toLowerCase()) {
        // Create case-insensitive pattern for the word
        const pattern = new RegExp(`\\b${escapeRegex(entry.text)}\\b`, 'gi');

        // Replace with sounds-like (no SSML phoneme tags - Cartesia doesn't support them)
        result = result.replace(pattern, entry.phonetic);

        entry.useCount++;
      }
    }

    return result;
  }

  /**
   * Generate SSML phoneme tag (for TTS engines that support it)
   * Note: Cartesia doesn't support <phoneme>, so we use sounds-like instead
   */
  generatePhonemeTag(entry: PronunciationEntry): string {
    if (entry.phoneticType === 'ipa') {
      // IPA phoneme tag (for engines that support it)
      return `<phoneme alphabet="ipa" ph="${entry.phonetic}">${entry.text}</phoneme>`;
    }
    // For sounds-like, just return the phonetic version
    return entry.phonetic;
  }

  /**
   * Get all learned pronunciations
   */
  getAllPronunciations(): PronunciationEntry[] {
    return [...this.state.entries.values()];
  }

  /**
   * Export state for persistence
   */
  exportState(): ExportedPronunciationState {
    return {
      userName: this.state.userName,
      entries: [...this.state.entries.entries()],
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: ExportedPronunciationState): void {
    if (state.userName) {
      this.state.userName = state.userName;
    }
    for (const [key, value] of state.entries) {
      this.state.entries.set(key, value);
    }
    log.debug(
      { entryCount: state.entries.length, hasUserName: !!state.userName },
      '🗣️ Imported pronunciation memory state'
    );
  }

  /**
   * Reset the memory
   */
  reset(): void {
    this.state.userName = undefined;
    this.state.entries.clear();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analyze text for words that might need pronunciation help
 */
export function analyzePronunciationNeeds(text: string): string[] {
  const potentialTerms: string[] = [];

  // Check for technical patterns
  for (const pattern of TECHNICAL_TERM_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].length > 2) {
        potentialTerms.push(match[1]);
      }
    }
  }

  // Check for proper nouns (capitalized words not at sentence start)
  const properNounPattern = /(?<=[.!?]\s+\w+\s+)([A-Z][a-z]+)/g;
  const properNouns = text.matchAll(properNounPattern);
  for (const match of properNouns) {
    if (match[1]) {
      potentialTerms.push(match[1]);
    }
  }

  return [...new Set(potentialTerms)];
}
