/**
 * IDLE_END_CHECKIN=on (off by default): a multi-agent call that has gone quiet gets one
 * spoken check-in IDLE_CHECKIN_WINDOW_MS before its idle end, instead of a silent hang-up.
 *
 * Prod 2026-11-16: a call ended "Ending session wait (idle)" exactly 10:00 after Ferni's last
 * reply, with nothing said first. The multi-agent path passes no onIdleTimeout to
 * session-state-handler.ts, so its idle check-in never runs there, and quiet presence's
 * (quiet-presence.ts) sits behind LISTEN_FIRST.
 *
 * The check-in is spoken the way quiet presence speaks (speakPresenceCheck), held back by
 * what holds back its check (real silence, silenceResponseBlocked): NIGHT_NOTE late at night
 * for the caller, IDLE_NOTE otherwise. A call with any crisis signal (callHasCrisisSignal) gets
 * no check-in and ends exactly as with the flag off. The timing is session-end-watch.ts's.
 * Each outcome logs IDLE_CHECKIN with the call id and the outcome, never words.
 *
 * @module agents/voice-agent/phases/idle-checkin
 */
import type { voice } from '@livekit/agents';
import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { callerTimeZoneOf, lateNightFor } from '../../personas/listen-first.js';
import { isRealSilence, type SessionStates } from '../dead-air.js';
import { callHasCrisisSignal, NIGHT_NOTE, speakPresenceCheck } from '../quiet-presence.js';
import { silenceResponseBlocked } from '../silence-response-blockers.js';
import type { IdleCheckIn } from './session-end-watch.js';

/** How long before the idle end Ferni checks in, and how long the caller then has to answer. */
const IDLE_CHECKIN_WINDOW_MS = 60_000;

const IDLE_NOTE =
  "[They've been quiet for several minutes. In one short, soft sentence, let them know you're still here if they want to keep talking, or you can pick it up another time. Don't ask if they're still there.]";

const log = createLogger({ module: 'idle-checkin' });

export interface IdleCheckInCall {
  sessionId: string;
  userData: { callerTimezone?: string; lastUserMessage?: string; services?: unknown };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = call.activeSession() as voice.AgentSession<any> | null | undefined;
      if (!session || !isRealSilence(session as unknown as SessionStates)) return false;
      if (silenceResponseBlocked(sessionId, room, callerQuietMs / 1000, userData)) return false;
      const lateNight = lateNightFor(new Date(), callerTimeZoneOf(userData));
      speakPresenceCheck(session, sessionId, lateNight ? NIGHT_NOTE : IDLE_NOTE, {
        context: 'idle-checkin',
        label: 'idle-checkin',
      });
      return true;
    },
    onOutcome: (outcome) => log.info({ sessionId, outcome }, 'IDLE_CHECKIN'),
  };
}
