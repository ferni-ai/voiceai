/**
 * The crisis pattern read, for a path that stores a turn's words and can run before the turn
 * pipeline reads it (voice-agent/transcript-handler.ts): a match holds the call's memory at once
 * (utils/crisis-memory-hold.ts), so this path's own held check sees it. Synchronous and local.
 *
 * It does not count as the turn's read: the transcript path still waits for the turn pipeline's
 * reads before it captures (crisisTurnSettled), and notes no call risk of its own.
 *
 * @module CrisisPatternHold
 */
import { holdForCrisis } from '../../utils/crisis-memory-hold.js';
import { detectCrisis } from './crisis-guard.js';

/** Hold this call's memory when these caller words match a crisis pattern. Never throws. */
export function holdOnCrisisPattern(sessionId: string | undefined, words: string): boolean {
  if (!sessionId || !words.trim()) return false;
  try {
    if (!detectCrisis(words).isCrisis) return false;
  } catch {
    // A read that fails holds, as a classifier read that fails does (crisis-call-risk.ts).
  }
  holdForCrisis(sessionId);
  return true;
}
