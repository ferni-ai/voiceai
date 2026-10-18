/**
 * TURN_RECEIPT `eot` against the real LiveKit 1.9.3 session: LiveKit's own
 * activity resolves the turn detector, falls back to v1-mini when LiveKit
 * Inference is unreachable, and its eot_prediction event lands on the turn it
 * decided, with the model actually used.
 */
import {
  DEFAULT_API_CONNECT_OPTIONS,
  inference,
  llm,
  tts,
  voice,
  type EOUMetrics,
} from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TurnReceiptRecorder, type TurnReceipt } from '../turn-receipt.js';
import { attachTurnReceipts } from '../turn-receipt-session.js';
import { endpointingDelays, registerLocalEotRunner } from '../turn-patience.js';

const RATE = 24_000;

class ReplyLLM extends llm.LLM {
  label(): string {
    return 'reply';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ReplyStream(this, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: DEFAULT_API_CONNECT_OPTIONS,
    });
  }
}
class ReplyStream extends llm.LLMStream {
  protected async run(): Promise<void> {
    this.queue.put({ id: 'r', delta: { role: 'assistant', content: 'Sure.' } });
  }
}
class SilentTTS extends tts.TTS {
  label = 'silent';
  constructor() {
    super(RATE, 1, { streaming: false });
  }
  synthesize(text: string): tts.ChunkedStream {
    return new SilentChunk(text, this);
  }
  stream(): tts.SynthesizeStream {
    throw new Error('not streaming');
  }
}
class SilentChunk extends tts.ChunkedStream {
  label = 'silent';
  constructor(text: string, model: tts.TTS) {
    super(text, model, { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 });
  }
  protected async run(): Promise<void> {
    const n = RATE / 10;
    this.queue.put({
      requestId: 'r',
      segmentId: 's',
      frame: new AudioFrame(new Int16Array(n), RATE, 1, n),
      final: true,
    });
  }
}
class InstantOutput extends voice.AudioOutput {
  private playing = false;
  constructor() {
    super(RATE);
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    await super.captureFrame(frame);
    if (!this.playing) {
      this.playing = true;
      this.onPlaybackStarted(Date.now());
    }
  }
  flush(): void {
    super.flush();
    setTimeout(() => this.done(false), 20);
  }
  clearBuffer(): void {
    this.done(true);
  }
  private done(interrupted: boolean): void {
    this.playing = false;
    this.onPlaybackFinished({ playbackPosition: 0.1, interrupted });
  }
}

interface Activity {
  _resolvedTurnDetection?: unknown;
  turnDetectionMode?: string;
  endpointingOpts: { minDelay: number; maxDelay: number };
  onEotPrediction(ev: voice.EotPredictionEvent): void;
}

const until = async (ok: () => boolean, ms: number): Promise<void> => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop -- polling the live session
    await new Promise((r) => {
      setTimeout(r, 25);
    });
  }
};

describe('TURN_RECEIPT eot on a real session with the cloud detector', () => {
  let session: voice.AgentSession;
  let detector: inference.TurnDetector;
  const receipts: TurnReceipt[] = [];
  let detach: () => void;

  beforeAll(async () => {
    registerLocalEotRunner();
    const { VAD } = await import('@livekit/agents-plugin-silero');
    // LiveKit Inference unreachable: nothing listens on port 9.
    detector = new inference.TurnDetector({
      version: 'v1',
      apiKey: 'key',
      apiSecret: 'secret',
      baseUrl: 'http://127.0.0.1:9',
    });
    session = new voice.AgentSession({
      llm: new ReplyLLM(),
      tts: new SilentTTS(),
      vad: await VAD.load(),
      turnDetection: detector,
      voiceOptions: endpointingDelays({ TURN_DETECTOR: 'cloud' }),
    });
    session.output.audio = new InstantOutput();
    session.on(voice.AgentSessionEventTypes.Error, () => undefined);
    detach = attachTurnReceipts(session as never, {
      sessionId: 's1',
      userId: undefined,
      persona: () => 'ferni',
      emit: (r) => receipts.push(r),
    });
    await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
  }, 60_000);

  afterAll(async () => {
    detach?.();
    await session?.close();
  });

  const activity = (): Activity => (session as unknown as { _activity: Activity })._activity;

  it('LiveKit resolves our detector, so ink-2 end-of-speech events no longer drive the turn', () => {
    expect(activity()._resolvedTurnDetection).toBe(detector);
    // Only 'stt' mode reads the STT's own START/END_OF_SPEECH (audio_recognition.ts).
    expect(activity().turnDetectionMode).toBeUndefined();
    expect(activity().endpointingOpts).toMatchObject({ minDelay: 300, maxDelay: 2000 });
  });

  it('falls back to v1-mini when LiveKit Inference is unreachable', async () => {
    await until(() => detector.model === 'turn-detector-v1-mini', 10_000);
    expect(detector.model).toBe('turn-detector-v1-mini');
  }, 15_000);

  it("puts the turn's prediction and the model actually used on the receipt", async () => {
    await until(() => detector.model === 'turn-detector-v1-mini', 10_000);
    // The hook LiveKit's AudioRecognition calls before it commits a turn.
    activity().onEotPrediction(
      voice.createEotPredictionEvent({
        probability: 0.1234,
        threshold: 0.3,
        inferenceDurationMs: 4,
        delayMs: 41.6,
      })
    );
    session.generateReply({ userInput: 'so that was fun' });
    await until(() => receipts.length >= 1, 10_000);
    expect(receipts[0].eot).toEqual({
      model: 'turn-detector-v1-mini',
      probability: 0.123,
      threshold: 0.3,
      delayMs: 42,
    });

    // The next turn had no prediction of its own: no eot, not the last one's.
    session.generateReply({ userInput: 'and another thing' });
    await until(() => receipts.length >= 2, 10_000);
    expect(receipts[1]).not.toHaveProperty('eot');
  }, 30_000);
});

describe('TURN_RECEIPT eot recorder', () => {
  const eou = { type: 'eou_metrics', lastSpeakingTimeMs: 1 } as unknown as EOUMetrics & {
    type: string;
  };
  const call = { model: 'turn-detector-v1', probability: 0.9, threshold: 0.3, delayMs: 10 };

  function recorder(clock: { t: number }, out: TurnReceipt[]): TurnReceiptRecorder {
    return new TurnReceiptRecorder({
      sessionId: 's',
      userId: undefined,
      persona: () => null,
      emit: (r) => out.push(r),
      now: () => clock.t,
    });
  }

  it('has no eot key without a model, so receipts with the flags off are unchanged', () => {
    const out: TurnReceipt[] = [];
    const rec = recorder({ t: 0 }, out);
    rec.onMetric(eou);
    rec.flush();
    expect(Object.keys(out[0])).not.toContain('eot');
  });

  it('drops a prediction from an earlier pause', () => {
    const clock = { t: 0 };
    const out: TurnReceipt[] = [];
    const rec = recorder(clock, out);
    rec.onEot(call);
    clock.t = 6001;
    rec.onMetric(eou);
    rec.flush();
    expect(out[0]).not.toHaveProperty('eot');
  });

  it('keeps the last prediction before the commit', () => {
    const clock = { t: 0 };
    const out: TurnReceipt[] = [];
    const rec = recorder(clock, out);
    rec.onEot({ ...call, probability: 0.1 });
    clock.t = 2000;
    rec.onEot(call);
    clock.t = 2300;
    rec.onMetric(eou);
    rec.onItem({ role: 'user' });
    rec.flush();
    expect(out).toHaveLength(1);
    expect(out[0].eot).toEqual(call);
  });
});
