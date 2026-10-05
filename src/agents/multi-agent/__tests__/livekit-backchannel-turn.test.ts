/**
 * Pins our @livekit/agents patch (patches/@livekit__agents@1.5.1.patch): a
 * caller's "mm-hmm" over Ferni's reply doesn't end the reply.
 *
 * Dev, 2026-09-30 (rounds 6 and 8, playful scenario): the caller's "mm-hmm"
 * paused Ferni, LiveKit's barge-in model rightly called it a backchannel, but
 * ink-2 transcribed it ("M M M.") and it was committed as a turn: Ferni stopped
 * mid-sentence ("How about a scratch-off map of historic") and answered "M M M."
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));

type OnEndOfTurn = (this: unknown, info: { newTranscript: string }) => Promise<boolean>;

async function onEndOfTurn(): Promise<OnEndOfTurn> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { onEndOfTurn: OnEndOfTurn } };
  };
  return mod.AgentActivity.prototype.onEndOfTurn;
}

/** The parts of an AgentActivity that onEndOfTurn reads. */
function activity(paused: boolean) {
  return {
    agentSession: {
      amd: undefined,
      sessionOptions: { turnHandling: { interruption: { minWords: 0 } } },
    },
    schedulingPaused: false,
    newTurnsBlocked: false,
    stt: {},
    turnDetection: 'stt',
    _currentSpeech: undefined,
    pausedSpeech: paused ? { handle: { interrupted: false }, timeout: 2000 } : undefined,
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    cancelPreemptiveGeneration: vi.fn(),
    startFalseInterruptionTimer: vi.fn(),
    createSpeechTask: vi.fn(() => ({ done: false })),
    userTurnCompleted: vi.fn(),
  };
}

type OnFinalTranscript = (this: unknown, ev: unknown, speaking?: boolean) => void;

async function onFinalTranscript(): Promise<OnFinalTranscript> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { onFinalTranscript: OnFinalTranscript } };
  };
  return mod.AgentActivity.prototype.onFinalTranscript;
}

describe('LiveKit final transcript over a paused reply (patched)', () => {
  // Round 9: every final transcript cancelled the pause (interrupting the reply)
  // before onEndOfTurn ran, so the end-of-turn check never saw a paused reply.
  it('keeps the reply paused for "mm-hmm" and cancels the pause for real words', async () => {
    const fn = await onFinalTranscript();
    for (const [said, cancels] of [
      ['M M M.', false],
      ['Yeah.', false],
      ['Wait, hold on.', true],
    ] as const) {
      const a = {
        ...activity(true),
        agentSession: {
          amd: undefined,
          emit: vi.fn(),
          sessionOptions: { turnHandling: { interruption: { falseInterruptionTimeout: 2000 } } },
        },
        audioRecognition: {},
        interruptByAudioActivity: vi.fn(),
        cancelSpeechPause: vi.fn(async () => undefined),
      };
      fn.call(a, { alternatives: [{ text: said, language: 'en' }] }, true);
      expect(a.cancelSpeechPause).toHaveBeenCalledTimes(cancels ? 1 : 0);
    }
  });
});

describe('LiveKit backchannel over a paused reply (patched)', () => {
  it('drops "mm-hmm" and lets the paused reply resume', async () => {
    vi.useFakeTimers();
    try {
      const fn = await onEndOfTurn();
      for (const said of ['M M M.', 'Mm-hmm.', 'Yeah, right.', 'uh-huh']) {
        const a = activity(true);
        expect(await fn.call(a, { newTranscript: said })).toBe(true);
        expect(a.createSpeechTask).not.toHaveBeenCalled();
        // resumes 350 ms on (not the 2 s default, and not at once over "Yeah, so...")
        vi.advanceTimersByTime(350);
        expect(a.startFalseInterruptionTimer).toHaveBeenCalledWith(0);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('still takes a real turn, and a backchannel when nothing was paused', async () => {
    const fn = await onEndOfTurn();
    for (const [said, paused] of [
      ['Wait, she hates surprises.', true],
      ['Yeah, no, not that one.', true],
      ['Mm-hmm.', false],
    ] as const) {
      const a = activity(paused);
      await fn.call(a, { newTranscript: said });
      expect(a.createSpeechTask).toHaveBeenCalledTimes(1);
    }
  });
});
