/**
 * TTS Monitoring Module
 *
 * Monitors text-to-speech output for potential issues:
 * - Stage directions that slipped through sanitization
 * - Suspicious patterns that might be spoken literally
 *
 * What it records: a match is a piece of Ferni's reply, and replies echo callers' words.
 * Anywhere but dev (any process not on dev's Firestore database, by its exact name) the
 * log line holds each issue's fixed pattern label and the reply's length, never the
 * matched text. A dev process logs the matched text, for debugging.
 *
 * @module TTSMonitoring
 */

import { isKnownDevDatabase } from '../../config/firestore-database.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// SUSPICIOUS PATTERNS - Things that should NOT be spoken
// ============================================================================

/**
 * One kind of text that should never reach TTS. `label` is what prod logs in place of
 * the match, so it is a fixed string: never build it from the text.
 */
interface SuspiciousPattern {
  readonly label: string;
  readonly regex: RegExp;
}

/**
 * Patterns that suggest stage directions slipped through.
 * These should never appear in TTS output.
 */
const SUSPICIOUS_PATTERNS: readonly SuspiciousPattern[] = [
  // Literal action words that shouldn't be spoken (including -ing forms)
  {
    label: 'action word',
    regex:
      /\b(laugh(?:s|ing)?|chuckl(?:es?|ing)|giggl(?:es?|ing)|sigh(?:s|ing)?|smil(?:es?|ing)|grinn?(?:s|ing)?|nodd?(?:s|ing)?|wink(?:s|ing)?|paus(?:es?|ing)|exhal(?:es?|ing)|inhal(?:es?|ing))\b/gi,
  },
  // Stage direction formats
  { label: 'asterisk direction', regex: /\*[^*]+\*/g }, // *anything in asterisks*
  { label: 'parenthetical direction', regex: /\([^)]*(?:ly|ing)\)/g }, // (softly), (nodding), etc.
  { label: 'bracket direction', regex: /\[[^\]]+\](?!\s*$)/g }, // [anything] not at end (allows [laughter])
  // Tone descriptors as standalone words
  {
    label: 'tone adverb',
    regex:
      /\b(softly|gently|warmly|tenderly|quietly|playfully|teasingly|knowingly|sarcastically|wryly|dryly|ironically|mockingly)\b/gi,
  },
  // Tone adjectives that shouldn't be spoken
  { label: 'tone adjective', regex: /\b(sarcastic|wry|ironic|deadpan|mischievous|playful)\b/gi },
  // Voice/manner descriptions
  {
    label: 'manner phrase',
    regex: /\bwith a (warm|soft|gentle|knowing|playful|teasing) (smile|grin|tone|voice)\b/gi,
  },
  // Common LLM stage direction phrases
  {
    label: 'stage phrase',
    regex: /\b(trails off|voice (softens|drops|rises)|clears throat|takes a breath)\b/gi,
  },
];

/** Any bracket notation, anywhere, that Cartesia does not support (see SAFE_BRACKET_PATTERNS). */
const UNKNOWN_BRACKET: SuspiciousPattern = {
  label: 'unknown bracket notation',
  regex: /\[[^\]]+\]/g,
};

/**
 * Known safe bracket notations (Cartesia Sonic-3 supports these)
 * NOTE: No 'g' flag - using .test() with global regex causes lastIndex issues
 *
 * As of 2024, Cartesia only supports [laughter] as a nonverbal sound.
 * [sigh], [cough], etc. are planned for future updates but NOT currently supported.
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 */
const SAFE_BRACKET_PATTERNS = [/\[laughter\]/i];

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

/** One suspicious piece of the text: which pattern found it, and the piece itself. */
interface TTSIssue {
  /** The pattern's fixed label: the only part of an issue prod logs or counts */
  label: string;
  /** The matched text, a piece of the reply: logged and counted on a dev process only */
  match: string;
}

export interface TTSMonitorResult {
  /** Whether any issues were found */
  hasIssues: boolean;
  /** List of suspicious patterns found */
  issues: TTSIssue[];
  /** The text that was checked */
  originalText: string;
  /** Suggested fix (if any) */
  suggestedFix?: string;
}

/** The matches of one pattern in the text, less the bracket notations Cartesia supports. */
function unsafeMatches(text: string, pattern: SuspiciousPattern): string[] {
  return (text.match(pattern.regex) ?? []).filter(
    (match) => !SAFE_BRACKET_PATTERNS.some((safe) => safe.test(match))
  );
}

/** What a log line may hold for an issue: its match on dev, its label anywhere else. */
function recordedIssue(issue: TTSIssue): string {
  return isKnownDevDatabase() ? issue.match : issue.label;
}

/**
 * Check text for suspicious patterns before TTS.
 * Call this after sanitization to catch anything that slipped through.
 *
 * @param text - The text about to be sent to TTS
 * @param context - Optional context for logging (sessionId, turnNumber, etc.)
 * @returns Monitor result with any issues found
 */
export function checkTTSText(
  text: string,
  context?: { sessionId?: string; turnNumber?: number; personaId?: string }
): TTSMonitorResult {
  const issues: TTSIssue[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    for (const match of unsafeMatches(text, pattern)) issues.push({ label: pattern.label, match });
  }

  // Check for standalone bracket notation that isn't [laughter]
  for (const match of unsafeMatches(text, UNKNOWN_BRACKET)) {
    issues.push({ label: UNKNOWN_BRACKET.label, match: `Unknown bracket notation: ${match}` });
  }

  // Log warning if issues found
  if (issues.length > 0) {
    log.warn(
      {
        sessionId: context?.sessionId,
        turnNumber: context?.turnNumber,
        personaId: context?.personaId,
        issues: issues.map(recordedIssue),
        textLen: text.length,
      },
      'TTS text contains suspicious patterns that may be spoken literally'
    );
  }

  return {
    hasIssues: issues.length > 0,
    issues,
    originalText: text,
    suggestedFix: issues.length > 0 ? generateSuggestedFix(text, issues) : undefined,
  };
}

/**
 * Generate a suggested fix for the problematic text
 */
function generateSuggestedFix(text: string, issues: TTSIssue[]): string {
  let fixed = text;

  for (const issue of issues) {
    // Remove the problematic pattern
    fixed = fixed.replace(new RegExp(escapeRegex(issue.match), 'gi'), '');
  }

  // Clean up double spaces
  fixed = fixed.replace(/\s{2,}/g, ' ').trim();

  return fixed;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// WRAPPER FUNCTION FOR EASY INTEGRATION
// ============================================================================

/**
 * Monitor and optionally fix TTS text.
 * Use this as a final safety check before sending text to Cartesia.
 *
 * @param text - Text to check
 * @param options - Monitoring options
 * @returns The text (possibly fixed) and monitoring result
 */
export function monitorTTSText(
  text: string,
  options: {
    sessionId?: string;
    turnNumber?: number;
    personaId?: string;
    autoFix?: boolean;
  } = {}
): { text: string; result: TTSMonitorResult } {
  const result = checkTTSText(text, {
    sessionId: options.sessionId,
    turnNumber: options.turnNumber,
    personaId: options.personaId,
  });

  // Auto-fix if enabled and issues found
  const finalText =
    options.autoFix && result.hasIssues && result.suggestedFix ? result.suggestedFix : text;

  return { text: finalText, result };
}

export default {
  checkTTSText,
  monitorTTSText,
};
