/**
 * Fault injection against the real LiveKit AgentSession: each way a reply can
 * fail is forced, and the caller must hear a fallback line within budget
 * (never-silent.ts). The session has a scripted LLM, a fake TTS and an audio
 * sink, so agent states, speech handles and playout are LiveKit's own.
 */
import {
  APIConnectionError,
  DEFAULT_API_CONNECT_OPTIONS,
  initializeLogger,
  llm,
  tts,
  voice,
} from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FALLBACK_LINES } from '../never-silent.js';
import { installNeverSilent } from '../never-silent-install.js';

const SAMPLE_RATE = 24_000;
const BUDGET_MS = 2500;

type Step = 'ok' | 'fail' | 'hang' | 'tool';

/** One scripted behaviour per LLM call; the last one repeats. */
class ScriptedLLM extends llm.LLM {
  calls = 0;
  constructor(private readonly script: Step[]) {
    super();
  }
  label(): string {
    return 'scripted';
  }
  chat(params: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    return new ScriptedStream(this, step, {
      chatCtx: params.chatCtx,
      toolCtx: params.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}

class ScriptedStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly step: Step,
    opts: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, opts);
    // LiveKit's LLMStream rethrows a failed request from a task nobody awaits;
    // the agent logs that as an unhandled rejection. Keep it out of vitest.
    const self = this as unknown as { mainTask: () => Promise<void> };
    const main = self.mainTask;
    self.mainTask = () => main().catch(() => undefined);
  }
  protected async run(): Promise<void> {
    if (this.step === 'fail')
      throw new APIConnectionError({ message: 'model down', options: { retryable: false } });
    if (this.step === 'hang')
      return new Promise<void>((resolve) => {
        this.abortController.signal.addEventListener('abort', () => resolve());
      });
    const delta: llm.ChoiceDelta =
      this.step === 'tool'
        ? {
            role: 'assistant',
            toolCalls: [llm.FunctionCall.create({ callId: 'c1', name: 'lookup', args: '{}' })],
          }
        : { role: 'assistant', content: 'Sure, happy to help.' };
    this.queue.put({ id: 'r', delta });
  }
}

/**
 * Synthesizes 1 s of a voiced tone per request; while `down` it returns no
 * audio, as the TTS gateway does when a request fails. (A thrown error here
 * would be re-emitted by LiveKit's StreamAdapter, which nothing listens to:
 * prod's Cartesia TTS streams and has no adapter.) While `garbled` it returns
 * 23 ms of noise, what the Cartesia plugin makes of a failed REST request.
 */
class FakeTTS extends tts.TTS {
  label = 'fake-tts';
  down = false;
  garbled = false;
  requests = 0;
  constructor() {
    super(SAMPLE_RATE, 1, { streaming: false });
  }
  synthesize(text: string): tts.ChunkedStream {
    this.requests += 1;
    return new FakeChunked(text, this, this.down, this.garbled);
  }
  stream(): tts.SynthesizeStream {
    throw new Error('not streaming');
  }
}

class FakeChunked extends tts.ChunkedStream {
  label = 'fake-tts';
  constructor(
    text: string,
    ttsModel: tts.TTS,
    private readonly down: boolean,
    private readonly garbled: boolean
  ) {
    super(text, ttsModel, { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 });
  }
  protected async run(): Promise<void> {
    if (this.down) return;
    const samples = this.garbled ? 552 : SAMPLE_RATE;
    const data = Int16Array.from({ length: samples }, (_, i) =>
      this.garbled ? 0x7b22 : Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE))
    );
    const frame = new AudioFrame(data, SAMPLE_RATE, 1, samples);
    this.queue.put({ requestId: 'r', segmentId: 's', frame, final: true });
  }
}

/** An audio sink that "plays" each segment instantly and records what it played. */
class FakeAudioOutput extends voice.AudioOutput {
  frames = 0;
  samples = 0;
  private playing = false;
  constructor() {
    super(SAMPLE_RATE);
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    await super.captureFrame(frame);
    this.frames += 1;
    this.samples += frame.samplesPerChannel;
    if (!this.playing) {
      this.playing = true;
      this.onPlaybackStarted(Date.now());
    }
  }
  flush(): void {
    super.flush();
    setTimeout(() => this.finish(false), 20);
  }
  clearBuffer(): void {
    this.finish(true);
  }
  private finish(interrupted: boolean): void {
    this.playing = false;
    this.onPlaybackFinished({ playbackPosition: 0.2, interrupted });
  }
}

class ToolAgent extends voice.Agent {
  constructor(private readonly crash = false) {
    super({
      instructions: 'test',
      tools: {
        lookup: llm.tool({
          description: 'Look something up',
          parameters: z.object({}),
          execute: async () => {
            throw new Error('tool exploded');
          },
        }),
      },
    });
  }
  async llmNode(...args: Parameters<voice.Agent['llmNode']>): ReturnType<voice.Agent['llmNode']> {
    // The 2026-10-11 incident: a package pruned from the image, thrown inside the turn.
    if (this.crash) throw new Error("Cannot find package 'suffix-thumb' (ERR_MODULE_NOT_FOUND)");
    return super.llmNode(...args);
  }
}

interface Harness {
  session: voice.AgentSession;
  ttsModel: FakeTTS;
  out: FakeAudioOutput;
  log: Array<Record<string, unknown>>;
  /** Ask as the caller; resolves with ms from the commit to the fallback line, or null. */
  ask: (text: string, waitMs?: number) => Promise<number | null>;
}

const open: voice.AgentSession[] = [];

async function harness(
  script: Step[],
  opts: { mode?: string; crash?: boolean; hangMs?: string } = {}
): Promise<Harness> {
  const ttsModel = new FakeTTS();
  const session = new voice.AgentSession({ llm: new ScriptedLLM(script), tts: ttsModel });
  const out = new FakeAudioOutput();
  session.output.audio = out;
  open.push(session);
  // agent-setup.ts listens for session errors; an unheard 'error' event throws.
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  await session.start({ agent: new ToolAgent(opts.crash) });
  const log: Array<Record<string, unknown>> = [];
  const input = {
    session,
    sessionWithEvents: session as never,
    sessionEventHandlers: [],
    cleanupFunctions: [],
    sessionId: `ns-${open.length}`,
    userId: undefined,
  };
  installNeverSilent(input, {
    NEVER_SILENT: opts.mode ?? 'on',
    NEVER_SILENT_HANG_MS: opts.hangMs ?? '1000',
  });

  const ask = async (text: string, waitMs = 3000): Promise<number | null> => {
    let committedAt = 0;
    let fallbackAt: number | null = null;
    const onItem = (ev: { item: { role?: string; textContent?: string } }) => {
      if (ev.item.role === 'user' && ev.item.textContent === text) committedAt = Date.now();
      if (ev.item.role === 'assistant' && FALLBACK_LINES.some((l) => l === ev.item.textContent))
        fallbackAt ??= Date.now();
    };
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, onItem as never);
    try {
      session.generateReply({ userInput: text });
    } catch {
      // a crashing turn still commits the caller's message
    }
    await new Promise((r) => {
      setTimeout(r, waitMs);
    });
    session.off(voice.AgentSessionEventTypes.ConversationItemAdded, onItem as never);
    return fallbackAt === null ? null : fallbackAt - committedAt;
  };
  return { session, ttsModel, out, log, ask };
}

describe('never silent: fault injection on a real AgentSession', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    await Promise.all(open.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('a healthy turn gets its own reply and no fallback', async () => {
    const h = await harness(['ok']);
    expect(await h.ask('how are you', 1500)).toBeNull();
  });

  it('LLM error: speaks a fallback within the budget', async () => {
    const h = await harness(['ok', 'fail']);
    await h.ask('warm up', 800);
    const ms = await h.ask('what about tomorrow');
    expect(ms).not.toBeNull();
    expect(ms!).toBeLessThan(BUDGET_MS);
  });

  it('a crash inside the turn (llmNode throws): speaks a fallback within the budget', async () => {
    const h = await harness(['ok'], { crash: true });
    const ms = await h.ask('are you there');
    expect(ms).not.toBeNull();
    expect(ms!).toBeLessThan(BUDGET_MS);
  });

  it('TTS gateway down: the pre-rendered fallback still plays', async () => {
    const h = await harness(['ok']);
    await h.ask('warm up', 1000); // first reply, then the lines are rendered
    const rendered = h.ttsModel.requests;
    expect(rendered).toBeGreaterThanOrEqual(1 + FALLBACK_LINES.length);
    h.ttsModel.down = true;
    const framesBefore = h.out.frames;
    const ms = await h.ask('tell me more');
    expect(ms).not.toBeNull();
    expect(ms!).toBeLessThan(BUDGET_MS);
    expect(h.out.frames).toBeGreaterThan(framesBefore); // audio reached the caller with TTS down
  });

  it('a near-empty rendering (action-claim-b, 23 ms) is not played: live TTS speaks the line', async () => {
    const h = await harness(['ok', 'hang'], { hangMs: '1000' });
    h.ttsModel.garbled = true; // the renders after the first reply come back as noise
    await h.ask('warm up', 1000);
    h.ttsModel.garbled = false;
    const samplesBefore = h.out.samples;
    const ms = await h.ask('are you still there', 3000);
    expect(ms).not.toBeNull();
    // Pre-fix the 552-sample rendering played: 23 ms. Now the line is a real second of voice.
    expect(((h.out.samples - samplesBefore) / SAMPLE_RATE) * 1000).toBeGreaterThanOrEqual(1000);
  });

  it('hung model: interrupts it and speaks a fallback at the hang deadline', async () => {
    const h = await harness(['hang'], { hangMs: '1000' });
    const ms = await h.ask('hello?');
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(1000);
    expect(ms!).toBeLessThan(BUDGET_MS);
  });

  it('tool exception and then a failed reply: speaks a fallback after the tool', async () => {
    const h = await harness(['tool', 'fail'], { hangMs: '1000' });
    const ms = await h.ask('look it up');
    expect(ms).not.toBeNull();
    expect(ms!).toBeLessThan(BUDGET_MS);
  });

  it('a reply interrupted on purpose gets no fallback', async () => {
    const h = await harness(['hang'], { hangMs: '1000' });
    setTimeout(() => h.session.interrupt(), 200); // e.g. the noise filter
    expect(await h.ask('click', 2000)).toBeNull();
  });

  it('NEVER_SILENT off: the same failure is silent (the bug this fixes)', async () => {
    const h = await harness(['fail'], { mode: 'off' });
    expect(await h.ask('anyone home', 2000)).toBeNull();
  });
});
