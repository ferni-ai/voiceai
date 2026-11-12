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
 * Heard means HEARD_AFTER_MS of playout: a pause for the caller's voice stops
 * the count, and so does a soft pause (BARGE_IN_SOFT_PAUSE, playout-hold.ts).
 * Each attempt also waits LiveKit's endpointing delay after the caller last stopped (watched for the whole call, so the first attempt knows
 * it too), so a turn of theirs still to be committed can't cut it, and a call
 * that ends meanwhile drops it (call_ended) without asking for it. A reply
 * that neither plays nor ends within REPLY_WAIT_MS is dropped (reply_timeout);
 * if it is heard later after all, onSpoken still runs (CALL_ALERT_SPOKEN late),
 * so a live call report the owner heard isn't told again at the next opener.
 * An alert's reply ends on Ferni's turn, so it stays on the main model (fast-lane.ts).
 *
 * @module agents/shared/call-alerts
 */

import { voice } from '@livekit/agents';
import type { VoiceCallback } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { createLogger } from '../../utils/safe-logger.js';
import { onPlayoutHeldChange, playoutHeld } from './playout-hold.js';

const log = createLogger({ module: 'CallAlerts' });

/** Longest an alert waits for a pause before speaking anyway. */
export const QUIET_WAIT_MS = 20_000;
/** Times an alert's reply is asked for: once, and once more if it was cut before it was heard. */
export const MAX_ALERT_ATTEMPTS = 2;
/** Playout before an alert counts as heard; one cut sooner is asked for again. */
export const HEARD_AFTER_MS = 600;
/** After a cut, how long the retry waits for Ferni's answer to the caller to start. */
export const ANSWER_START_MS = 5000;
/** Longest an attempt waits for its reply to be heard or to end. */
export const REPLY_WAIT_MS = 30_000;
/** After a reply_timeout drop, how long the reply is still watched in case it plays. */
const LATE_PLAY_WAIT_MS = 120_000;

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
  /** LiveKit's live activity: its current speech is the one playing; its endpointing delays. */
  readonly _activity?: {
    readonly currentSpeech?: unknown;
    readonly endpointingOpts?: { readonly maxDelay?: number };
  };
  /** Aborted when the call starts to close, and stays aborted. */
  readonly _closingSignal?: AbortSignal;
}

const isQuiet = (s: AlertSession): boolean =>
  s.agentState === 'listening' && s.userState !== 'speaking';
const callEnded = (s: AlertSession): boolean => s._closingSignal?.aborted === true;
const newState = (ev: unknown): string | undefined => (ev as { newState?: string })?.newState;

/**
 * The longest LiveKit may take to commit a caller's turn after they stop: its
 * resolved endpointing maxDelay for this call (0 when unknown).
 */
const commitDelayMs = (s: AlertSession): number => s._activity?.endpointingOpts?.maxDelay ?? 0;

/**
 * Resolves once neither side is talking and the caller stopped at least `settleMs`
 * before (`callerStoppedAt()`), so a turn of theirs still to be committed has been;
 * or after `maxMs`, or when the call ends.
 */
export async function waitUntilQuiet(
  session: AlertSession,
  maxMs = QUIET_WAIT_MS,
  settleMs = 0,
  callerStoppedAt: () => number = () => -Infinity
): Promise<void> {
  const left = (): number => settleMs - (Date.now() - callerStoppedAt());
  if (callEnded(session) || (isQuiet(session) && left() <= 0)) return;
  return new Promise((resolve) => {
    let recheck: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      clearTimeout(recheck);
      if (!isQuiet(session)) return;
      if (left() <= 0) done();
      else recheck = setTimeout(check, left());
    };
    const done = (): void => {
      clearTimeout(timer);
      clearTimeout(recheck);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, check);
      session.off(voice.AgentSessionEventTypes.UserStateChanged, check);
      session._closingSignal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, check);
    session.on(voice.AgentSessionEventTypes.UserStateChanged, check);
    session._closingSignal?.addEventListener('abort', done);
    check();
  });
}

/**
 * After a caller turn cut the alert: resolves once a reply that starts after now has
 * finished (speaking, then listening), or when none starts within `startMs`, or after
 * `maxMs`, or when the call ends. LiveKit runs the turn hooks (~1.4 s on dev) before
 * the answer exists, and both read "listening", so a pause alone would put the retry
 * ahead of the answer.
 */
export async function waitForAnswer(
  session: AlertSession,
  startMs = ANSWER_START_MS,
  maxMs = QUIET_WAIT_MS
): Promise<void> {
  if (callEnded(session)) return;
  return new Promise((resolve) => {
    let started = session.agentState === 'speaking';
    const onState = (ev: unknown): void => {
      const state = newState(ev);
      if (state === 'speaking') {
        started = true;
        clearTimeout(noStart);
      } else if (state === 'listening' && started) done();
    };
    const done = (): void => {
      clearTimeout(noStart);
      clearTimeout(cap);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
      session._closingSignal?.removeEventListener('abort', done);
      resolve();
    };
    const noStart = setTimeout(() => {
      if (!started) done();
    }, startMs);
    const cap = setTimeout(done, maxMs);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    session._closingSignal?.addEventListener('abort', done);
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
 * Ask for the alert's reply and settle once HEARD_AFTER_MS of it has played ('played'),
 * or when it ends sooner ('cut'). Playout is the time LiveKit has it 'speaking' and no
 * soft pause holds it (playout-hold.ts): a pause for the caller's voice stops the count,
 * a resume restarts it. A reply that finished uninterrupted counts as played. The call
 * closing settles it as 'cut' (the caller then sees call_ended); a reply that does
 * neither within `maxMs` fails as reply_timeout, so a handle that never finishes can't
 * hold the alert. With `onLatePlay`, a timed-out reply is still watched for up to
 * `lateMs`: if it is heard after all (by the same rule), `onLatePlay` runs once.
 */
async function sayOnce(
  session: AlertSession,
  cb: VoiceCallback,
  maxMs = REPLY_WAIT_MS,
  late?: { onLatePlay: () => void; lateMs?: number }
): Promise<Outcome> {
  return new Promise((resolve) => {
    let handle: unknown;
    let speaking = false;
    let playedMs = 0;
    let since: number | undefined;
    let heard: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let over = false;
    const count = (): void => {
      const playing = speaking && !playoutHeld(session);
      if (playing && since === undefined && handle !== undefined) {
        if (session._activity?.currentSpeech !== handle) return;
        since = Date.now();
        heard = setTimeout(() => settle('played'), HEARD_AFTER_MS - playedMs);
      } else if (!playing && since !== undefined) {
        playedMs += Date.now() - since;
        since = undefined;
        clearTimeout(heard);
      }
    };
    const onState = (ev: unknown): void => {
      speaking = newState(ev) === 'speaking';
      count();
    };
    const offHold = onPlayoutHeldChange(session, count);
    const onClose = (): void => settle('cut');
    let cap = setTimeout(() => {
      if (!late) return settle({ failed: 'reply_timeout' });
      // Dropped now; a reply that is heard later still counts (onLatePlay).
      timedOut = true;
      resolve({ failed: 'reply_timeout' });
      cap = setTimeout(() => settle('cut'), late.lateMs ?? LATE_PLAY_WAIT_MS);
    }, maxMs);
    const settle = (outcome: Outcome): void => {
      if (over) return;
      over = true;
      clearTimeout(heard);
      clearTimeout(cap);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
      offHold();
      session._closingSignal?.removeEventListener('abort', onClose);
      if (!timedOut) resolve(outcome);
      else if (outcome === 'played') late?.onLatePlay();
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    session._closingSignal?.addEventListener('abort', onClose);
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
    replyWaitMs?: number;
    latePlayWaitMs?: number;
    /** CALL_ALERT_SPOKEN / CALL_ALERT_RETRY / CALL_ALERT_DROPPED lines; the module log by default. */
    log?: (msg: string, fields: Record<string, unknown>) => void;
  } = {}
): (cb: VoiceCallback) => Promise<void> {
  const say =
    opts.log ??
    ((msg, fields) =>
      msg === 'CALL_ALERT_DROPPED' ? log.warn(fields, msg) : log.info(fields, msg));
  // When the caller last stopped talking: a turn of theirs may still be committed (and
  // would cut an alert) until LiveKit's endpointing delay has passed since. Watched for
  // the whole call: started per alert, the first attempt never saw a stop that came just
  // before the alert fired, and its reply was cut by that turn's commit (#2545).
  let callerStoppedAt = -Infinity;
  const onUser = (ev: unknown): void => {
    if (newState(ev) === 'listening') callerStoppedAt = Date.now();
  };
  session.on(voice.AgentSessionEventTypes.UserStateChanged, onUser);
  session._closingSignal?.addEventListener(
    'abort',
    () => session.off(voice.AgentSessionEventTypes.UserStateChanged, onUser),
    { once: true }
  );
  return async (cb) => {
    for (let attempt = 1; attempt <= MAX_ALERT_ATTEMPTS; attempt++) {
      const fields = { sessionId: opts.sessionId, type: cb.type, attempt };
      // A retry waits for the answer to the caller who cut the first one, then a pause.
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      if (attempt > 1) await waitForAnswer(session, opts.answerStartMs, opts.quietWaitMs);
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      await waitUntilQuiet(
        session,
        opts.quietWaitMs,
        commitDelayMs(session),
        () => callerStoppedAt
      );
      if (callEnded(session)) return say('CALL_ALERT_DROPPED', { ...fields, reason: 'call_ended' });
      if (cb.holdIf?.()) return say('CALL_ALERT_DROPPED', { ...fields, reason: 'held' });
      // eslint-disable-next-line no-await-in-loop -- one attempt at a time, by design
      const outcome = await sayOnce(session, cb, opts.replyWaitMs, {
        lateMs: opts.latePlayWaitMs,
        // Heard after the drop: a live call report is then delivered, not told again later.
        onLatePlay: () => {
          cb.onSpoken?.();
          say('CALL_ALERT_SPOKEN', { ...fields, late: true });
        },
      });
      if (outcome === 'played') {
        cb.onSpoken?.();
        return say('CALL_ALERT_SPOKEN', fields);
      }
      if (outcome === 'requested')
        return say('CALL_ALERT_SPOKEN', { ...fields, unconfirmed: true });
      if (outcome !== 'cut') {
        return say('CALL_ALERT_DROPPED', {
          ...fields,
          reason: 'reply_failed',
          error: outcome.failed,
        });
      }
      // Cut by the call closing: nothing more is asked for, so no RETRY line first
      if (callEnded(session)) return say('CALL_ALERT_DROPPED', { ...fields, reason: 'call_ended' });
      if (attempt < MAX_ALERT_ATTEMPTS)
        say('CALL_ALERT_RETRY', { ...fields, reason: 'cut_before_heard' });
      else say('CALL_ALERT_DROPPED', { ...fields, reason: 'cut_before_heard' });
    }
  };
}
