/**
 * IDLE_END_CHECKIN=on (off by default): a multi-agent call that has gone quiet gets one
 * spoken check-in IDLE_CHECKIN_WINDOW_MS before its idle end, instead of a silent hang-up.
 *
 * Prod 2026-11-16: a call ended "Ending session wait (idle)" exactly 10:00 after Ferni's last
 * reply, with nothing said first. The multi-agent path passes no onIdleTimeout to
 * session-state-handler.ts, so its idle check-in never runs there, and quiet presence's
 * (quiet-presence.ts) sits behind LISTEN_FIRST.
 *
 * The check-in is the idle warning's own line (IDLE_CHECKIN_CUE), held back by what holds back
 * a silence response (real silence, silenceResponseBlocked). A call with any crisis signal
 * (callHasCrisisSignal) gets no check-in and ends exactly as with the flag off. The timing is session-end-watch.ts's.
 * Each outcome logs IDLE_CHECKIN with the call id and the outcome, never words.
 *
 * @module agents/voice-agent/phases/idle-checkin
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { cueSay } from '../../../speech/direction/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { isRealSilence, type SessionStates } from '../dead-air.js';
import { IDLE_CHECKIN_CUE } from '../idle-checkin-cue.js';
import { callHasCrisisSignal } from '../quiet-presence.js';
import { silenceResponseBlocked } from '../silence-response-blockers.js';
import type { IdleCheckIn } from './session-end-watch.js';

/** How long before the idle end Ferni checks in, and how long the caller then has to answer. */
const IDLE_CHECKIN_WINDOW_MS = 60_000;

const log = createLogger({ module: 'idle-checkin' });

export interface IdleCheckInCall {
  sessionId: string;
  userData: { lastUserMessage?: string; services?: unknown };
  room?: { remoteParticipants?: Map<string, unknown> };
  /** The AgentSession of the persona on the call now (a handoff changes it). */
  activeSession: () => unknown;
}

/** The call's idle check-in with IDLE_END_CHECKIN=on, else undefined (the idle end is main's). */
export function idleCheckInFor(
  call: IdleCheckInCall,
  env: Env = process.env
): IdleCheckIn | undefined {
  if (!flagOn('IDLE_END_CHECKIN', env)) return undefined;
  const { sessionId, userData, room } = call;
  return {
    windowMs: IDLE_CHECKIN_WINDOW_MS,
    crisis: () => callHasCrisisSignal(call.activeSession(), sessionId, userData),
    speak: (callerQuietMs) => {
      const session = call.activeSession();
      if (!session || !isRealSilence(session as SessionStates)) return false;
      if (silenceResponseBlocked(sessionId, room, callerQuietMs / 1000, userData)) return false;
      cueSay(sessionId, IDLE_CHECKIN_CUE, { allowInterruptions: true });
      return true;
    },
    onOutcome: (outcome) => log.info({ sessionId, outcome }, 'IDLE_CHECKIN'),
  };
}
