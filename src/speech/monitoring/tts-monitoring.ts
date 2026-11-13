/**
 * TTS Monitoring Module
 *
 * Monitors text-to-speech output for potential issues:
 * - Stage directions that slipped through sanitization
 * - Suspicious patterns that might be spoken literally
 * - Tracks sanitization effectiveness over time
 *
 * What it records: a match is a piece of Ferni's reply, and replies echo callers' words.
 * On prod (any process not on a non-prod Firestore database) the log line and the stats
 * hold each issue's fixed pattern label and the reply's length, never the matched text or
 * a preview. A dev process records the matched text and a preview, for debugging.
 *
 * @module TTSMonitoring
 */

import { isNonProdDatabase } from '../../config/firestore-database.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// SUSPICIOUS PATTERNS - Things that should NOT be spoken
// ============================================================================

/**
 * One kind of text that should never reach TTS. `label` is what prod logs and counts in
 * place of the match, so it is a fixed string: never build it from the text.
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

/** What a log line or the stats may hold for an issue: its label on prod, its match on dev. */
function recordedIssue(issue: TTSIssue): string {
  return isNonProdDatabase() ? issue.match : issue.label;
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
// ANALYTICS TRACKING
// ============================================================================

interface SanitizationStats {
  totalChecks: number;
  issuesFound: number;
  patternCounts: Map<string, number>;
  lastIssueTime?: Date;
  /** First 100 chars of the last flagged text; set on a dev process only */
  lastIssueText?: string;
  lastIssueLength?: number;
}

const stats: SanitizationStats = {
  totalChecks: 0,
  issuesFound: 0,
  patternCounts: new Map(),
};

/**
 * Track sanitization check for analytics
 */
export function trackTTSCheck(result: TTSMonitorResult): void {
  stats.totalChecks++;

  if (result.hasIssues) {
    stats.issuesFound++;
    stats.lastIssueTime = new Date();
    stats.lastIssueText = isNonProdDatabase() ? result.originalText.substring(0, 100) : undefined;
    stats.lastIssueLength = result.originalText.length;

    // Count pattern occurrences
    for (const issue of result.issues) {
      const counted = recordedIssue(issue).toLowerCase();
      stats.patternCounts.set(counted, (stats.patternCounts.get(counted) ?? 0) + 1);
    }
  }
}

/**
 * Get current sanitization statistics
 */
export function getTTSStats(): {
  totalChecks: number;
  issuesFound: number;
  issueRate: number;
  topPatterns: Array<{ pattern: string; count: number }>;
  /** textPreview is set on a dev process only (no key on prod); textLength is always set. */
  lastIssue?: { time: Date; textLength: number; textPreview?: string };
} {
  const topPatterns = Array.from(stats.patternCounts.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalChecks: stats.totalChecks,
    issuesFound: stats.issuesFound,
    issueRate: stats.totalChecks > 0 ? stats.issuesFound / stats.totalChecks : 0,
    topPatterns,
    lastIssue: stats.lastIssueTime
      ? {
          time: stats.lastIssueTime,
          textLength: stats.lastIssueLength ?? 0,
          ...(stats.lastIssueText !== undefined && { textPreview: stats.lastIssueText }),
        }
      : undefined,
  };
}

/**
 * Reset statistics (for testing)
 */
export function resetTTSStats(): void {
  stats.totalChecks = 0;
  stats.issuesFound = 0;
  stats.patternCounts.clear();
  stats.lastIssueTime = undefined;
  stats.lastIssueText = undefined;
  stats.lastIssueLength = undefined;
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
    trackStats?: boolean;
  } = {}
): { text: string; result: TTSMonitorResult } {
  const result = checkTTSText(text, {
    sessionId: options.sessionId,
    turnNumber: options.turnNumber,
    personaId: options.personaId,
  });

  if (options.trackStats !== false) {
    trackTTSCheck(result);
  }

  // Auto-fix if enabled and issues found
  const finalText =
    options.autoFix && result.hasIssues && result.suggestedFix ? result.suggestedFix : text;

  return { text: finalText, result };
}

export default {
  checkTTSText,
  monitorTTSText,
  getTTSStats,
  resetTTSStats,
  trackTTSCheck,
};
