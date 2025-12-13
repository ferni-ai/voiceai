/**
 * TTS Monitoring Module
 *
 * Monitors text-to-speech output for potential issues:
 * - Stage directions that slipped through sanitization
 * - Suspicious patterns that might be spoken literally
 * - Tracks sanitization effectiveness over time
 *
 * @module TTSMonitoring
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// SUSPICIOUS PATTERNS - Things that should NOT be spoken
// ============================================================================

/**
 * Patterns that suggest stage directions slipped through.
 * These should never appear in TTS output.
 */
const SUSPICIOUS_PATTERNS = [
  // Literal action words that shouldn't be spoken
  /\b(laughs?|chuckles?|giggles?|sighs?|smiles?|grins?|nods?|winks?|pauses?|exhales?|inhales?)\b/gi,
  // Stage direction formats
  /\*[^*]+\*/g, // *anything in asterisks*
  /\([^)]*(?:ly|ing)\)/g, // (softly), (nodding), etc.
  /\[[^\]]+\](?!\s*$)/g, // [anything in brackets] not at end (allows [laughter])
  // Tone descriptors as standalone words
  /\b(softly|gently|warmly|tenderly|quietly|playfully|teasingly|knowingly)\b/gi,
  // Voice/manner descriptions
  /\bwith a (warm|soft|gentle|knowing|playful|teasing) (smile|grin|tone|voice)\b/gi,
  // Common LLM stage direction phrases
  /\b(trails off|voice (softens|drops|rises)|clears throat|takes a breath)\b/gi,
];

/**
 * Known safe bracket notations (Cartesia supports these)
 */
const SAFE_BRACKET_PATTERNS = [/\[laughter\]/gi, /\[sigh\]/gi, /\[hmm\]/gi];

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

export interface TTSMonitorResult {
  /** Whether any issues were found */
  hasIssues: boolean;
  /** List of suspicious patterns found */
  issues: string[];
  /** The text that was checked */
  originalText: string;
  /** Suggested fix (if any) */
  suggestedFix?: string;
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
  const issues: string[] = [];

  // Check each suspicious pattern
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      // Filter out safe patterns
      const unsafeMatches = matches.filter((match) => {
        return !SAFE_BRACKET_PATTERNS.some((safe) => safe.test(match));
      });

      if (unsafeMatches.length > 0) {
        issues.push(...unsafeMatches);
      }
    }
  }

  // Check for standalone bracket notation that isn't [laughter]
  const bracketMatches = text.match(/\[[^\]]+\]/g);
  if (bracketMatches) {
    for (const match of bracketMatches) {
      const isSafe = SAFE_BRACKET_PATTERNS.some((safe) => safe.test(match));
      if (!isSafe) {
        issues.push(`Unknown bracket notation: ${match}`);
      }
    }
  }

  // Log warning if issues found
  if (issues.length > 0) {
    log.warn(
      {
        sessionId: context?.sessionId,
        turnNumber: context?.turnNumber,
        personaId: context?.personaId,
        issues,
        textPreview: text.substring(0, 200),
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
function generateSuggestedFix(text: string, issues: string[]): string {
  let fixed = text;

  for (const issue of issues) {
    // Remove the problematic pattern
    fixed = fixed.replace(new RegExp(escapeRegex(issue), 'gi'), '');
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
  lastIssueText?: string;
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
    stats.lastIssueText = result.originalText.substring(0, 100);

    // Count pattern occurrences
    for (const issue of result.issues) {
      const normalizedIssue = issue.toLowerCase();
      stats.patternCounts.set(normalizedIssue, (stats.patternCounts.get(normalizedIssue) || 0) + 1);
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
  lastIssue?: { time: Date; textPreview: string };
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
      ? { time: stats.lastIssueTime, textPreview: stats.lastIssueText || '' }
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
