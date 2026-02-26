/**
 * Session Manager Utilities
 *
 * Reusable utility functions for session management.
 *
 * @module session-manager/utils
 */

import { getLogger } from '../../utils/safe-logger.js';

/**
 * Execute a promise with a timeout
 * Returns null if the operation times out
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  sessionId?: string
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        // Info level since timeout is expected behavior with graceful fallback
        getLogger().info(
          { sessionId, operation: operationName, timeoutMs },
          'Operation timed out, using fallback'
        );
        resolve(null);
      }, timeoutMs);
    }),
  ]);
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
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length > 0) {
    const topics = userTurns.slice(-3).map((t) => t.content.slice(0, 50).replace(/[.!?]+$/, ''));
    return `Discussed: ${topics.join('; ')}`;
  }

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
