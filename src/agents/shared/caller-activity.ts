/**
 * What the caller is doing while a call ends (call-wrap-up.ts, #2291): their
 * transcribed words, interim and final, and whether they are mid-utterance.
 *
 * A crisis line said just after Ferni's goodbye ("actually, I don't think I'll
 * be here tomorrow") takes ~3 s to say and then has to be transcribed and read
 * for risk. Ending the call before that lands ends a crisis call. So:
 * - the app holds its hang-up while interim transcripts arrive
 *   (`conversation_hold`, wrap-up-window.ts);
 * - the room is not deleted while the caller is mid-utterance or a crisis
 *   read is in flight (holdWhileBusy), app or phone.
 *
 * Voice activity alone may only HOLD the end, never reopen the call: it fires
 * on the app's own goodbye sound and on iOS echo.
 *
 * @module agents/shared/caller-activity
 */
import { voice } from '@livekit/agents';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'caller-activity' });

/** How often a held room delete re-checks the caller. */
export const HOLD_STEP_MS = 250;
/** The longest a room delete waits on a busy caller or a crisis read. */
export const HOLD_MAX_MS = 6_000;

/** A caller transcript: `final` is a committed line or a final STT segment. */
export interface CallerWords {
  text: string;
  final: boolean;
}

export interface CallerWatch {
  /** Mid-utterance: speaking by voice activity, or an interim transcript with no final yet. */
  busy: () => boolean;
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
  let interimOpen = false;
  const emit = (words: CallerWords): void => {
    for (const fn of [...listeners]) fn(words);
  };
  const onTranscribed = (ev: { transcript?: string; isFinal?: boolean }): void => {
    const text = ev.transcript?.trim() ?? '';
    interimOpen = !ev.isFinal && text.length > 0;
    if (text) emit({ text, final: !!ev.isFinal });
  };
  const onItem = ({ item }: { item?: { role?: string; textContent?: string } }): void => {
    if (item?.role !== 'user' || !item.textContent) return;
    interimOpen = false;
    emit({ text: item.textContent, final: true });
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
    busy: () => speaking || interimOpen,
    onWords: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    stop,
  };
}

/**
 * Wait, re-checking every HOLD_STEP_MS for at most HOLD_MAX_MS, while the
 * caller is mid-utterance or a crisis read of their words is in flight.
 * Returns early once `done()` (the call reopened, or the caller left).
 */
export async function holdWhileBusy(opts: {
  sessionId: string;
  caller?: CallerWatch;
  done: () => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
}): Promise<void> {
  const { sessionId } = opts;
  for (let held = 0; held < HOLD_MAX_MS; held += HOLD_STEP_MS) {
    if (opts.done()) return;
    const busy = opts.caller?.busy() ?? false;
    if (!busy && !crisisRiskThisCall(sessionId)) return;
    if (held === 0) log.info({ sessionId, busy }, 'CALL_WRAP_UP end held: caller or crisis read');
    // eslint-disable-next-line no-await-in-loop -- re-checks the caller on a timer
    await new Promise<void>((resolve) => {
      opts.setTimer(resolve, HOLD_STEP_MS);
    });
  }
  log.warn({ sessionId, heldMs: HOLD_MAX_MS }, 'CALL_WRAP_UP end hold ran out');
}
