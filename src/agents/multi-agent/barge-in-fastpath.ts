/**
 * Stop Ferni as soon as the caller is clearly interrupting.
 *
 * LiveKit's adaptive barge-in model tells a real interruption from a
 * backchannel well (dev, 2026-09-30: "mm-hmm"/"yeah" scored 0.22-0.64 and
 * were let through; "Wait, sorry, hold on..." scored 0.66-0.81) but slowly:
 * it took 1.5-2.9 s to decide on the real interruptions, so Ferni talked over
 * the caller for 2-3 s. A person stops within about half a second.
 *
 * The fast path people use: someone who keeps talking over you for most of a
 * second is taking the floor; "mm-hmm" and "yeah" are over in about half
 * that. So while Ferni speaks, the caller's voice activity running
 * continuously for SUSTAINED_SPEECH_MS interrupts. (A transcript rule was
 * tried first: Ink-2's first interim word arrived only after the model had
 * already decided, 1.6 s in, so it never fired. It stays as a backstop, with
 * an echo guard: words that are mostly Ferni's own, picked up by a
 * speakerphone mic, don't count.)
 *
 * BARGE_IN_SOFT_PAUSE=on pauses Ferni there instead and cuts the reply only
 * once words or the barge-in model confirm it (barge-in-soft-pause.ts).
 *
 * @module agents/multi-agent/barge-in-fastpath
 */

import type { SoftPause } from './barge-in-soft-pause.js';

/** Words that on their own signal "go on", not "stop". */
const BACKCHANNEL_WORDS = new Set([
  'mm',
  'mmm',
  'mhm',
  'mmhm',
  'mmhmm',
  'hmm',
  'hm',
  'uh',
  'huh',
  'uhhuh',
  'um',
  'yeah',
  'yep',
  'yup',
  'yes',
  'ya',
  'ok',
  'okay',
  'right',
  'sure',
  'totally',
  'exactly',
  'wow',
  'oh',
  'ah',
  'aha',
  'cool',
  'nice',
  'true',
  'alright',
  'really',
  'ha',
  'haha',
  'lol',
  'gotcha',
  'got',
  'it',
  'i',
  'see',
  'agreed',
]);

export const MIN_INTERRUPT_WORDS = 3;
/**
 * Continuous caller speech over Ferni that counts as taking the floor, as
 * the voice detector reports it: speech plus its 350 ms end-of-speech
 * hangover (agent-setup.ts). Backchannels measured 0.40-0.52 s spoken
 * (<= 0.87 s reported); at 700 ms a 0.45 s "uh-huh" fired (dev, 2026-09-30).
 */
export const SUSTAINED_SPEECH_MS = 950;
/**
 * Words that confirm a soft pause: one real word (not a backchannel, not
 * Ferni's echo). Three would rarely arrive inside the confirmation window.
 */
export const SOFT_PAUSE_CONFIRM_WORDS = 1;
/** After a soft pause resumes, the transcript backstop needs only two words this long. */
export const POST_RESUME_BACKSTOP_MS = 1500;
export const POST_RESUME_MIN_WORDS = 2;
/** A paused output still held this long past window + grace is resumed regardless. */
export const SOFT_PAUSE_WATCHDOG_EXTRA_MS = 1000;

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-/g, '')
    .split(/[^a-z']+/)
    .map((w) => w.replace(/'/g, ''))
    .filter(Boolean);
}

/**
 * A hummed "mm-hmm" in any spelling: STT writes it as "M M M.", "Mhmm",
 * "Hmmm"... (Ink-2 gave "M M M." for every mm-hmm in 3 dev talk-over calls,
 * 2026-10-04). Only m's and h's, so "mom" or "uh-uh" (a no) never match.
 */
const HUMMED = /^(?:m+h*m*|h+m+)$/;

export function isBackchannel(ws: string[]): boolean {
  return ws.length > 0 && ws.every((w) => BACKCHANNEL_WORDS.has(w) || HUMMED.test(w));
}

/**
 * Make the patched LiveKit (BACKCHANNEL_KEEPS_PAUSE / BACKCHANNEL_NOT_A_TURN in
 * patches/@livekit__agents@1.9.3.patch) use this list: the patch had its own,
 * without "aha", "alright", "got it" or "I see", so those cut Ferni off.
 */
export function installBackchannelHook(): void {
  (globalThis as { __FERNI_IS_BACKCHANNEL?: (text: string) => boolean }).__FERNI_IS_BACKCHANNEL = (
    text
  ) => {
    const ws = words(text);
    return ws.length <= 4 && isBackchannel(ws);
  };
}

/** Mostly Ferni's own current words: the caller's mic hearing Ferni. */
export function looksLikeEcho(ws: string[], spokenText: string): boolean {
  if (ws.length === 0 || !spokenText) return false;
  const spoken = new Set(words(spokenText));
  const shared = ws.filter((w) => spoken.has(w)).length;
  return shared / ws.length >= 0.8;
}

export function shouldInterrupt(p: {
  transcript: string;
  agentSpeaking: boolean;
  spokenText: string;
  minWords?: number;
}): boolean {
  if (!p.agentSpeaking) return false;
  const ws = words(p.transcript);
  if (ws.length < (p.minWords ?? MIN_INTERRUPT_WORDS)) return false;
  if (isBackchannel(ws)) return false;
  return !looksLikeEcho(ws, p.spokenText);
}

export interface BargeInFastPath {
  onTranscript(event: unknown): void;
  onAgentState(event: unknown): void;
  /** The caller's voice activity (user_state_changed). */
  onUserState(event: unknown): void;
  /** Text as it is spoken (captions), for the echo guard. */
  onSpokenText(chunk: string): void;
  /** The barge-in model's verdict on an overlap (BARGE_IN_DECISION). */
  onOverlapDecision(event: unknown): void;
}

export function createBargeInFastPath(deps: {
  /** Cut the reply; false (or a throw) when it could not be cut. */
  interrupt: () => boolean | void;
  log?: (fields: Record<string, unknown>) => void;
  sustainedSpeechMs?: number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
  /** BARGE_IN_SOFT_PAUSE=on: sustained speech pauses Ferni until confirmed. */
  softPause?: SoftPause;
}): BargeInFastPath {
  const setTimer =
    deps.setTimer ??
    ((fn: () => void, ms: number) => setTimeout(fn, ms) as ReturnType<typeof setTimeout>);
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let agentSpeaking = false;
  let callerSpeaking = false;
  let spokenText = '';
  let firedThisReply = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soft = deps.softPause;
  let pausedThisReply = false;
  /** Ferni's audio is paused by us (until resumed, or the cut reply ends). */
  let outputHeld = false;
  let pending:
    | { at: number; heard: string; timer?: ReturnType<typeof setTimeout>; vadEndAt?: number }
    | undefined;
  let resumedAt: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const stopTimer = (): void => {
    if (timer) clearTimer(timer);
    timer = undefined;
  };
  const fire = (fields: Record<string, unknown>): void => {
    if (firedThisReply) return;
    firedThisReply = true;
    stopTimer();
    deps.log?.(fields);
    deps.interrupt();
  };
  /** Give Ferni's audio back. A throw is logged, never let into a timer or LiveKit's emit. */
  const release = (): void => {
    outputHeld = false;
    if (watchdog) clearTimer(watchdog);
    watchdog = undefined;
    try {
      soft?.resume();
    } catch (error) {
      soft?.log?.({ event: 'resume-failed', error: String(error) });
    }
  };
  const tryInterrupt = (): boolean => {
    try {
      return deps.interrupt() !== false;
    } catch {
      return false;
    }
  };
  const decide = (outcome: 'interrupted' | 'resumed', fields: Record<string, unknown>): void => {
    if (!pending || !soft) return;
    if (pending.timer) clearTimer(pending.timer);
    const pausedMs = Date.now() - pending.at;
    pending = undefined;
    if (outcome === 'interrupted') {
      firedThisReply = true;
      // The output stays paused until the cut reply ends (releaseOutput).
      if (tryInterrupt()) {
        soft.log?.({ outcome, ...fields, pausedMs });
        return;
      }
      // An uninterruptible reply would otherwise stay paused, and "speaking", for good.
      soft.log?.({ outcome: 'resumed', why: 'cut-failed', confirmedBy: fields.why, pausedMs });
      release();
      return;
    }
    soft.log?.({ outcome, ...fields, pausedMs });
    resumedAt = Date.now();
    release();
  };
  /**
   * Resume at the window's end, or, if the caller went quiet, at the later of
   * that and the STT grace's end (never past both summed). A caller who never
   * goes quiet is usually steady room noise: don't hold Ferni silent past the
   * window; a real interruption's late words still cut via the post-resume backstop.
   */
  const scheduleResume = (): void => {
    if (!pending || !soft) return;
    if (pending.timer) clearTimer(pending.timer);
    const windowEnd = pending.at + soft.confirmMs;
    const cap = windowEnd + soft.graceMs;
    const { vadEndAt } = pending;
    const graceEnd = vadEndAt === undefined ? windowEnd : vadEndAt + soft.graceMs;
    const after = graceEnd > windowEnd ? 'grace' : 'window';
    const ms = Math.min(cap, Math.max(windowEnd, graceEnd)) - Date.now();
    pending.timer = setTimer(
      () => decide('resumed', { why: pending?.heard, after }),
      Math.max(0, ms)
    );
  };
  const tryPause = (): boolean => {
    try {
      return soft?.pause() === true;
    } catch (error) {
      soft?.log?.({ event: 'pause-failed', error: String(error) });
      return false; // the fast path cuts the reply, as without the flag
    }
  };
  const softPause = (): boolean => {
    if (!soft || !tryPause()) return false;
    pausedThisReply = true;
    outputHeld = true;
    const at = Date.now();
    pending = { at, heard: 'no-words' };
    scheduleResume();
    if (watchdog) clearTimer(watchdog);
    watchdog = setTimer(
      () => {
        watchdog = undefined;
        if (!outputHeld) return;
        if (pending?.timer) clearTimer(pending.timer);
        pending = undefined;
        soft.log?.({ outcome: 'resumed', why: 'watchdog', pausedMs: Date.now() - at });
        release();
      },
      soft.confirmMs + soft.graceMs + SOFT_PAUSE_WATCHDOG_EXTRA_MS
    );
    return true;
  };
  const armIfOverlapping = (): void => {
    if (!agentSpeaking || !callerSpeaking || timer || firedThisReply || pausedThisReply) return;
    const ms = deps.sustainedSpeechMs ?? SUSTAINED_SPEECH_MS;
    timer = setTimer(() => {
      timer = undefined;
      if (agentSpeaking && callerSpeaking && !softPause()) fire({ reason: 'sustained-speech', ms });
    }, ms);
  };
  const releaseOutput = (): void => {
    if (pending) decide('resumed', { why: pending.heard, after: 'agent-stopped' });
    if (outputHeld) release();
  };
  return {
    onAgentState(event) {
      const state = (event as { newState?: string })?.newState;
      if (state === 'speaking' && !agentSpeaking) {
        spokenText = '';
        firedThisReply = false;
        pausedThisReply = false;
        resumedAt = undefined;
      }
      agentSpeaking = state === 'speaking';
      if (agentSpeaking) armIfOverlapping();
      else {
        stopTimer();
        releaseOutput();
      }
    },
    onUserState(event) {
      callerSpeaking = (event as { newState?: string })?.newState === 'speaking';
      if (pending) {
        // Quiet: wait out the STT grace for words still on their way.
        pending.vadEndAt = callerSpeaking ? undefined : Date.now();
        scheduleResume();
      }
      if (callerSpeaking) armIfOverlapping();
      else stopTimer();
    },
    onSpokenText(chunk) {
      // Keep the recent tail: enough to recognize an echo, bounded in size.
      spokenText = (spokenText + ' ' + chunk).slice(-600);
    },
    onOverlapDecision(event) {
      if ((event as { isInterruption?: boolean })?.isInterruption === true)
        decide('interrupted', { why: 'model' });
    },
    onTranscript(event) {
      if (firedThisReply) return;
      const transcript = (event as { transcript?: string })?.transcript ?? '';
      if (pending) {
        const ws = words(transcript);
        const confirm = { transcript, agentSpeaking: true, spokenText };
        if (shouldInterrupt({ ...confirm, minWords: SOFT_PAUSE_CONFIRM_WORDS })) {
          decide('interrupted', { why: 'words', words: ws.length });
        } else if (ws.length > 0) {
          pending.heard = isBackchannel(ws) ? 'backchannel' : 'echo';
        }
        return;
      }
      const justResumed =
        resumedAt !== undefined && Date.now() - resumedAt < POST_RESUME_BACKSTOP_MS;
      const minWords = justResumed ? POST_RESUME_MIN_WORDS : MIN_INTERRUPT_WORDS;
      if (!shouldInterrupt({ transcript, agentSpeaking, spokenText, minWords })) return;
      const extra = justResumed ? { minWords } : {};
      fire({ reason: 'transcript', transcript, words: words(transcript).length, ...extra });
    },
  };
}

const registry = new WeakMap<object, BargeInFastPath>();

export function setBargeInFastPath(session: object, fastPath: BargeInFastPath): void {
  registry.set(session, fastPath);
}

export function getBargeInFastPath(session: object | undefined): BargeInFastPath | undefined {
  return session ? registry.get(session) : undefined;
}
