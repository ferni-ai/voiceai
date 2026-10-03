/**
 * Ferni doesn't answer half a sentence (unfinished-turn.ts and the
 * UNFINISHED_TURN_HELD hunk of patches/@livekit__agents@1.5.1.patch).
 *
 * Dev call, 2026-10-03: "We don't get" | "caught up in reviews." got a reply
 * to "We don't get"; so did "When you go to sleep, what do you dream" | "of?".
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DANGLING_HOLD_MS,
  UNPUNCTUATED_HOLD_MS,
  installUnfinishedTurnHold,
  unfinishedTurnHoldMs,
  unfinishedness,
} from '../unfinished-turn.js';

describe('unfinishedness', () => {
  it('holds the fragments ink ended turns on in the 2026-10-03 call', () => {
    for (const fragment of [
      "We don't get",
      'When you go to sleep, what do you dream',
      "All right, now to, it's not",
      "I don't say she goes",
      'moves cross into enemy',
    ]) {
      expect(unfinishedTurnHoldMs(fragment), fragment).toBeGreaterThan(0);
    }
  });

  it('answers finished turns at once', () => {
    for (const finished of [
      'All right, brother.',
      "It's hard to say.",
      'Why do you keep forgetting?',
      'caught up in reviews.',
      "We don't get caught up in reviews.",
      'When you go to sleep, what do you dream of?',
      'What are you thinking of?',
      'Yeah',
      'mm-hmm',
      'No',
      '',
    ]) {
      expect(unfinishedTurnHoldMs(finished), finished).toBe(0);
    }
  });

  it('waits longer when the turn ends on a word that needs more', () => {
    expect(unfinishedness('I was going to')).toBe('dangling');
    expect(unfinishedness('and then, um')).toBe('dangling');
    expect(unfinishedness('So I told her,')).toBe('dangling');
    expect(unfinishedness("I don't say she goes")).toBe('unpunctuated');
    expect(unfinishedTurnHoldMs('I was going to')).toBe(DANGLING_HOLD_MS);
    expect(unfinishedTurnHoldMs("I don't say she goes")).toBe(UNPUNCTUATED_HOLD_MS);
  });

  it('installs on the session unless UNFINISHED_TURN_HOLD=off', () => {
    const on: { unfinishedTurnHoldMs?: unknown } = {};
    expect(installUnfinishedTurnHold(on, {})).toBe(true);
    expect(on.unfinishedTurnHoldMs).toBe(unfinishedTurnHoldMs);
    const off: { unfinishedTurnHoldMs?: unknown } = {};
    expect(installUnfinishedTurnHold(off, { UNFINISHED_TURN_HOLD: 'off' })).toBe(false);
    expect(off.unfinishedTurnHoldMs).toBeUndefined();
  });
});

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
type OnEndOfTurn = (this: unknown, info: { newTranscript: string }) => Promise<boolean>;

async function onEndOfTurn(): Promise<OnEndOfTurn> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { onEndOfTurn: OnEndOfTurn } };
  };
  return mod.AgentActivity.prototype.onEndOfTurn;
}

/** The parts of an AgentActivity that onEndOfTurn reads, with the hold installed. */
function activity() {
  const session = {
    amd: undefined,
    chatCtx: { items: [] },
    sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
  };
  installUnfinishedTurnHold(session, {});
  return {
    agentSession: session,
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: undefined,
    closeAbort: { signal: { aborted: false } },
    audioRecognition: { speaking: false, audioTranscript: '', runEOUDetection: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    cancelPreemptiveGeneration: vi.fn(),
    startFalseInterruptionTimer: vi.fn(),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

describe('LiveKit end of turn on an unfinished sentence (patched)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not reply to "We don\'t get" while the caller may go on', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "We don't get";
    expect(await fn.call(a, { newTranscript: "We don't get" })).toBe(false); // not committed
    expect(a.createSpeechTask).not.toHaveBeenCalled();
  });

  it('answers the joined sentence once when the caller goes on', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "We don't get";
    await fn.call(a, { newTranscript: "We don't get" });
    // ink's next final joins the pending words; its end of turn commits them.
    a.audioRecognition.audioTranscript = "We don't get caught up in reviews.";
    expect(await fn.call(a, { newTranscript: "We don't get caught up in reviews." })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DANGLING_HOLD_MS + UNPUNCTUATED_HOLD_MS);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled(); // the hold was dropped
  });

  it('answers the fragment after the hold when the caller says nothing more', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = "I don't say she goes";
    await fn.call(a, { newTranscript: "I don't say she goes" });
    vi.advanceTimersByTime(UNPUNCTUATED_HOLD_MS - 1);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a.audioRecognition.runEOUDetection).toHaveBeenCalledTimes(1);
    // The re-run reaches onEndOfTurn with the same words: now it commits.
    expect(await fn.call(a, { newTranscript: "I don't say she goes" })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
  });

  it('leaves a turn alone while the caller is speaking again', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    a.audioRecognition.audioTranscript = 'When you go to sleep, what do you dream';
    await fn.call(a, { newTranscript: 'When you go to sleep, what do you dream' });
    a.audioRecognition.speaking = true;
    vi.advanceTimersByTime(DANGLING_HOLD_MS);
    expect(a.audioRecognition.runEOUDetection).not.toHaveBeenCalled();
  });

  it('answers finished turns without waiting', async () => {
    const fn = await onEndOfTurn();
    const a = activity();
    expect(await fn.call(a, { newTranscript: 'Why do you keep forgetting?' })).toBe(true);
    expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
  });
});
