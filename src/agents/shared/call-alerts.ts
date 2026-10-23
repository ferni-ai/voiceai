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
 * The reply it asks for can be cut before a word of it plays (#2507, dev
 * 2026-10-22: CALL_ALERT_SPOKEN, REPLY_RESUME 132 ms on, and no TTS ever
 * carried the timer). Caller audio just after the request pauses the reply at
 * launch, and the caller's committed turn cuts it: agent_activity.js interrupts
 * the queued and paused speeches on a user turn (call-alert-resume.sdk.test.ts
 * reproduces it). CALL_ALERT_SPOKEN was logged before the request, so the log
 * said the timer was announced.
 * So the speaker keeps the reply's SpeechHandle: CALL_ALERT_SPOKEN is logged
 * when its audio starts playing; a reply cut before that is asked for once
 * more at the next pause (MAX_ALERT_ATTEMPTS), and an alert that still isn't
 * heard is logged as CALL_ALERT_DROPPED with the reason.
 *
 * @module agents/shared/call-alerts
 */

import { voice } from '@livekit/agents';
import type { VoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallAlerts' });

/** Longest an alert waits for a pause before speaking anyway. */
export const QUIET_WAIT_MS = 20_000;
/** Times an alert's reply is asked for: once, and once more if it was cut before any audio. */
export const MAX_ALERT_ATTEMPTS = 2;

/** The parts of LiveKit's SpeechHandle the speaker watches. */
export interface AlertSpeech {
  readonly interrupted: boolean;
  addDoneCallback: (fn: () => void) => void;
}

export interface AlertSession {
  readonly agentState: string;
  readonly userState: string;
  on: (event: string, fn: (ev: unknown) => void) => unknown;
  off: (event: string, fn: (ev: unknown) => void) => unknown;
  generateReply: (options: { instructions: string }) => AlertSpeech | unknown;
  /** LiveKit's live activity: its current speech is the one whose audio is playing. */
  readonly _activity?: { readonly currentSpeech?: unknown };
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

const isSpeech = (h: unknown): h is AlertSpeech =>
  typeof (h as AlertSpeech | undefined)?.addDoneCallback === 'function';

type Outcome = 'played' | 'requested' | 'cut' | { failed: string };

/**
 * Ask for the alert's reply and settle when its audio starts playing ('played'), or when
 * it ends without any ('cut'). A reply that finished uninterrupted counts as played.
 */
async function sayOnce(session: AlertSession, cb: VoiceCallback): Promise<Outcome> {
  return new Promise((resolve) => {
    let handle: unknown;
    const onState = (ev: unknown): void => {
      if ((ev as { newState?: string })?.newState !== 'speaking') return;
      if (handle !== undefined && session._activity?.currentSpeech === handle) settle('played');
    };
    const settle = (outcome: Outcome): void => {
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
      resolve(outcome);
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    try {
      handle = session.generateReply({ instructions: alertInstructions(cb) });
    } catch (error) {
      settle({ failed: String(error) });
      return;
    }
    // Not a SpeechHandle (nothing to watch): the request is all we know.
    if (!isSpeech(handle)) {
      settle('requested');
      return;
    }
    const speech = handle;
    speech.addDoneCallback(() => settle(speech.interrupted ? 'cut' : 'played'));
  });
}

export function createCallAlertSpeaker(
  session: AlertSession,
  opts: {
    sessionId?: string;
    quietWaitMs?: number;
    /** CALL_ALERT_SPOKEN / CALL_ALERT_RETRY / CALL_ALERT_DROPPED lines; the module log by default. */
    log?: (msg: string, fields: Record<string, unknown>) => void;
  } = {}
): (cb: VoiceCallback) => Promise<void> {
  const say =
    opts.log ??
    ((msg, fields) =>
      msg === 'CALL_ALERT_DROPPED' ? log.warn(fields, msg) : log.info(fields, msg));
  return async (cb) => {
    for (let attempt = 1; attempt <= MAX_ALERT_ATTEMPTS; attempt++) {
      // A retry waits too: the caller who cut the first one is answered first.
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      await waitUntilQuiet(session, opts.quietWaitMs);
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      const outcome = await sayOnce(session, cb);
      const fields = { sessionId: opts.sessionId, type: cb.type, attempt };
      if (outcome === 'played') return say('CALL_ALERT_SPOKEN', fields);
      if (outcome === 'requested')
        return say('CALL_ALERT_SPOKEN', { ...fields, unconfirmed: true });
      if (outcome !== 'cut') {
        return say('CALL_ALERT_DROPPED', {
          ...fields,
          reason: 'reply_failed',
          error: outcome.failed,
        });
      }
      if (attempt < MAX_ALERT_ATTEMPTS)
        say('CALL_ALERT_RETRY', { ...fields, reason: 'cut_before_audio' });
      else say('CALL_ALERT_DROPPED', { ...fields, reason: 'cut_before_audio' });
    }
  };
}
