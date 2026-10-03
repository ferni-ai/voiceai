/**
 * Starts and saves the voice pattern engine for a live session.
 *
 * The engine (voice-pattern-learning.ts) was created only by the legacy
 * session-init path, so on the live multi-agent path every turn's observation
 * was dropped ("No voice pattern engine found for session"). The live path now
 * starts it on the first turn (multi-agent/turn-intelligence.ts).
 *
 * What it learns: the user's turn gap and interruption habit, carried across
 * sessions for identified users. It does not set speech speed: session pace
 * matching (multi-agent/turn-observers.ts) and the Speech Director own speed.
 *
 * VOICE_PATTERN_ENGINE=off restores the old behavior (no engine on the live
 * path, nothing recorded or saved).
 *
 * @module conversation/humanization/voice-pattern-session
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getVoicePatternEngine,
  getVoicePatterns,
  initializeVoicePatterns,
  saveVoicePatterns,
} from './voice-pattern-learning.js';

const log = createLogger({ module: 'VoicePatternSession' });

/** Sessions whose saved patterns failed to load: their save would overwrite real history. */
const unsaveableSessions = new Set<string>();

export function voicePatternEngineEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.VOICE_PATTERN_ENGINE !== 'off';
}

/**
 * Only an identified user's patterns load and save: anonymous callers share
 * ids like "anonymous" or "default", and saving under those would mix every
 * stranger's habits into one record.
 */
export function isIdentifiedUser(userId: string | undefined): userId is string {
  if (!userId) return false;
  if (['anonymous', 'default', 'unknown'].includes(userId)) return false;
  return !userId.startsWith('anon:') && !userId.startsWith('device:');
}

/** Start the session's engine once; an identified user's saved patterns load first. */
export async function startVoicePatterns(
  sessionId: string,
  userId: string | undefined
): Promise<void> {
  if (!voicePatternEngineEnabled() || getVoicePatterns(sessionId) !== null) return;
  if (isIdentifiedUser(userId)) {
    try {
      await initializeVoicePatterns(sessionId, userId);
    } catch (error) {
      // Keep learning this session, but never save it over the record we could not read.
      unsaveableSessions.add(sessionId);
      getVoicePatternEngine(sessionId, userId);
      log.warn(
        { sessionId, error: String(error) },
        'Voice patterns failed to load; this session will not save them'
      );
    }
  } else {
    getVoicePatternEngine(sessionId, userId || 'anonymous');
  }
}

/** Save what this session learned, for identified users only. */
export async function persistSessionVoicePatterns(sessionId: string): Promise<boolean> {
  if (unsaveableSessions.delete(sessionId)) {
    log.warn({ sessionId }, 'Not saving voice patterns: they failed to load at session start');
    return false;
  }
  const patterns = getVoicePatterns(sessionId);
  if (!patterns || !isIdentifiedUser(patterns.userId)) {
    log.debug({ sessionId }, 'No voice patterns to save for this session');
    return false;
  }
  return saveVoicePatterns(patterns);
}
