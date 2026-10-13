/**
 * Tell the caller's app when Ferni's side of the call ends without them.
 *
 * Prod 2026-10-13 (session AJ_tmcyqa2xoKkY): the AgentSession closed on an
 * unrecoverable STT error and the caller's web client sat connected, alone,
 * for 15+ minutes with nothing on screen. When the session closes for a reason
 * that isn't the caller leaving or our own normal close, this publishes
 * `{ type: 'agent_session_ended', reason, recoverable: true }` on the data
 * channel so the app can offer to reconnect. The AgentSession emits `close`
 * before it releases the room, so the message goes out while we are still in it.
 *
 * Never carries internal error text: the payload is built from fixed fields.
 * Off unless SESSION_ENDED_SIGNAL is on.
 *
 * @module agents/multi-agent/session-ended-signal
 */
import { voice } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import { createDataMessageSender, type DataMessageRoom } from '../shared/data-message-envelope.js';

const log = getLogger();

export const SESSION_ENDED_MESSAGE_TYPE = 'agent_session_ended';

export type SessionEndedReason = 'error' | 'shutdown';

/**
 * The reason to send for a session close, or null when the caller needs no
 * notice: they hung up (participant_disconnected) or we closed the session
 * ourselves (user_initiated: goodbye, handoff cleanup, call end).
 */
export function sessionEndedReason(reason: voice.ShutdownReason): SessionEndedReason | null {
  if (reason === voice.CloseReason.ERROR) return 'error';
  if (reason === voice.CloseReason.JOB_SHUTDOWN) return 'shutdown';
  return null;
}

/** The part of an AgentSession this needs. */
export interface ClosableSession {
  on: (event: voice.AgentSessionEventTypes.Close, cb: (ev: voice.CloseEvent) => void) => unknown;
}

/**
 * Publish the session-ended notice when `session` closes unexpectedly.
 * Returns false (and listens to nothing) while the flag is off.
 */
export function registerSessionEndedSignal(
  session: ClosableSession,
  room: DataMessageRoom | undefined,
  sessionId: string,
  env: Env = process.env
): boolean {
  if (!flagOn('SESSION_ENDED_SIGNAL', env)) return false;
  const send = createDataMessageSender(room);
  session.on(voice.AgentSessionEventTypes.Close, (event) => {
    const reason = sessionEndedReason(event.reason);
    if (!reason) return;
    log.info(
      { sessionId, closeReason: event.reason, errorType: event.error?.type },
      'Agent session ended unexpectedly; telling the caller'
    );
    void send(SESSION_ENDED_MESSAGE_TYPE, { reason, recoverable: true, timestamp: Date.now() });
  });
  return true;
}
