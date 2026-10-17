/**
 * Every side effect of voicing a reply that a caller could see, or that would
 * change a later reply, waits for LiveKit to schedule a preemptive reply and
 * is never made for a dropped one (preemptive-reply-gate.ts). Each runs here
 * inside a real LiveKit SpeechHandle's async context, as ttsNode does.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeLogger, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const signals = vi.hoisted(() => [] as Array<{ type: string; at: number }>);
vi.mock('../../../services/frontend-signal.js', () => ({
  sendFrontendSignal: async (type: string) => {
    signals.push({ type, at: Date.now() });
    return true;
  },
}));

const { loadReplySpeech } = await import('../preemptive-reply-gate.js');
const { sendReplyTone } = await import('../reply-tone-signal.js');
const { clearInterruptFlags } = await import('../../../agents/shared/tts-wrapper.js');
const { getSessionHistory, recordLaugh, resetLaughterSession } =
  await import('../../adaptive-ssml/contextual-laughter.js');
const { getTurnProfiler, markTurnCheckpoint } =
  await import('../../../services/performance/turn-profiler.js');
const { noteReplyLead, registerBargeInJudge } =
  await import('../../graceful-interrupt/barge-in-judge.js');

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const { speechHandleStorage } = (await import(
  pathToFileURL(join(agentsDist, 'voice', 'agent.js')).href
)) as { speechHandleStorage: { run: <T>(store: unknown, fn: () => T) => T } };

type Handle = voice.SpeechHandle & { _markScheduled(): void; _cancel(): void };

const SID = 'effects-1';
const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** Voice one reply's side effects inside `handle`, and say what each did. */
function voiceReply(handle: Handle) {
  const userData: Record<string, unknown> = { wasInterrupted: true, interruptType: 'hard' };
  const leads: number[] = [];
  const unregister = registerBargeInJudge(SID, {
    onReplyLead: (ms: number) => leads.push(ms),
  } as never);
  const mark = vi.spyOn(getTurnProfiler(), 'mark').mockImplementation(() => undefined);
  resetLaughterSession(SID);
  const calledAt = Date.now();
  speechHandleStorage.run(handle, () => {
    sendReplyTone({ emotion: 'calm', speed: 1 }, SID);
    clearInterruptFlags({ session: { userData } } as never);
    recordLaugh(SID, 4);
    markTurnCheckpoint(SID, 4, 'ttsStart');
    noteReplyLead(SID, 300);
  });
  const effects = () => ({
    tones: signals.filter((s) => s.type === 'reply_tone').length,
    flagsCleared: userData.wasInterrupted === false,
    laughs: getSessionHistory(SID).laughCount,
    marks: mark.mock.calls.map((c) => c.slice(2)),
    leads,
  });
  const done = () => {
    unregister();
    mark.mockRestore();
  };
  return { effects, calledAt, done };
}

const NONE = { tones: 0, flagsCleared: false, laughs: 0, marks: [], leads: [] };

beforeAll(async () => {
  initializeLogger({ pretty: false, level: 'silent' });
  await loadReplySpeech();
  process.env.AVATAR_REPLY_TONE = 'on';
});

afterEach(() => {
  delete process.env.PREEMPTIVE_TTS;
  signals.length = 0;
});

describe('a preemptive reply’s side effects (PREEMPTIVE_TTS=on)', () => {
  it('dropped: none of them happen', async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const handle = voice.SpeechHandle.create() as Handle;
    const reply = voiceReply(handle);
    await flush();
    expect(reply.effects()).toEqual(NONE);
    handle._cancel(); // LiveKit drops it at the commit
    await flush();
    expect(reply.effects()).toEqual(NONE);
    reply.done();
  });

  it('reused: each happens exactly once, after it is scheduled, timed when it happened', async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const handle = voice.SpeechHandle.create() as Handle;
    const reply = voiceReply(handle);
    await new Promise((resolve) => {
      setTimeout(resolve, 40); // the commit comes a while after TTS started
    });
    expect(reply.effects()).toEqual(NONE);
    handle._markScheduled(); // LiveKit reuses it at the commit
    await flush();
    expect(reply.effects()).toEqual({
      tones: 1,
      flagsCleared: true,
      laughs: 1,
      marks: [['ttsStart', expect.any(Number)]],
      leads: [300],
    });
    // The checkpoint keeps the time TTS started, not the time of the commit.
    const [[, at]] = reply.effects().marks as Array<[string, number]>;
    expect(at - reply.calledAt).toBeLessThan(20);
    handle._markScheduled();
    await flush();
    expect(reply.effects().tones).toBe(1);
    reply.done();
  });

  it('off: each happens at once, as before', () => {
    const handle = voice.SpeechHandle.create() as Handle;
    const reply = voiceReply(handle);
    expect(reply.effects()).toEqual({
      tones: 1,
      flagsCleared: true,
      laughs: 1,
      marks: [['ttsStart', expect.any(Number)]],
      leads: [300],
    });
    reply.done();
  });
});
