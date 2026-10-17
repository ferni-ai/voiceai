/**
 * Silence after the gentle crisis check-in (CRISIS_IMMINENT_SOFT_CHECK,
 * services/safety/crisis-soft-check.ts): Ferni asked "are you safe right
 * now?" and the caller said nothing. After a quiet spell he asks once more,
 * gently; after a second one he shares 988 and 911 softly rather than staying
 * quiet. Only the caller's words stop this (a final transcript, read as the
 * answer by the reply gate): a cough or the TV starting voice activity only
 * pauses the quiet spell.
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

interface StateEvent {
  newState?: string;
  transcript?: string;
  isFinal?: boolean;
}

interface SessionLike {
  on?: (event: string, fn: (ev: StateEvent) => void) => unknown;
  off?: (event: string, fn: (ev: StateEvent) => void) => unknown;
  say?: (text: string, options?: { allowInterruptions?: boolean }) => unknown;
}

export interface SilenceDeps {
  /** Ask again before the numbers: false when the question was just repeated. */
  repeat?: boolean;
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
  const lines =
    deps.repeat === false ? [CHECK_IN_RESOURCES] : [CHECK_IN_REPEAT, CHECK_IN_RESOURCES];
  let step = 0;
  let timer: unknown = null;
  let stopped = false;
  let ferniQuiet = false;
  let callerQuiet = true;
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
    s.off?.('user_input_transcribed', onWords);
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
  // Each quiet spell counts from when both Ferni and the caller are quiet.
  const arm = (): void => {
    clear();
    if (stopped || !ferniQuiet || !callerQuiet) return;
    if (step >= lines.length) return stop();
    timer = setT(follow, CHECK_IN_QUIET_MS);
  };
  function onAgent(ev: StateEvent): void {
    ferniQuiet = ev?.newState === 'listening';
    arm();
  }
  function onUser(ev: StateEvent): void {
    callerQuiet = ev?.newState !== 'speaking';
    arm();
  }
  function onWords(ev: StateEvent): void {
    if (ev?.isFinal === true && typeof ev.transcript === 'string' && ev.transcript.trim()) stop();
  }
  const cap = setT(stop, MAX_FOLLOW_MS);
  s.on('agent_state_changed', onAgent);
  s.on('user_state_changed', onUser);
  s.on('user_input_transcribed', onWords);
  s.on('close', stop);
  return stop;
}
