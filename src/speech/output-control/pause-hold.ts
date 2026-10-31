/**
 * Don't start a reply into a pause the caller may not be done with.
 *
 * Dev, 2026-10-12, long-day scenario (turn 4: "Oh, and Biscuit chewed up my
 * phone charger this morning." [700 ms pause] "So, that was fun."): ink-2
 * ended the turn in the pause in 10 of 10 calls. On today's path the reply's
 * audio came after the caller went on, so the SDK paused it unheard. With the
 * faster path (VERTEX_KEEPALIVE, TURN_OPENING_SOUND=early) the first audio
 * came 968-1056 ms after the caller stopped, the caller's voice reached the
 * agent at 1103-1230 ms, and Ferni was heard over them in 3 of 5 calls
 * ("Biscuit", "Of", ...).
 *
 * The syntax hold (unfinished-turn.ts) can't see this: the words are a whole
 * sentence. What differs is ink's hesitation. Ink's eager end comes as the
 * words finish; on a clear end the turn end follows quickly (eager to end p50
 * 229 ms, p75 383 ms, dev 10-09..12, n=450), while all 8 premature ends whose
 * reply was never spoken had waited 424-783 ms.
 *
 * PAUSE_HOLD=on: when ink ended the turn PAUSE_HOLD_LEAD_MS (400) or more
 * after the caller's words last changed, and they don't end in a question,
 * the reply is still generated at once but its first audio waits until the
 * caller has been quiet PAUSE_HOLD_MS (1300) since they stopped. If they go
 * on, the SDK sees them start while it is still "thinking" and drops the
 * reply for the new turn, unheard. A clear end, or a reply that is slower than
 * the window anyway, is not delayed. The wait never exceeds PAUSE_HOLD_MAX_MS.
 *
 * Phone callers, prod 2026-10-15..22: 41 of the 46 holds that hit the 2.5 s
 * cap were on the phone, none on synthetic calls. At 31 of 38 phone caps the
 * caller had been quiet 1.3 s or more by their last stop: the hold was waiting
 * on a "speaking" state that never ended, and at 7 of the 19 caps whose reply
 * played no caller words came during the hold or 2.5 s after it. Phone audio
 * reaches VAD raw apart from AGC + high-pass (pre-stt-frame-processor.ts),
 * with the room behind the caller in it; web and iOS audio has been cleaned
 * by the browser or the OS. PAUSE_HOLD_PHONE_CAP=on, phone only: "speaking"
 * that brings no new words within PHONE_HOLD.graceMs no longer counts as the
 * caller going on, and a hold with no new words ends by PHONE_HOLD.maxMs.
 * New words during the hold keep the full hold, so a caller who goes on
 * ("so I was thinking... um... maybe Thursday") is still waited for.
 *
 * @module speech/output-control/pause-hold
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PauseHold' });

export interface PauseHoldConfig {
  /** Quiet since the caller stopped before a hesitant turn's reply may start. */
  silenceMs: number;
  /** Words-done to turn-end gap that marks ink as hesitant. */
  leadMs: number;
  /** Longest a reply is ever held. */
  maxMs: number;
}

export const PAUSE_HOLD_DEFAULTS: PauseHoldConfig = { silenceMs: 1300, leadMs: 400, maxMs: 2500 };

/**
 * VAD reports the caller quiet this long after they stop (call-session.ts
 * VAD_MIN_SILENCE_MS default), so a "listening" event's time minus this is
 * when they stopped.
 */
const VAD_SILENCE_MS = 350;
/** How often a held reply rechecks the caller. */
const POLL_MS = 25;

/**
 * PAUSE_HOLD_PHONE_CAP. A "speaking" state counts as the caller going on for
 * `graceMs` with no words: a real restart's first words come within it. Its
 * length comes from prod phone TURN_METRICS, 10-17..22, n=347: speech end to
 * the final transcript p90 612 ms, p99 907 ms (web: 0). Interim words aren't
 * logged, so the bound is a first segment of up to ~1.1 s plus that p99.
 * A hold that has heard no new words and no live speech ends `maxMs` after
 * the turn ended (or after the reply was ready, if that came later).
 */
export const PHONE_HOLD = { graceMs: 2000, maxMs: 1300 } as const;

type Env = Record<string, string | undefined>;

/** Whether a phone caller's hold reads speech by its words (PAUSE_HOLD_PHONE_CAP=on). */
export function phoneHoldOn(phone: boolean | undefined, env: Env = process.env): boolean {
  return phone === true && flagOn('PAUSE_HOLD_PHONE_CAP', env);
}

/**
 * Whether a phone caller's "speaking" state means they went on: it brought new
 * words after it began, or it is still young enough that its words may be on
 * the way.
 */
export function phoneCallerSpeaking(
  speaking: boolean,
  speakingSince: number | undefined,
  newWordsAt: number | undefined,
  now: number
): boolean {
  if (!speaking) return false;
  const since = speakingSince ?? now;
  return (newWordsAt !== undefined && newWordsAt >= since) || now - since < PHONE_HOLD.graceMs;
}

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Whether `text` says something beyond `turn`, the transcript that ended the
 * turn: not a re-cased, re-punctuated or shorter re-send of it.
 */
export function hasNewWords(text: string, turn: string): boolean {
  const words = wordsOf(text);
  const said = wordsOf(turn);
  if (words.length === 0) return false;
  const isPrefix = (a: string[], b: string[]): boolean => a.every((w, i) => b[i] === w);
  if (isPrefix(words, said)) return false; // the same words, or fewer
  return !isPrefix(said, words) || words.length > said.length;
}

function num(raw: string | undefined, fallback: number, min: number): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= min ? n : fallback;
}

/** The hold's settings, or null when PAUSE_HOLD is not on. */
export function pauseHoldConfig(env: Env = process.env): PauseHoldConfig | null {
  if (env.PAUSE_HOLD !== 'on') return null;
  const d = PAUSE_HOLD_DEFAULTS;
  return {
    silenceMs: num(env.PAUSE_HOLD_MS, d.silenceMs, 0),
    leadMs: num(env.PAUSE_HOLD_LEAD_MS, d.leadMs, 0),
    maxMs: num(env.PAUSE_HOLD_MAX_MS, d.maxMs, 0),
  };
}

/** Whether ink hesitated over this turn: words done `leadMs` or more before the end, not a question. */
export function hesitantCommit(transcript: string, leadMs: number, cfg: PauseHoldConfig): boolean {
  if (!transcript.trim() || /\?["')\]]*\s*$/.test(transcript.trim())) return false;
  return leadMs >= cfg.leadMs;
}

export interface HeldReply {
  /** When the caller last stopped speaking. */
  stoppedAt: number;
  /** When the reply's first audio was ready. */
  heldSince: number;
}

/** How much longer the reply must wait; 0 plays it. */
export function pauseHoldWaitMs(
  held: HeldReply,
  callerSpeaking: boolean,
  now: number,
  cfg: PauseHoldConfig
): number {
  const capLeft = held.heldSince + cfg.maxMs - now;
  if (capLeft <= 0) return 0;
  if (callerSpeaking) return Math.min(POLL_MS, capLeft);
  return Math.min(Math.max(0, held.stoppedAt + cfg.silenceMs - now), capLeft);
}

interface SessionEvents {
  on: (event: string, handler: (ev: unknown) => void) => unknown;
  off: (event: string, handler: (ev: unknown) => void) => unknown;
}

interface Gate {
  /** Resolves when the reply's first audio may play. */
  wait: () => Promise<void>;
}

const gates = new Map<string, Gate>();

/** A held reply was released: how long its first audio waited (ms). */
export type PauseHoldListener = (sessionId: string, heldMs: number) => void;
const releaseListeners = new Set<PauseHoldListener>();

/** Hear each held reply's release (turn-receipt.ts records it). Returns an unsubscribe. */
export function onPauseHoldReleased(listener: PauseHoldListener): () => void {
  releaseListeners.add(listener);
  return () => void releaseListeners.delete(listener);
}

/** Wait for the session's pause hold, if one is installed and holding. */
export async function waitForPauseHold(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await gates.get(sessionId)?.wait();
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * A preemptive reply can have audio before ink ends the turn; it waits for the
 * commit this long after the caller's words last changed, at most.
 */
const PRECOMMIT_WAIT_MS = 1500;

/** What the session's listeners know, read by a waiting reply. */
interface HoldState {
  words: string;
  wordsAt: number;
  /** The caller spoke since the last commit (and not over Ferni). */
  turnOpen: boolean;
  stoppedAt: number | undefined;
  callerSpeaking: boolean;
  /** When the caller's current "speaking" state began. */
  speakingSince: number | undefined;
  /** When the last held reply was released, until Ferni is heard. */
  releasedAt: number | undefined;
  agentSpeaking: boolean;
  /**
   * The turn whose reply is waiting for its first audio: committed at `at` on
   * `words`, real new words since at `newWordsAt`. Null when none is held.
   */
  armed: { stoppedAt: number; at: number; words: string; newWordsAt?: number } | null;
  /** The caller is on the phone (logged); undefined when not known. */
  caller: boolean | undefined;
  /** PAUSE_HOLD_PHONE_CAP is on for this phone caller. */
  phone: boolean;
}

/** How the session logs the caller. */
function callerFields(st: HoldState): Record<string, unknown> {
  const caller = st.caller === undefined ? 'unknown' : st.caller ? 'phone' : 'web';
  return st.phone ? { caller, phoneRule: true } : { caller };
}

/** The wait this poll gives: a phone hold reads speech by its words. */
function waitNow(st: HoldState, cfg: PauseHoldConfig, held: HeldReply, now: number): number {
  const turn = st.armed;
  if (!st.phone || !turn) return pauseHoldWaitMs(held, st.callerSpeaking, now, cfg);
  const speaking = phoneCallerSpeaking(st.callerSpeaking, st.speakingSince, turn.newWordsAt, now);
  const wait = pauseHoldWaitMs(held, speaking, now, cfg);
  // A caller who is going on, or said something new, gets the full hold
  if (speaking || turn.newWordsAt !== undefined) return wait;
  const capLeft = Math.max(held.heldSince, turn.at) + PHONE_HOLD.maxMs - now;
  return Math.max(0, Math.min(wait, capLeft));
}

/** Hold one reply's first audio as the session's state says. */
async function holdFirstAudio(
  st: HoldState,
  cfg: PauseHoldConfig,
  sessionId: string
): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-await-in-loop -- polling the live session state
  while (st.turnOpen && Date.now() - st.wordsAt < PRECOMMIT_WAIT_MS) await sleep(POLL_MS);
  const turn = st.armed;
  if (!turn) return;
  const held: HeldReply = { stoppedAt: turn.stoppedAt, heldSince: start };
  const waitMs = (): number => waitNow(st, cfg, held, Date.now());
  let ms = waitMs();
  while (ms > 0) {
    // eslint-disable-next-line no-await-in-loop -- polling the live session state
    await sleep(Math.min(ms, POLL_MS));
    held.stoppedAt = turn.stoppedAt;
    ms = waitMs();
  }
  const heldMs = Date.now() - start;
  const quietMs = Date.now() - turn.stoppedAt;
  st.releasedAt = Date.now();
  log.info({ sessionId, heldMs, quietMs, ...callerFields(st) }, 'PAUSE_HOLD_RELEASED');
  for (const listener of releaseListeners) {
    try {
      listener(sessionId, heldMs);
    } catch {
      // Observability only: never in the way of the reply's audio.
    }
  }
}

/** At the commit: hold this turn's reply if ink hesitated over it. */
function onCommit(st: HoldState, cfg: PauseHoldConfig, sessionId: string): void {
  st.turnOpen = false;
  const leadMs = Date.now() - st.wordsAt;
  const stop = st.stoppedAt;
  st.stoppedAt = undefined;
  const hold = stop !== undefined && hesitantCommit(st.words, leadMs, cfg);
  st.armed = hold ? { stoppedAt: stop, at: Date.now(), words: st.words } : null;
  const stopToCommitMs = stop === undefined ? null : Date.now() - stop;
  log.info({ sessionId, leadMs, hold, stopToCommitMs, ...callerFields(st) }, 'PAUSE_HOLD');
}

/** Install the hold on a live session. Returns a detach, or null when off. */
export function attachPauseHold(
  session: SessionEvents,
  sessionId: string,
  env: Env = process.env,
  phone?: boolean
): (() => void) | null {
  const cfg = pauseHoldConfig(env);
  if (!cfg) return null;
  const st: HoldState = {
    words: '',
    wordsAt: 0,
    turnOpen: false,
    stoppedAt: undefined,
    callerSpeaking: false,
    speakingSince: undefined,
    agentSpeaking: false,
    armed: null,
    releasedAt: undefined,
    caller: phone,
    phone: phoneHoldOn(phone, env),
  };
  const onTranscript = (ev: unknown): void => {
    const text = ((ev as { transcript?: string } | undefined)?.transcript ?? '').trim();
    if (!text || text === st.words) return;
    st.words = text;
    st.wordsAt = Date.now();
    if (st.armed && st.armed.newWordsAt === undefined && hasNewWords(text, st.armed.words)) {
      st.armed.newWordsAt = st.wordsAt;
    }
    // Words over Ferni (a backchannel) don't open a turn a reply should wait for.
    if (!st.agentSpeaking) st.turnOpen = true;
  };
  const onMetrics = (ev: unknown): void => {
    const m = (ev as { metrics?: { type?: string; lastSpeakingTimeMs?: number } })?.metrics;
    const at = m?.type === 'eou_metrics' ? m.lastSpeakingTimeMs : undefined;
    if (typeof at === 'number' && at > 0) st.stoppedAt = at;
  };
  const onUserState = (ev: unknown): void => {
    const { newState, createdAt } = (ev ?? {}) as { newState?: string; createdAt?: number };
    const speaking = newState === 'speaking';
    if (speaking && !st.callerSpeaking) st.speakingSince = Date.now();
    st.callerSpeaking = speaking;
    // They went on and stopped again: the quiet counts from the new stop.
    if (newState === 'listening' && st.armed) {
      const stop = (createdAt ?? Date.now()) - VAD_SILENCE_MS;
      st.armed.stoppedAt = Math.max(st.armed.stoppedAt, stop);
    }
  };
  const onAgentState = (ev: unknown): void => {
    const state = (ev as { newState?: string } | undefined)?.newState;
    st.agentSpeaking = state === 'speaking';
    if (state === 'speaking' && st.releasedAt !== undefined) {
      // What the caller hears: the SDK may still hold the audio (its pause on caller speech)
      const audibleMs = Date.now() - st.releasedAt;
      log.info({ sessionId, audibleMs, ...callerFields(st) }, 'PAUSE_HOLD_AUDIBLE');
      st.releasedAt = undefined;
    }
    if (state === 'speaking') st.armed = null;
    else if (state === 'thinking' && st.turnOpen) onCommit(st, cfg, sessionId);
  };
  const gate: Gate = { wait: async () => holdFirstAudio(st, cfg, sessionId) };
  gates.set(sessionId, gate);
  const handlers: Array<[string, (ev: unknown) => void]> = [
    ['user_input_transcribed', onTranscript],
    ['metrics_collected', onMetrics],
    ['user_state_changed', onUserState],
    ['agent_state_changed', onAgentState],
  ];
  for (const [event, handler] of handlers) session.on(event, handler);
  return () => {
    if (gates.get(sessionId) === gate) gates.delete(sessionId);
    for (const [event, handler] of handlers) session.off(event, handler);
  };
}
