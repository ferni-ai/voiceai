/**
 * REPLY_NOT_RECORDED at a pause for the caller, through a real LiveKit
 * AgentSession (our patched SDK) and the real TranscriptionSynchronizer.
 *
 * Prod 2026-10-14..17: 9 of the 12 REPLY_NOT_RECORDED lines fired ~0.1-0.6 s
 * after Ferni's first audio, when the caller's voice made LiveKit pause the
 * reply (interruptByAudioActivity), which also sets the agent state to
 * "listening". The receipt took that as the end of the reply. Each reply then
 * resumed (false interruption) or was cut, and its item reached the history:
 * the next request carried one more assistant item every time.
 */
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { attachTurnReceipts, type TurnReceipt } from '../../shared/turn-receipt.js';
import { interruptionOverrides } from '../interruption-config.js';
import { MS_PER_CHAR, PacedTTS, SAMPLE_RATE } from './fake-room-audio.js';

const sdkDist = join(dirname(createRequire(import.meta.url).resolve('@livekit/agents')), 'voice');
const { TranscriptionSynchronizer } = (await import(
  join(sdkDist, 'transcription/synchronizer.js')
)) as {
  TranscriptionSynchronizer: new (
    a: unknown,
    t: unknown
  ) => { audioOutput: voice.AudioOutput; textOutput: unknown };
};

const { Future, Task } = (await import(join(dirname(sdkDist), 'utils.js'))) as {
  Future: new () => { done: boolean; await: Promise<unknown>; resolve(v?: unknown): void };
  Task: {
    from(fn: (c: AbortController) => Promise<void>): {
      done: boolean;
      result: Promise<void>;
      cancel(): void;
    };
  };
};
const FRAME_MS = 20;
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** rtc AudioSource stand-in: a 1 s queue drained in real time, same waiter semantics. */
class FakeAudioSource {
  private queuedMs = 0;
  private promise?: Promise<void>;
  private resolveP?: () => void;
  private readonly ticker = setInterval(() => {
    if (this.queuedMs > 0) this.queuedMs = Math.max(0, this.queuedMs - FRAME_MS);
    if (this.queuedMs === 0) this.release();
  }, FRAME_MS);
  get queuedDuration(): number {
    return this.queuedMs;
  }
  private release(): void {
    if (!this.promise) return;
    this.resolveP?.();
    this.promise = undefined;
    this.resolveP = undefined;
  }
  clearQueue(): void {
    this.queuedMs = 0;
    this.release();
  }
  async waitForPlayout(): Promise<void> {
    if (this.promise) await this.promise;
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    while (this.queuedMs >= 1000) await sleep(FRAME_MS);
    this.queuedMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
    if (!this.promise)
      this.promise = new Promise((r) => {
        this.resolveP = r;
      });
  }
  close(): void {
    clearInterval(this.ticker);
  }
}

/** room_io/_output.js ParticipantAudioOutput, verbatim apart from the source and start (as in lost-reply-drift). */
class RoomAudioOutput extends voice.AudioOutput {
  audioSource = new FakeAudioSource();
  flushTask?: { done: boolean; result: Promise<void>; cancel(): void };
  flushPushedDuration?: number;
  pushedDuration = 0;
  startedFuture = new Future();
  interruptedFuture = new Future();
  firstFrameEmitted = false;
  playbackEnabledFuture = new Future();
  constructor() {
    super(SAMPLE_RATE, undefined, { pause: true });
    this.playbackEnabledFuture.resolve();
    this.startedFuture.resolve();
  }
  pause(): void {
    if (this.playbackEnabledFuture.done) this.playbackEnabledFuture = new Future();
    this.audioSource.clearQueue();
    super.pause();
  }
  resume(): void {
    if (!this.playbackEnabledFuture.done) this.playbackEnabledFuture.resolve();
    this.firstFrameEmitted = false;
    super.resume();
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    await this.startedFuture.await;
    if (!this.playbackEnabledFuture.done) {
      this.audioSource.clearQueue();
      await Promise.race([this.playbackEnabledFuture.await, this.interruptedFuture.await]);
      if (this.interruptedFuture.done) return;
    }
    void super.captureFrame(frame);
    if (!this.firstFrameEmitted) {
      this.firstFrameEmitted = true;
      this.onPlaybackStarted(Date.now());
    }
    this.pushedDuration += frame.samplesPerChannel / frame.sampleRate;
    await this.audioSource.captureFrame(frame);
  }
  async waitForPlayoutTask(abortController: AbortController): Promise<void> {
    const accountedDuration = this.pushedDuration;
    const abortFuture = new Future();
    this.interruptedFuture = new Future();
    const resolveAbort = () => {
      if (!abortFuture.done) abortFuture.resolve(true);
    };
    abortController.signal.addEventListener('abort', resolveAbort);
    void this.audioSource.waitForPlayout().finally(() => {
      abortController.signal.removeEventListener('abort', resolveAbort);
      if (!abortFuture.done) abortFuture.resolve(false);
    });
    const aborted = await Promise.race([
      abortFuture.await,
      this.interruptedFuture.await.then(() => true),
    ]);
    const interrupted = this.interruptedFuture.done || Boolean(aborted);
    let pushedDuration = accountedDuration;
    if (interrupted) {
      pushedDuration = Math.max(accountedDuration - this.audioSource.queuedDuration / 1e3, 0);
      this.audioSource.clearQueue();
    }
    this.pushedDuration = 0;
    this.firstFrameEmitted = false;
    this.onPlaybackFinished({ playbackPosition: pushedDuration, interrupted });
  }
  flush(): void {
    super.flush();
    if (!this.pushedDuration) return;
    if (this.flushTask && !this.flushTask.done) {
      if (this.flushPushedDuration === this.pushedDuration) return;
      this.flushTask.cancel();
    }
    this.flushPushedDuration = this.pushedDuration;
    const flushTask = Task.from((controller) => this.waitForPlayoutTask(controller));
    this.flushTask = flushTask;
    void flushTask.result
      .finally(() => {
        if (this.flushTask === flushTask) this.flushPushedDuration = undefined;
      })
      .catch(() => undefined);
  }
  clearBuffer(): void {
    if (!this.interruptedFuture.done) this.interruptedFuture.resolve();
  }
}

const REPLIES = [
  'Alright, so you start with breakfast at her place, then the park.',
  'Sure, I can do that.',
];
const LLM_MS = 200;

class ScriptLLM extends llm.LLM {
  private n = 0;
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ScriptStream(this, REPLIES[this.n++ % REPLIES.length], {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ScriptStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly text: string,
    o: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, o);
  }
  protected async run(): Promise<void> {
    await sleep(LLM_MS);
    this.queue.put({ id: 'r', delta: { role: 'assistant', content: this.text } });
  }
}

class TextSink {
  async captureText(): Promise<void> {}
  flush(): void {}
  onAttached(): void {}
  onDetached(): void {}
}

interface Activity {
  isInterruptionByAudioActivityEnabled: boolean;
  interruptByAudioActivity(): void;
  onEndOfSpeech(): void;
  cancelSpeechPause(): Promise<void>;
  pausedSpeech?: unknown;
}

const cleanups: Array<() => unknown> = [];

async function call(afterPause: (act: Activity) => Promise<void>) {
  const session = new voice.AgentSession({
    llm: new ScriptLLM(),
    tts: new PacedTTS(),
    turnHandling: { interruption: interruptionOverrides({}) }, // prod defaults
  } as never);
  const out = new RoomAudioOutput();
  const sync = new TranscriptionSynchronizer(out, new TextSink());
  session.output.audio = sync.audioOutput;
  session.output.transcription = sync.textOutput as never;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  cleanups.push(
    () => out.audioSource.close(),
    () => session.close().catch(() => undefined)
  );
  await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_sdk_pause',
    userId: 'u1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env: {},
  });
  cleanups.push(detach);
  const items: Array<{ text: string; interrupted: boolean }> = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    const it = ev.item as {
      type: string;
      role?: string;
      textContent?: string;
      interrupted?: boolean;
    };
    if (it.type === 'message' && it.role === 'assistant')
      items.push({ text: it.textContent ?? '', interrupted: Boolean(it.interrupted) });
  });
  let pausedListening = false;
  const act = () => (session as unknown as { _activity: Activity })._activity;
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    if (ev.oldState === 'speaking' && ev.newState === 'listening' && act().pausedSpeech)
      pausedListening = true;
  });

  const agentState = (): string => session.agentState;
  session.generateReply({ userInput: 'How should the day go?' });
  while (agentState() !== 'speaking') await sleep(20);
  await sleep(1200); // some words out
  act().isInterruptionByAudioActivityEnabled = true;
  (session as unknown as { _aecWarmupRemaining: number })._aecWarmupRemaining = 0;
  act().interruptByAudioActivity(); // the caller's voice: pause, state -> listening
  await afterPause(act());
  while (agentState() !== 'listening' || items.length === 0) await sleep(20);
  await sleep(300);
  session.generateReply({ userInput: 'Can you set that up?' });
  await sleep(LLM_MS + REPLIES[1].length * MS_PER_CHAR + 1500);
  return { receipts, items, pausedListening };
}

const view = (r: TurnReceipt) => ({
  turn: r.turn,
  endedBy: r.endedBy,
  messages: r.reply.messages,
  interrupted: r.reply.interrupted,
  unrecorded: r.reply.unrecorded,
});

describe('turn receipt through a real pause for the caller (LiveKit SDK)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });

  it('a false interruption: the reply resumes, is recorded, and its turn says so', async () => {
    const r = await call(async (act) => {
      await sleep(300);
      act.onEndOfSpeech(); // the caller went quiet without words: resume after the timeout
    });
    expect(r.pausedListening).toBe(true);
    expect(r.items).toEqual([
      { text: REPLIES[0], interrupted: false },
      { text: REPLIES[1], interrupted: false },
    ]);
    expect(r.receipts.map(view)).toEqual([
      { turn: 1, endedBy: 'listening', messages: 1, interrupted: false, unrecorded: false },
      { turn: 2, endedBy: 'listening', messages: 1, interrupted: false, unrecorded: false },
    ]);
  }, 30_000);

  it('a real interruption: the cut reply is recorded and credited to its own turn', async () => {
    const r = await call(async (act) => {
      await sleep(300);
      await act.cancelSpeechPause(); // the caller's words: cut the paused reply
    });
    expect(r.pausedListening).toBe(true);
    expect(r.items.map((i) => i.interrupted)).toEqual([true, false]);
    // What the caller heard before the cut: some words, not the whole reply.
    expect(r.items[0].text.length).toBeGreaterThan(0);
    expect(r.items[0].text.length).toBeLessThan(REPLIES[0].length);
    expect(REPLIES[0].startsWith(r.items[0].text.trim())).toBe(true);
    expect(r.receipts.map(view)).toEqual([
      { turn: 1, endedBy: 'superseded', messages: 1, interrupted: true, unrecorded: false },
      { turn: 2, endedBy: 'listening', messages: 1, interrupted: false, unrecorded: false },
    ]);
  }, 30_000);
});
