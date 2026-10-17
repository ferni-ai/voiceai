/**
 * Silence after the gentle crisis check-in (CRISIS_IMMINENT_SOFT_CHECK,
 * services/safety/crisis-soft-check.ts): Ferni asked "are you safe right
 * now?" and the caller said nothing. After a quiet spell he asks once more,
 * gently; after a second one he shares 988 and 911 softly rather than staying
 * quiet. The moment the caller speaks, this stops: their words are read as the
 * answer by the reply gate.
 *
 * @module agents/safety/crisis-check-in-silence
 */

import { CHECK_IN_REPEAT, CHECK_IN_RESOURCES } from '../../services/safety/crisis-soft-check.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisCheckInSilence' });

/** Quiet after Ferni finishes speaking before each follow-up. */
export const CHECK_IN_QUIET_MS = 8_000;
/** The follow-ups never outlive this. */
const MAX_FOLLOW_MS = 120_000;

interface SessionLike {
  on?: (event: string, fn: (ev: { newState?: string }) => void) => unknown;
  off?: (event: string, fn: (ev: { newState?: string }) => void) => unknown;
  say?: (text: string, options?: { allowInterruptions?: boolean }) => unknown;
}

export interface SilenceDeps {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Follow a check-in through silence on this session. Returns a stop function;
 * a no-op when the session cannot listen or speak.
 */
export function followCheckInSilence(session: unknown, deps: SilenceDeps = {}): () => void {
  const s = session as SessionLike;
  if (typeof s?.on !== 'function' || typeof s.off !== 'function' || typeof s.say !== 'function') {
    return () => undefined;
  }
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms).unref());
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const lines = [CHECK_IN_REPEAT, CHECK_IN_RESOURCES];
  let step = 0;
  let timer: unknown = null;
  let stopped = false;
  const clear = (): void => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clear();
    clearT(cap);
    s.off?.('agent_state_changed', onAgent);
    s.off?.('user_state_changed', onUser);
    s.off?.('close', stop);
  };
  const follow = (): void => {
    timer = null;
    const line = lines[step++];
    if (!line) return stop();
    log.info({ step }, 'CRISIS_CHECK_IN_SILENCE');
    try {
      s.say?.(line, { allowInterruptions: true });
    } catch (error) {
      log.warn({ error: String(error) }, 'Check-in follow-up could not be spoken');
      stop();
    }
  };
  // Each quiet spell counts from when Ferni stops speaking.
  function onAgent(ev: { newState?: string }): void {
    clear();
    if (ev?.newState !== 'listening') return;
    if (step >= lines.length) return stop();
    timer = setT(follow, CHECK_IN_QUIET_MS);
  }
  function onUser(ev: { newState?: string }): void {
    if (ev?.newState === 'speaking') stop();
  }
  const cap = setT(stop, MAX_FOLLOW_MS);
  s.on('agent_state_changed', onAgent);
  s.on('user_state_changed', onUser);
  s.on('close', stop);
  return stop;
}
