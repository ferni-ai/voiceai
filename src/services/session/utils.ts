/**
 * Session Manager Utilities
 *
 * Reusable utility functions for session management.
 *
 * @module session-manager/utils
 */

import { getLogger } from '../../utils/safe-logger.js';
import { fallbackCallSummary } from '../memory/call-summary-fallback.js';

/**
 * Execute a promise with a timeout
 * Returns null if the operation times out
 *
 * The timer is cleared once the race settles. It used to be left running, so
 * every call that finished in time still logged "Operation timed out, using
 * fallback" ten seconds after it started: the 2026-10-11 07:57Z call's summary
 * succeeded via the LLM in 3.2 s and was then reported as timed out at 10.0 s.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  sessionId?: string
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          // Info level since timeout is expected behavior with graceful fallback
          getLogger().info(
            { sessionId, operation: operationName, timeoutMs },
            'Operation timed out, using fallback'
          );
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wraps a summary LLM caller so the caller can tell afterwards whether the
 * model answered with parseable JSON. summarizeWithLLM falls back to
 * extraction on its own when it did not, and still returns a summary, so the
 * summary alone can't say which source produced it. Mirrors its check: the
 * first-to-last brace span must parse.
 */
export function trackJsonReply(call: (prompt: string) => Promise<string>): {
  call: (prompt: string) => Promise<string>;
  gotJson: () => boolean;
} {
  let gotJson = false;
  return {
    call: async (prompt) => {
      const reply = await call(prompt);
      const match = reply.match(/\{[\s\S]*\}/);
      try {
        gotJson = match !== null && typeof JSON.parse(match[0]) === 'object';
      } catch {
        gotJson = false;
      }
      return reply;
    },
    gotJson: () => gotJson,
  };
}

/**
 * Generate a fallback conversation summary when LLM summarization fails
 */
export function generateFallbackSummary(
  turns: Array<{ role: string; content: string }>,
  topicsDiscussed: string[],
  durationMinutes: number
): string {
  // Try to use topics first
  if (topicsDiscussed.length > 0) {
    const topics = topicsDiscussed.slice(0, 3);
    return `Chatted about ${topics.join(', ')}`;
  }

  // Fall back to extracting from user turns
  const said = fallbackCallSummary(turns, 50); // '' when the caller said only filler
  if (said) return said;

  // Last resort
  if (turns.length > 0) {
    return `Had a ${durationMinutes || 1}-minute conversation`;
  }

  return `Connected on ${new Date().toLocaleDateString()}`;
}

/**
 * Calculate speaking pace category from WPM
 */
export function calculateSpeakingPace(wpm: number): 'slow' | 'moderate' | 'fast' {
  if (wpm < 120) return 'slow';
  if (wpm > 180) return 'fast';
  return 'moderate';
}

/**
 * Calculate blended WPM from session and profile data
 */
export function blendWPM(sessionWPM: number, profileWPM?: number): number {
  if (!profileWPM) return sessionWPM;
  // 70% session, 30% historical
  return Math.round(sessionWPM * 0.7 + profileWPM * 0.3);
}

/**
 * Map speaking pace to WPM estimate
 */
export function paceToWPM(pace: 'slow' | 'moderate' | 'fast'): number {
  const paceToWPMMap = { slow: 110, moderate: 150, fast: 180 };
  return paceToWPMMap[pace];
}

export { trackDeferredProfileLoad } from './deferred-profile.js';
