/**
 * PREEMPTIVE_TTS through LiveKit's own reply pipeline (agents 1.9.3, patched)
 * and our gateway TTS node: a real AgentSession with preemptive generation and
 * preemptiveTts from preemptive-tts.ts, a ttsNode that is the gateway node
 * (continuation path, real CartesiaReplyStream), the turn receipt and the
 * first-audio listener. Only the Cartesia socket, the LLM and the room's
 * audio output are fakes.
 *
 * A reused preemptive reply starts playing with its audio already made, and
 * its receipt carries its own TTFB. A dropped one plays nothing, its Cartesia
 * context is cancelled at the commit, and its first audio reaches neither the
 * receipt nor the first-audio listener (preemptive-reply-gate.ts).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { preemptiveGenerationOverrides } from '../../../agents/multi-agent/preemptive-tts.js';
import {
  attachTurnReceipts,
  noteRequest,
  type TurnReceipt,
} from '../../../agents/shared/turn-receipt.js';

/** Per test word: when Cartesia's first audio comes, and when it finishes after the last text. */
const SPEED: Record<string, { firstMs: number; doneMs: number }> = {
  rate: { firstMs: 200, doneMs: 3000 }, // a long reply, still generating at the commit
  time: { firstMs: 200, doneMs: 30 },
  weather: { firstMs: 60, doneMs: 30 },
};

interface Context {
  id: string;
  word?: string;
  /** Every sample of this context's audio has this value, so played frames say whose they are. */
  value: number;
  sends: number;
  chunks: number;
  /** Characters of text sent (what Cartesia bills). */
  chars: number;
  /** When the last audio already asked for is due: Cartesia finishes after it. */
  audioUntil: number;
  firstChunkAt?: number;
  cancelledAt?: number;
}

const net = vi.hoisted(() => ({ contexts: new Map<string, unknown>() }));
const ctx = (id: string) => net.contexts.get(id) as Context;
const contexts = () => [...net.contexts.values()] as Context[];

vi.mock('../providers/cartesia-socket.js', () => ({
  CartesiaSocket: class {
    connect(): Promise<void> {
      return Promise.resolve();
    }
    async send(
      id: string,
      request: { transcript: string; continue: boolean },
      handler: { onChunk: (pcm: ArrayBuffer) => void; onDone: () => void }
    ): Promise<void> {
      let c = ctx(id);
      if (!c) {
        const value = 1000 * (net.contexts.size + 1);
        c = { id, value, sends: 0, chunks: 0, chars: 0, audioUntil: Date.now() };
        net.contexts.set(id, c);
      }
      c.word ??= Object.keys(SPEED).find((w) => request.transcript.toLowerCase().includes(w));
      const speed = SPEED[c.word ?? 'weather'];
      const live = (fn: () => void) => () => c.cancelledAt === undefined && fn();
      c.chars += request.transcript.trim().length;
      if (request.transcript.trim()) {
        // In order, as Cartesia streams a context: each piece's audio after the last one's.
        const ms = c.sends === 0 ? speed.firstMs : Math.max(0, c.audioUntil - Date.now()) + 10;
        c.audioUntil = Date.now() + ms;
        setTimeout(
          live(() => {
            c.chunks += 1;
            c.firstChunkAt ??= Date.now();
            handler.onChunk(new Int16Array(4 * 480).fill(c.value).buffer as ArrayBuffer);
          }),
          ms
        );
      }
      c.sends += 1;
      if (!request.continue) {
        setTimeout(live(handler.onDone), c.audioUntil - Date.now() + speed.doneMs);
      }
    }
    cancel(id: string): void {
      const c = ctx(id);
      if (c) c.cancelledAt ??= Date.now();
    }
    release(): void {}
  },
}));

// The PREEMPTIVE_TTS_DROPPED lines (first-audio-observer.ts), recorded; logging is unchanged.
const dropLogs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const createLogger: typeof actual.createLogger = (...args) =>
    new Proxy(actual.createLogger(...args), {
      get(target, key, receiver) {
        if (key !== 'info') return Reflect.get(target, key, receiver) as unknown;
        return (obj: Record<string, unknown>, msg?: string) => {
          if (msg === 'PREEMPTIVE_TTS_DROPPED') dropLogs.push(obj);
          return target.info(obj, msg);
        };
      },
    });
  return { ...actual, createLogger };
});

// What the caller's client is sent (reply_tone, reply-tone-signal.ts).
const signals = vi.hoisted(() => [] as Array<{ type: string; at: number }>);
vi.mock('../../../services/frontend-signal.js', () => ({
  sendFrontendSignal: async (type: string) => {
    signals.push({ type, at: Date.now() });
    return true;
  },
}));

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const { FakeLLM } = (await import(
  pathToFileURL(join(agentsDist, 'voice', 'testing', 'fake_llm.js')).href
)) as {
  FakeLLM: new (responses: Array<{ input: string; content: string }>) => llm.LLM;
};
const { createGatewayTTSNode } = await import('../gateway-tts-node.js');
const { onGatewayFirstAudio } = await import('../first-audio-observer.js');
const { loadReplySpeech } = await import('../preemptive-reply-gate.js');
const { directorSessions } = await import('../director/session-state.js');
const { quirkEvents, recordQuirk } = await import('../../../services/session/quirk-log.js');

/** The room's audio output: plays each frame at once and remembers it. */
class Output extends voice.AudioOutput {
  frames: Array<{ at: number; value: number }> = [];
  constructor() {
    super(24000);
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    this.frames.push({ at: Date.now(), value: frame.data[0] });
    if (this.capturedPlayoutSegments > before) this.onPlaybackStarted(Date.now());
  }
  flush(): void {
    super.flush();
    if (this.pendingPlayoutSegments > 0) {
      this.onPlaybackFinished({ playbackPosition: 0.1, interrupted: false });
    }
  }
  clearBuffer(): void {
    if (this.pendingPlayoutSegments > 0) {
      this.onPlaybackFinished({ playbackPosition: 0, interrupted: true });
    }
  }
}

/** FerniAgent's shape: llmNode notes the request for the receipt, ttsNode is the gateway. */
class GatewayAgent extends voice.Agent {
  constructor(private readonly sessionId: string) {
    super({ instructions: 'test' });
  }
  async llmNode(
    chatCtx: llm.ChatContext,
    toolCtx: llm.ToolContext,
    modelSettings: voice.ModelSettings
  ): ReturnType<voice.Agent['llmNode']> {
    noteRequest(this.session, chatCtx, { functionTools: toolCtx as never });
    return super.llmNode(chatCtx, toolCtx, modelSettings);
  }
  async ttsNode(text: NodeReadableStream<string>): Promise<NodeReadableStream<AudioFrame> | null> {
    const node = createGatewayTTSNode({
      voiceId: 'test-voice',
      sessionId: this.sessionId,
      personaId: 'ferni',
      enableCache: false,
      // As tts-wrapper.ts: what the Director reads, and where its added sounds go.
      turnContext: { turnNumber: 2, userRequest: 'my dad was just diagnosed with cancer' },
      onNonverbal: (added) => recordQuirk(this.sessionId, added),
    });
    return node(text);
  }
}

interface Activity {
  onPreemptiveGeneration: (info: object) => void;
  onEndOfTurn: (info: object) => Promise<boolean>;
}

let calls = 0;
const SIGH_RATE = "*sighs* Oh, I'm so sorry the rate went up again. It changes weekly.";
const SIGH_WEATHER = "*sighs* Oh, I'm so sorry the weather turned on you today.";

async function call() {
  const sessionId = `preemptive-${++calls}`;
  const session = new voice.AgentSession({
    llm: new FakeLLM([
      { input: 'what is the rate', content: 'The rate is five percent today. It changes weekly.' },
      { input: 'what is the time', content: 'The time is half past four right now.' },
      { input: 'what is the weather', content: 'The weather is sunny and warm today.' },
      { input: 'the rate went up', content: SIGH_RATE },
      { input: 'the weather turned', content: SIGH_WEATHER },
    ]),
    turnHandling: { ...preemptiveGenerationOverrides() },
    voiceOptions: { preemptiveGeneration: true }, // as call-session.ts
  });
  const output = new Output();
  session.output.audio = output;
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId,
    userId: undefined,
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
  });
  const firstAudio: number[] = [];
  const unlisten = onGatewayFirstAudio((sid, ttfbMs) => {
    if (sid === sessionId) firstAudio.push(ttfbMs);
  });
  await session.start({ agent: new GatewayAgent(sessionId) });
  const activity = (session as unknown as { _activity: Activity })._activity;
  const preempt = (newTranscript: string) =>
    activity.onPreemptiveGeneration({
      newTranscript,
      transcriptConfidence: 1,
      startedSpeakingAt: Date.now(),
    });
  const commit = (newTranscript: string) =>
    activity.onEndOfTurn({
      skipReply: false,
      newTranscript,
      transcriptConfidence: 1,
      transcriptionDelay: 0,
      endOfUtteranceDelay: 0,
      startedSpeakingAt: undefined,
      stoppedSpeakingAt: undefined,
    });
  const close = async () => {
    unlisten();
    detach();
    await session.close();
  };
  return { sessionId, output, receipts, firstAudio, preempt, commit, close };
}

const settle = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

beforeAll(async () => {
  initializeLogger({ pretty: false, level: 'silent' });
  await loadReplySpeech();
});

afterEach(() => {
  delete process.env.PREEMPTIVE_TTS;
  for (const k of Object.keys(DIRECTED)) delete process.env[k];
  net.contexts.clear();
  dropLogs.length = 0;
  signals.length = 0;
  vi.restoreAllMocks();
});

/** The Director live with its sounds, quirk awareness and the client's reply tone. */
const DIRECTED = {
  SPEECH_DIRECTOR: 'live',
  SPEECH_DIRECTOR_NONVERBAL: 'live',
  QUIRK_AWARENESS: 'on',
  AVATAR_REPLY_TONE: 'on',
};

/** The reply side effects a caller could see, or a later reply would read, with when each came. */
function sideEffects(sessionId: string) {
  const updates: number[] = [];
  const update = directorSessions.update.bind(directorSessions);
  vi.spyOn(directorSessions, 'update').mockImplementation((sid, persona, state) => {
    if (sid === sessionId) updates.push(Date.now());
    update(sid, persona, state);
  });
  return () => ({
    tones: signals.filter((x) => x.type === 'reply_tone').map((x) => x.at),
    quirks: quirkEvents(sessionId).map((q) => q.at),
    updates: [...updates],
  });
}

describe('PREEMPTIVE_TTS through the SDK and the gateway', () => {
  it('reused: the reply plays from audio made before the commit, and the receipt times it', async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const c = await call();
    try {
      c.preempt('what is the time');
      await vi.waitFor(() => expect(contexts()[0]?.chunks).toBeGreaterThan(0), { timeout: 3000 });
      await settle(50);
      // Synthesized, not played, and not yet marked as Ferni's first audio.
      expect(c.output.frames).toHaveLength(0);
      expect(c.firstAudio).toEqual([]);

      const committedAt = Date.now();
      await c.commit('what is the time');
      await vi.waitFor(() => expect(c.receipts).toHaveLength(1), { timeout: 5000 });

      expect(contexts()).toHaveLength(1); // the same context, no second synthesis
      const [{ value }] = contexts();
      expect(new Set(c.output.frames.map((f) => f.value))).toEqual(new Set([value]));
      // Cartesia's first audio takes 200 ms here: playing sooner means it was made before the commit.
      expect(c.output.frames[0].at - committedAt).toBeLessThan(100);
      expect(c.firstAudio).toHaveLength(1);
      const [{ timing }] = c.receipts;
      expect(timing.ttsTtfbMs).toBe(c.firstAudio[0]);
      expect(timing.ttsTtfbMs).toBeGreaterThanOrEqual(190);
      expect(timing.commitToAudioMs).toBeLessThan(100);
      expect(c.receipts[0].preemptive).toBe('reused'); // #1590's field: the A/B's split
      expect(dropLogs).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it('dropped: nothing of it plays, its Cartesia context is cancelled at once, and the receipt times the real reply', async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const c = await call();
    try {
      c.preempt('what is the rate');
      await vi.waitFor(() => expect(contexts()[0]?.chunks).toBeGreaterThan(0), { timeout: 3000 });
      await settle(50);
      const dropped = contexts()[0];
      expect(c.firstAudio).toEqual([]);

      const committedAt = Date.now();
      await c.commit('what is the weather');
      await vi.waitFor(() => expect(c.receipts).toHaveLength(1), { timeout: 5000 });

      // Stopped at the commit, not when its 3 s reply would have finished.
      expect(dropped.cancelledAt).toBeDefined();
      expect(dropped.cancelledAt! - committedAt).toBeLessThan(50); // ~105 ms on the stock path here
      const spoken = contexts().filter((x) => x !== dropped);
      expect(spoken).toHaveLength(1);
      expect(new Set(c.output.frames.map((f) => f.value))).toEqual(new Set([spoken[0].value]));
      // Only the reply that played reported first audio: the final one (60 ms), not the dropped (200 ms).
      expect(c.firstAudio).toHaveLength(1);
      expect(c.receipts[0].timing.ttsTtfbMs).toBe(c.firstAudio[0]);
      expect(c.receipts[0].timing.ttsTtfbMs).toBeLessThan(150);
      expect(c.receipts[0].preemptive).toBe('dropped');
      // Its cost is logged: the characters Cartesia was sent for it.
      expect(dropped.chars).toBeGreaterThan(0);
      expect(dropLogs.map((l) => l.sentChars)).toEqual([dropped.chars]);
    } finally {
      await c.close();
    }
  });

  it("ink-2's repeated eager ends: the same words keep the synthesis, new words cancel it", async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const c = await call();
    try {
      c.preempt('what is the rate');
      await vi.waitFor(() => expect(contexts()[0]?.chunks).toBeGreaterThan(0), { timeout: 3000 });
      c.preempt('What is the rate'); // the patch keeps a preemptive reply whose words match
      await settle(50);
      expect(contexts()).toHaveLength(1);
      expect(contexts()[0].cancelledAt).toBeUndefined();

      const replacedAt = Date.now();
      c.preempt('what is the time'); // the caller went on: a new preemptive reply
      await vi.waitFor(() => expect(contexts()).toHaveLength(2), { timeout: 3000 });
      expect(contexts()[0].cancelledAt! - replacedAt).toBeLessThan(50);
      expect(c.output.frames).toHaveLength(0);
      expect(c.firstAudio).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it('reused, Director live: tone, sounds and carry-over each once, after the commit', async () => {
    Object.assign(process.env, { PREEMPTIVE_TTS: 'on', ...DIRECTED });
    const c = await call();
    const seen = sideEffects(c.sessionId);
    try {
      c.preempt('the rate went up');
      await vi.waitFor(() => expect(contexts()[0]?.chunks).toBeGreaterThan(0), { timeout: 3000 });
      await settle(100); // the reply has been written, voiced and planned
      expect(seen()).toEqual({ tones: [], quirks: [], updates: [] });

      const committedAt = Date.now();
      await c.commit('the rate went up');
      await vi.waitFor(() => expect(c.receipts).toHaveLength(1), { timeout: 5000 });
      const after = seen();
      expect(after.tones).toHaveLength(1);
      expect(after.quirks).toHaveLength(1); // its opening sigh
      expect(after.updates).toHaveLength(1);
      for (const at of [...after.tones, ...after.quirks, ...after.updates]) {
        expect(at).toBeGreaterThanOrEqual(committedAt);
      }
    } finally {
      await c.close();
    }
  });

  it('dropped, Director live: no tone, sound or carry-over of its own', async () => {
    Object.assign(process.env, { PREEMPTIVE_TTS: 'on', ...DIRECTED });
    const c = await call();
    const seen = sideEffects(c.sessionId);
    try {
      c.preempt('the rate went up');
      await vi.waitFor(() => expect(contexts()[0]?.chunks).toBeGreaterThan(0), { timeout: 3000 });
      await settle(100);
      const committedAt = Date.now();
      await c.commit('the weather turned');
      await vi.waitFor(() => expect(c.receipts).toHaveLength(1), { timeout: 5000 });
      await settle(50);
      // Only the reply that played: one of each, all after the commit.
      const after = seen();
      expect(after.tones).toHaveLength(1);
      expect(after.updates).toHaveLength(1);
      expect(after.quirks.length).toBeLessThanOrEqual(1);
      for (const at of [...after.tones, ...after.quirks, ...after.updates]) {
        expect(at).toBeGreaterThanOrEqual(committedAt);
      }
    } finally {
      await c.close();
    }
  });

  it('off: the SDK starts the TTS only at the commit (the control arm)', async () => {
    const c = await call();
    try {
      c.preempt('what is the time');
      await settle(300);
      expect(contexts()).toHaveLength(0); // no synthesis before the commit
      const committedAt = Date.now();
      await c.commit('what is the time');
      await vi.waitFor(() => expect(c.receipts).toHaveLength(1), { timeout: 5000 });
      expect(c.output.frames[0].at - committedAt).toBeGreaterThanOrEqual(190);
      expect(c.firstAudio).toHaveLength(1);
      expect(c.receipts[0].timing.ttsTtfbMs).toBe(c.firstAudio[0]);
    } finally {
      await c.close();
    }
  });
});
