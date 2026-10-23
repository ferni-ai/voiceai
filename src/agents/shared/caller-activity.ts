/**
 * What the caller is doing while a call ends (call-wrap-up.ts, #2291): their
 * transcribed words, interim and final, whether they are mid-utterance, and
 * whether the crisis read of their last line has settled.
 *
 * A crisis line said just after Ferni's goodbye ("actually, I don't think I'll
 * be here tomorrow") takes ~3 s to say. Its crisis read starts only after the
 * final transcript, the end-of-turn wait and the turn's first steps
 * (process-turn.ts), so there is a gap with no interim and no read in flight.
 * So after each final caller line the caller counts as busy until that turn's
 * read has started and settled, at most TURN_READ_WAIT_MS (awaitTurnReads).
 *
 * Voice activity alone may only HOLD the end, never reopen the call: it fires
 * on the app's own goodbye sound and on iOS echo.
 *
 * @module agents/shared/caller-activity
 */
import { voice } from '@livekit/agents';
import {
  crisisReadInFlight,
  crisisRiskThisCall,
  onCrisisReadStarted,
} from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callerSignsOff } from './call-farewell.js';

const log = createLogger({ module: 'caller-activity' });

/** How often a held end re-checks the caller. */
export const HOLD_STEP_MS = 250;
/** The longest a room delete waits on a busy caller or a crisis read. */
export const HOLD_MAX_MS = 6_000;
/**
 * After a final caller line, the longest wait for its crisis read to start
 * and settle: the longest end-of-turn wait, the classifier's 1 s timeout, and
 * margin.
 */
export const TURN_READ_WAIT_MS = 3_000;
/** A model-ended phone call hangs up after this much quiet (waitForQuiet). */
export const PHONE_QUIET_MS = 2_000;

type SetTimer = (fn: () => void, ms: number) => unknown;

/** A caller transcript: `final` is a committed line or a final STT segment. */
export interface CallerWords {
  text: string;
  final: boolean;
  /** The turn's conversation item (it follows the turn's STT finals, sometimes by seconds). */
  item?: boolean;
}

export interface CallerWatch {
  /** Mid-utterance: speaking by voice activity, or an interim transcript with no final yet. */
  busy: () => boolean;
  /** Mid-utterance with words that are not a sign-off ("wait, I don't"). */
  talking: () => boolean;
  /** Hear the caller's transcripts; returns the unsubscribe. */
  onWords: (fn: (words: CallerWords) => void) => () => void;
  stop: () => void;
}

interface SessionEvents {
  on: (event: string, fn: (ev: never) => void) => unknown;
  off: (event: string, fn: (ev: never) => void) => unknown;
}

const EV = voice.AgentSessionEventTypes;

/** Watch a call's AgentSession for the caller (stops when the session closes). */
export function watchCaller(agentSession: object): CallerWatch {
  const session = agentSession as SessionEvents;
  const listeners = new Set<(words: CallerWords) => void>();
  let speaking = false;
  let interim = '';
  const emit = (words: CallerWords): void => {
    for (const fn of [...listeners]) fn(words);
  };
  const onTranscribed = (ev: { transcript?: string; isFinal?: boolean }): void => {
    const text = ev.transcript?.trim() ?? '';
    interim = ev.isFinal ? '' : text;
    if (text) emit({ text, final: !!ev.isFinal });
  };
  const onItem = ({ item }: { item?: { role?: string; textContent?: string } }): void => {
    if (item?.role !== 'user' || !item.textContent) return;
    interim = '';
    emit({ text: item.textContent, final: true, item: true });
  };
  const onUser = (ev: { newState?: string }): void => {
    speaking = ev.newState === 'speaking';
  };
  const stop = (): void => {
    listeners.clear();
    session.off(EV.UserInputTranscribed, onTranscribed);
    session.off(EV.ConversationItemAdded, onItem);
    session.off(EV.UserStateChanged, onUser);
    session.off(EV.Close, stop);
  };
  session.on(EV.UserInputTranscribed, onTranscribed);
  session.on(EV.ConversationItemAdded, onItem);
  session.on(EV.UserStateChanged, onUser);
  session.on(EV.Close, stop);
  return {
    busy: () => speaking || interim.length > 0,
    talking: () => interim.length > 0 && !callerSignsOff(interim),
    onWords: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    stop,
  };
}

export interface TurnReads {
  /** A final caller line heard since start whose crisis read hasn't settled (bounded). */
  pending: () => boolean;
  /**
   * The latest final line's read: still `waiting`, `settled` (it started and
   * finished; risk it found is noted by crisis-call-risk.ts), or `timed_out`
   * (no settled read within TURN_READ_WAIT_MS).
   */
  outcome: () => 'idle' | 'waiting' | 'settled' | 'timed_out';
  stop: () => void;
}

/**
 * From now on, after each final caller line, wait for that turn's crisis read
 * to start and settle, at most TURN_READ_WAIT_MS. `onReadStart` runs when it
 * starts (the app is told to hold its hang-up, wrap-up-window.ts).
 */
export function awaitTurnReads(opts: {
  sessionId: string;
  caller?: CallerWatch;
  setTimer: SetTimer;
  onReadStart?: () => void;
}): TurnReads {
  const { sessionId } = opts;
  let state: ReturnType<TurnReads['outcome']> = 'idle';
  let readSeen = false;
  let turn = 0;
  const check = (): void => {
    if (state === 'waiting' && readSeen && !crisisReadInFlight(sessionId)) state = 'settled';
  };
  const offWords = opts.caller?.onWords(({ final }) => {
    if (!final) return;
    state = 'waiting';
    readSeen = false;
    const mine = ++turn;
    opts.setTimer(() => {
      check();
      if (mine === turn && state === 'waiting') state = 'timed_out';
    }, TURN_READ_WAIT_MS);
  });
  const offRead = onCrisisReadStarted((id) => {
    if (id !== sessionId || state !== 'waiting') return;
    readSeen = true;
    opts.onReadStart?.();
  });
  return {
    pending: () => {
      check();
      return state === 'waiting';
    },
    outcome: () => {
      check();
      return state;
    },
    stop: () => {
      offWords?.();
      offRead();
      state = 'idle';
    },
  };
}

const sleep = async (setTimer: SetTimer, ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimer(resolve, ms);
  });

/**
 * Wait, re-checking every HOLD_STEP_MS for at most HOLD_MAX_MS, while
 * `busy()`: the caller mid-utterance, their last line's read not settled, or
 * a crisis read in flight. Returns early once `done()` (reopened, or the
 * caller left).
 */
export async function holdWhileBusy(opts: {
  sessionId: string;
  busy: () => boolean;
  done: () => boolean;
  setTimer: SetTimer;
}): Promise<void> {
  const { sessionId } = opts;
  for (let held = 0; held < HOLD_MAX_MS; held += HOLD_STEP_MS) {
    if (opts.done()) return;
    if (!opts.busy() && !crisisReadInFlight(sessionId)) return;
    if (held === 0) log.info({ sessionId }, 'CALL_WRAP_UP end held: caller or crisis read');
    // eslint-disable-next-line no-await-in-loop -- re-checks the caller on a timer
    await sleep(opts.setTimer, HOLD_STEP_MS);
  }
  log.warn({ sessionId, heldMs: HOLD_MAX_MS }, 'CALL_WRAP_UP end hold ran out');
}

/**
 * Before a model-ended phone call hangs up (PHONE_GOODBYE's endCall): wait for
 * PHONE_QUIET_MS of quiet, with no line's read unsettled and no read in
 * flight, at most HOLD_MAX_MS. Returns 'talking' at once when the caller says
 * more than a sign-off (the call stays open), 'risk' when crisis risk is
 * noted, otherwise 'quiet'.
 */
export async function waitForQuiet(opts: {
  sessionId: string;
  caller?: CallerWatch;
  setTimer: SetTimer;
  gone: () => boolean;
}): Promise<'quiet' | 'talking' | 'risk'> {
  const { sessionId, caller } = opts;
  const reads = awaitTurnReads({ sessionId, caller, setTimer: opts.setTimer });
  let spoke = caller?.talking() ?? false;
  const offWords = caller?.onWords(({ text }) => {
    if (!callerSignsOff(text)) spoke = true;
  });
  const decided = (): 'quiet' | 'talking' | 'risk' | null => {
    if (spoke) return 'talking';
    if (crisisRiskThisCall(sessionId) && !crisisReadInFlight(sessionId)) return 'risk';
    return opts.gone() ? 'quiet' : null;
  };
  const busy = (): boolean =>
    (caller?.busy() ?? false) || reads.pending() || crisisReadInFlight(sessionId);
  try {
    let quiet = 0;
    for (let held = 0; held < HOLD_MAX_MS; held += HOLD_STEP_MS) {
      const verdict = decided();
      if (verdict) return verdict;
      const waiting = busy();
      if (!waiting && quiet >= PHONE_QUIET_MS) return 'quiet';
      // eslint-disable-next-line no-await-in-loop -- re-checks the caller on a timer
      await sleep(opts.setTimer, HOLD_STEP_MS);
      quiet = waiting ? 0 : quiet + HOLD_STEP_MS;
    }
    log.warn({ sessionId, heldMs: HOLD_MAX_MS }, 'PHONE_GOODBYE hang-up hold ran out');
    return decided() ?? 'quiet';
  } finally {
    offWords?.();
    reads.stop();
  }
}
