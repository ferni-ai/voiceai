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
 * Dev, 2026-10-22 (#2507): the alert's reply was heard, but not as a timer.
 * It ends on Ferni's turn, so its caller turn is "(They haven't said anything
 * since your last words.)" (caller-turn.ts); the fast lane routed on that note
 * and the fast model answered it: "Oh, sorry, I didn't mean to ramble on
 * there". The caller's next turn then cut it (agent_activity.js interrupts the
 * current, queued and paused speeches on a user turn). CALL_ALERT_SPOKEN had
 * been logged before the request was even made.
 * So the speaker keeps the reply's SpeechHandle: CALL_ALERT_SPOKEN is logged
 * once HEARD_AFTER_MS of it has played; a reply cut before that is asked for
 * once more after Ferni answers the caller (MAX_ALERT_ATTEMPTS), and an alert
 * that still isn't heard is logged as CALL_ALERT_DROPPED with the reason.
 * Such a reply ends on Ferni's turn, so it stays on the main model (fast-lane.ts).
 *
 * @module agents/shared/call-alerts
 */

import { voice } from '@livekit/agents';
import type { VoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CallAlerts' });

/** Longest an alert waits for a pause before speaking anyway. */
export const QUIET_WAIT_MS = 20_000;
/** Times an alert's reply is asked for: once, and once more if it was cut before it was heard. */
export const MAX_ALERT_ATTEMPTS = 2;
/** Playout before an alert counts as heard; one cut sooner is asked for again. */
export const HEARD_AFTER_MS = 600;
/** After a cut, how long the retry waits for Ferni's answer to the caller to start. */
export const ANSWER_START_MS = 5000;

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

/**
 * After a caller turn cut the alert: resolves once a reply that starts after now has
 * finished (speaking, then listening), or when none starts within `startMs`, or after
 * `maxMs`. LiveKit runs the turn hooks (~1.4 s on dev) before the answer exists, and
 * both read "listening", so a pause alone would put the retry ahead of the answer.
 */
export async function waitForAnswer(
  session: AlertSession,
  startMs = ANSWER_START_MS,
  maxMs = QUIET_WAIT_MS
): Promise<void> {
  return new Promise((resolve) => {
    let started = session.agentState === 'speaking';
    const onState = (ev: unknown): void => {
      const state = (ev as { newState?: string })?.newState;
      if (state === 'speaking') {
        started = true;
        clearTimeout(noStart);
      } else if (state === 'listening' && started) done();
    };
    const done = (): void => {
      clearTimeout(noStart);
      clearTimeout(cap);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
      resolve();
    };
    const noStart = setTimeout(() => {
      if (!started) done();
    }, startMs);
    const cap = setTimeout(done, maxMs);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
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
 * Ask for the alert's reply and settle once it has played HEARD_AFTER_MS ('played'), or
 * when it ends sooner ('cut'). A reply that finished uninterrupted counts as played.
 */
async function sayOnce(session: AlertSession, cb: VoiceCallback): Promise<Outcome> {
  return new Promise((resolve) => {
    let handle: unknown;
    let heard: ReturnType<typeof setTimeout> | undefined;
    const onState = (ev: unknown): void => {
      if ((ev as { newState?: string })?.newState !== 'speaking' || heard) return;
      if (handle !== undefined && session._activity?.currentSpeech === handle)
        heard = setTimeout(() => settle('played'), HEARD_AFTER_MS);
    };
    const settle = (outcome: Outcome): void => {
      clearTimeout(heard);
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
    answerStartMs?: number;
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
      // A retry waits for the answer to the caller who cut the first one, then a pause.
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      if (attempt > 1) await waitForAnswer(session, opts.answerStartMs, opts.quietWaitMs);
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
        say('CALL_ALERT_RETRY', { ...fields, reason: 'cut_before_heard' });
      else say('CALL_ALERT_DROPPED', { ...fields, reason: 'cut_before_heard' });
    }
  };
}
