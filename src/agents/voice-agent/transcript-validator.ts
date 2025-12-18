/**
 * Intelligent Transcript Validator
 *
 * Filters out phantom transcripts caused by:
 * - Echo from agent's own speech
 * - Background noise transcribed as foreign languages
 * - STT artifacts and noise markers
 *
 * This is smarter than just threshold tuning - it actually understands
 * what valid user speech looks like vs noise/echo artifacts.
 *
 * @module voice-agent/transcript-validator
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TranscriptValidator' });

// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptValidationResult {
  isValid: boolean;
  reason?: 'noise_marker' | 'foreign_chars' | 'too_short' | 'echo_detected' | 'single_char';
  confidence: number;
  transcript: string;
  cleanedTranscript?: string;
}

export interface ValidationContext {
  /** What the agent just said (for echo detection) */
  lastAgentUtterance?: string;
  /** Time since agent stopped speaking (ms) */
  timeSinceAgentSpoke: number;
  /** Expected language (default: 'en') */
  expectedLanguage?: string;
  /** Whether agent is currently speaking */
  isAgentSpeaking: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Window after agent speech where we're extra vigilant about echo */
const ECHO_VIGILANCE_WINDOW_MS = 2500;

/** Minimum transcript length to consider valid during echo window */
const MIN_ECHO_WINDOW_LENGTH = 3;

/** Characters that indicate non-Latin script (likely noise in English mode) */
const NON_LATIN_PATTERNS = {
  chinese: /[\u4e00-\u9fff\u3400-\u4dbf]/,
  thai: /[\u0e00-\u0e7f]/,
  arabic: /[\u0600-\u06ff]/,
  cyrillic: /[\u0400-\u04ff]/,
  japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
  korean: /[\uac00-\ud7af\u1100-\u11ff]/,
  hebrew: /[\u0590-\u05ff]/,
  devanagari: /[\u0900-\u097f]/,
  vietnamese: /[\u1ea0-\u1ef9]/,
  greek: /[\u0370-\u03ff]/,
};

/** Portuguese/Spanish accented words that are commonly mistranscribed from noise */
const LIKELY_NOISE_WORDS = [
  /^n[aã]o\.?$/i, // "Não" - Portuguese for "no"
  /^sim\.?$/i, // "Sim" - Portuguese for "yes"
  /^s[ií]\.?$/i, // "Sí" - Spanish for "yes"
  /^qu[eé]\.?$/i, // "Qué" - Spanish
  /^o[ií]\.?$/i, // Single vowel with accent
  /^[àáâãäåèéêëìíîïòóôõöùúûü]$/i, // Single accented character
];

/** Noise marker patterns that STT systems emit */
const NOISE_PATTERNS = [
  /<noise>/i,
  /\[noise\]/i,
  /\(noise\)/i,
  /<unk>/i,
  /\[inaudible\]/i,
  /<inaudible>/i,
  /^\s*uh+\s*$/i, // Just "uh" or "uhh"
  /^\s*um+\s*$/i, // Just "um" or "umm"
  /^\s*hmm+\s*$/i, // Just "hmm"
  /^\s*ah+\s*$/i, // Just "ah"
];

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate a transcript to determine if it's real user speech or noise/echo
 *
 * @param transcript - The raw transcript from STT
 * @param context - Context about agent state for smarter validation
 * @returns Validation result with reason if invalid
 */
export function validateTranscript(
  transcript: string,
  context: ValidationContext
): TranscriptValidationResult {
  const trimmed = transcript.trim();

  // =========================================================================
  // CHECK 1: Explicit noise markers
  // =========================================================================
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) {
      log.debug('Transcript rejected: noise marker', { transcript: trimmed.slice(0, 30) });
      return {
        isValid: false,
        reason: 'noise_marker',
        confidence: 0.95,
        transcript,
        cleanedTranscript: trimmed.replace(pattern, '').trim(),
      };
    }
  }

  // =========================================================================
  // CHECK 2: Foreign characters / noise words (likely noise in English mode)
  // =========================================================================
  const expectedLang = context.expectedLanguage || 'en';
  if (expectedLang.startsWith('en')) {
    // CHECK 2a: Likely noise words (Portuguese/Spanish mistranscriptions)
    for (const pattern of LIKELY_NOISE_WORDS) {
      if (pattern.test(trimmed)) {
        log.debug('Transcript rejected: likely noise word', {
          transcript: trimmed,
          pattern: pattern.source,
        });
        return {
          isValid: false,
          reason: 'foreign_chars',
          confidence: 0.92,
          transcript,
        };
      }
    }

    // CHECK 2b: Foreign characters
    const foreignCharCount = countForeignCharacters(trimmed);
    const foreignRatio = foreignCharCount / Math.max(trimmed.length, 1);

    // For short transcripts (< 15 chars), ANY foreign character is suspicious
    if (trimmed.length < 15 && foreignCharCount > 0) {
      log.debug('Transcript rejected: foreign characters in short transcript', {
        transcript: trimmed.slice(0, 30),
        foreignCount: foreignCharCount,
        length: trimmed.length,
      });
      return {
        isValid: false,
        reason: 'foreign_chars',
        confidence: 0.88,
        transcript,
      };
    }

    // For longer transcripts, if more than 15% foreign characters, likely noise
    if (foreignRatio > 0.15) {
      log.debug('Transcript rejected: too many foreign characters', {
        transcript: trimmed.slice(0, 30),
        foreignRatio: foreignRatio.toFixed(2),
      });
      return {
        isValid: false,
        reason: 'foreign_chars',
        confidence: 0.85 + foreignRatio * 0.1,
        transcript,
      };
    }
  }

  // =========================================================================
  // CHECK 3: Single character transcripts (almost always noise)
  // =========================================================================
  if (trimmed.length === 1) {
    log.debug('Transcript rejected: single character', { char: trimmed });
    return {
      isValid: false,
      reason: 'single_char',
      confidence: 0.9,
      transcript,
    };
  }

  // =========================================================================
  // CHECK 4: Too short during echo window
  // =========================================================================
  const inEchoWindow = context.timeSinceAgentSpoke < ECHO_VIGILANCE_WINDOW_MS;
  if (inEchoWindow && trimmed.length < MIN_ECHO_WINDOW_LENGTH) {
    log.debug('Transcript rejected: too short during echo window', {
      transcript: trimmed,
      length: trimmed.length,
      timeSinceAgentSpoke: context.timeSinceAgentSpoke,
    });
    return {
      isValid: false,
      reason: 'too_short',
      confidence: 0.75,
      transcript,
    };
  }

  // =========================================================================
  // CHECK 5: Echo detection (transcript matches what agent just said)
  // =========================================================================
  if (context.lastAgentUtterance && inEchoWindow) {
    const similarity = calculateSimilarity(trimmed, context.lastAgentUtterance);
    if (similarity > 0.6) {
      log.debug('Transcript rejected: echo detected', {
        transcript: trimmed.slice(0, 30),
        agentSaid: context.lastAgentUtterance.slice(0, 30),
        similarity: similarity.toFixed(2),
      });
      return {
        isValid: false,
        reason: 'echo_detected',
        confidence: similarity,
        transcript,
      };
    }
  }

  // =========================================================================
  // CHECK 6: Extra scrutiny if agent is currently speaking
  // If we're interrupting, the transcript should be meaningful
  // =========================================================================
  if (context.isAgentSpeaking) {
    // During agent speech, require at least 2 words to interrupt
    const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount < 2) {
      log.debug('Transcript rejected: too few words during agent speech', {
        transcript: trimmed,
        wordCount,
      });
      return {
        isValid: false,
        reason: 'too_short',
        confidence: 0.7,
        transcript,
      };
    }
  }

  // =========================================================================
  // PASSED ALL CHECKS - Valid transcript
  // =========================================================================
  return {
    isValid: true,
    confidence: 1.0,
    transcript,
    cleanedTranscript: trimmed,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count characters that don't belong to Latin script
 */
function countForeignCharacters(text: string): number {
  let count = 0;
  for (const [_lang, pattern] of Object.entries(NON_LATIN_PATTERNS)) {
    const matches = text.match(new RegExp(pattern.source, 'g'));
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

/**
 * Calculate similarity between two strings (for echo detection)
 * Uses a simple word overlap approach - fast and good enough for echo detection
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      overlap++;
    }
  }

  // Jaccard similarity
  const union = new Set([...wordsA, ...wordsB]).size;
  return overlap / union;
}

/**
 * Quick check if transcript looks like noise (for use in hot paths)
 */
export function isLikelyNoise(transcript: string): boolean {
  const trimmed = transcript.trim();

  // Single char
  if (trimmed.length <= 1) return true;

  // Just noise markers
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Likely noise words (Portuguese/Spanish)
  for (const pattern of LIKELY_NOISE_WORDS) {
    if (pattern.test(trimmed)) return true;
  }

  // ANY foreign characters in short transcript = noise
  if (trimmed.length < 15) {
    const foreignCount = countForeignCharacters(trimmed);
    if (foreignCount > 0) return true;
  }

  // Mostly foreign characters in longer transcript
  if (trimmed.length >= 15) {
    const foreignCount = countForeignCharacters(trimmed);
    if (foreignCount > trimmed.length * 0.15) return true;
  }

  return false;
}

/**
 * Strip noise markers from transcript
 */
export function cleanTranscript(transcript: string): string {
  let cleaned = transcript;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(pattern.source, 'gi'), '');
  }
  return cleaned.trim();
}
