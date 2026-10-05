/**
 * Speak a callback in the call it belongs to: a timer the caller asked for
 * went off, a countdown milestone, a proactive note (see
 * tools/domains/simple-utilities/voice-callbacks.ts).
 *
 * It waits for a pause (neither side talking, up to QUIET_WAIT_MS) so it
 * doesn't talk over the caller, then lets Ferni say it in its own words. The
 * old handler read canned text ("Timer's up for pasta!") with session.say,
 * whenever the timer fired.
 *
 * @module agents/shared/call-alerts
 */

import { voice } from '@livekit/agents';
import type { VoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallAlerts' });

/** Longest an alert waits for a pause before speaking anyway. */
export const QUIET_WAIT_MS = 20_000;

export interface AlertSession {
  readonly agentState: string;
  readonly userState: string;
  on(event: string, fn: (ev: unknown) => void): unknown;
  off(event: string, fn: (ev: unknown) => void): unknown;
  generateReply(options: { instructions: string }): unknown;
}

const isQuiet = (s: AlertSession): boolean =>
  s.agentState === 'listening' && s.userState !== 'speaking';

/** Resolves once neither side is talking, or after `maxMs`. */
export function waitUntilQuiet(session: AlertSession, maxMs = QUIET_WAIT_MS): Promise<void> {
  if (isQuiet(session)) return Promise.resolve();
  return new Promise((resolve) => {
    const check = (): void => {
      if (!isQuiet(session)) return;
      done();
    };
    const done = (): void => {
      clearTimeout(timer);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, check);
      session.off(voice.AgentSessionEventTypes.UserStateChanged, check);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, check);
    session.on(voice.AgentSessionEventTypes.UserStateChanged, check);
  });
}

/** What Ferni is asked to say for a callback: the facts, not the words. */
export function alertInstructions(cb: VoiceCallback): string {
  const label = typeof cb.context?.label === 'string' ? cb.context.label : '';
  const what =
    cb.type === 'timer_complete'
      ? `The timer the caller asked you to set${label && label !== 'Timer' ? ` (${label})` : ''} just went off.`
      : `Something you told the caller you'd keep track of just happened: ${cb.message}`;
  const follow = cb.followUpQuestion ? ` If it fits, you could ask: "${cb.followUpQuestion}"` : '';
  return `${what} Tell them now, briefly and in your own words, then let them talk.${follow}`;
}

export function createCallAlertSpeaker(
  session: AlertSession,
  opts: { sessionId?: string; quietWaitMs?: number } = {}
): (cb: VoiceCallback) => Promise<void> {
  return async (cb) => {
    await waitUntilQuiet(session, opts.quietWaitMs);
    log.info({ sessionId: opts.sessionId, type: cb.type }, 'CALL_ALERT_SPOKEN');
    try {
      session.generateReply({ instructions: alertInstructions(cb) });
    } catch (error) {
      log.warn({ sessionId: opts.sessionId, error: String(error) }, 'call alert failed');
    }
  };
}
