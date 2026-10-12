/**
 * Test doubles for driving a real LiveKit AgentSession with audio: a TTS that
 * speaks at ~14 chars/s and an audio sink that behaves like LiveKit's
 * ParticipantAudioOutput (room_io/_output.js): it plays a bounded queue in
 * real time, pause() closes a gate and clears the queue, captureFrame waits at
 * the gate, and flush() reports playout once the queue drains.
 */
import { DEFAULT_API_CONNECT_OPTIONS, tts, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';

export const SAMPLE_RATE = 24_000;
const FRAME_MS = 20;
/** ~14 characters a second, Cartesia's pace. */
export const MS_PER_CHAR = 70;

export class PacedTTS extends tts.TTS {
  label = 'paced-tts';
  constructor() {
    super(SAMPLE_RATE, 1, { streaming: false });
  }
  synthesize(text: string): tts.ChunkedStream {
    return new PacedChunked(text, this);
  }
  stream(): tts.SynthesizeStream {
    throw new Error('not streaming');
  }
}

class PacedChunked extends tts.ChunkedStream {
  label = 'paced-tts';
  constructor(text: string, model: tts.TTS) {
    super(text, model, { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 });
  }
  protected async run(): Promise<void> {
    const frames = Math.max(1, Math.round((this.inputText.length * MS_PER_CHAR) / FRAME_MS));
    const samples = (SAMPLE_RATE * FRAME_MS) / 1000;
    for (let i = 0; i < frames; i++) {
      const frame = new AudioFrame(new Int16Array(samples), SAMPLE_RATE, 1, samples);
      this.queue.put({ requestId: 'r', segmentId: 's', frame, final: i === frames - 1 });
    }
  }
}

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

export class RoomLikeAudioOutput extends voice.AudioOutput {
  /** Audio the caller actually heard, ms. */
  heardMs = 0;
  private queueMs = 0;
  private open = true;
  private gate: Promise<void> = Promise.resolve();
  private openGate: () => void = () => undefined;
  private interrupted = false;
  private pushedMs = 0;
  private first = true;
  private readonly ticker: ReturnType<typeof setInterval>;
  constructor(private readonly maxQueueMs = 400) {
    super(SAMPLE_RATE, undefined, { pause: true });
    this.ticker = setInterval(() => {
      if (this.queueMs > 0) {
        this.queueMs -= FRAME_MS;
        this.heardMs += FRAME_MS;
      }
    }, FRAME_MS);
  }
  /** As rtc AudioSource exposes it: what is queued and not yet played. */
  get audioSource(): { queuedDuration: number } {
    return { queuedDuration: this.queueMs };
  }
  close(): void {
    clearInterval(this.ticker);
  }
  pause(): void {
    if (this.open) {
      this.open = false;
      this.gate = new Promise((r) => {
        this.openGate = r;
      });
    }
    this.queueMs = 0; // audioSource.clearQueue()
    super.pause();
  }
  resume(): void {
    this.open = true;
    this.openGate();
    this.first = true;
    super.resume();
  }
  async captureFrame(frame: AudioFrame): Promise<void> {
    if (!this.open) {
      this.queueMs = 0;
      await this.gate;
      if (this.interrupted) return; // cut while waiting at the gate
    }
    await super.captureFrame(frame);
    if (this.first) {
      this.first = false;
      this.onPlaybackStarted(Date.now());
    }
    this.pushedMs += FRAME_MS;
    while (this.queueMs >= this.maxQueueMs && !this.interrupted) await sleep(FRAME_MS);
    this.queueMs += FRAME_MS;
  }
  flush(): void {
    super.flush();
    if (!this.pushedMs) return;
    this.interrupted = false;
    void (async () => {
      while (this.queueMs > 0 && !this.interrupted) await sleep(FRAME_MS);
      const interrupted = this.interrupted;
      this.queueMs = 0;
      this.pushedMs = 0;
      this.first = true;
      this.onPlaybackFinished({ playbackPosition: 0, interrupted });
    })();
  }
  clearBuffer(): void {
    this.interrupted = true;
    this.queueMs = 0;
  }
}
