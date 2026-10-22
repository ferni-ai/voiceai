/**
 * When noise pauses Ferni, the reply comes back from where it stopped.
 *
 * Dev, 7 days to 2026-10-11: 10 of 73 false interruptions never resumed, and
 * the resumed ones came back missing a piece (Seth's 18:36Z call: turn 5's
 * reply was never heard). LiveKit pauses a reply for caller audio and resumes
 * it when no words follow, but its room output pauses by clearing the audio
 * already queued (up to 1 s; room_io/_output.js pause -> clearQueue). A short
 * reply is often queued whole, so the clear also ends its playout: the speech
 * is "done" while paused and LiveKit can't resume it (resumed: false).
 *
 * This output sits in front of the room output. It keeps the last frames it
 * forwarded; on pause it notes how much of them was still queued (cleared, so
 * never heard), and on resume it plays those again before anything new. While
 * a pause is open, the room output's early "playout finished" is held back, so
 * the reply isn't done until its audio has really played. With NEVER_SILENT on,
 * LiveKit's false-interruption timeout drops from 2 s to 1 s
 * (interruption-config.ts), so the reply resumes ~1 s after the noise ends.
 *
 * A pause that LiveKit never resumes at all, because the caller's end of speech
 * came before it (a VAD frame left over from their last words), is resumed by
 * the SDK patch's watchdog (PAUSE_RESUME_WATCHDOG; paused-lead-in.sdk.test.ts).
 *
 * @module agents/multi-agent/resume-buffer
 */
import { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';

/** More than the room output can queue (rtc AudioSource, 1 s by default). */
const KEEP_MS = 1500;

export interface Queued {
  readonly audioSource?: { readonly queuedDuration?: number };
  readonly nextInChain?: Queued;
}

/** The rtc AudioSource of the room output at the end of the chain (self-voice-gate taps it too). */
export function chainAudioSource(output: Queued | undefined): Queued['audioSource'] {
  for (let o = output; o; o = o.nextInChain) {
    if (typeof o.audioSource?.queuedDuration === 'number') return o.audioSource;
  }
  return undefined;
}

/** ms of audio queued but not yet played in the room output at the end of the chain. */
const queuedMs = (output: Queued | undefined): number | null =>
  chainAudioSource(output)?.queuedDuration ?? null;

const frameMs = (f: AudioFrame): number => (f.samplesPerChannel / f.sampleRate) * 1000;

/** Sessions with a pause that may still resume (never-silent.ts waits for it). */
const pausedSessions = new WeakSet<object>();
export const replyPaused = (session: object): boolean => pausedSessions.has(session);

export class ResumeBufferOutput extends voice.AudioOutput {
  private recent: AudioFrame[] = [];
  private recentMs = 0;
  private replay: AudioFrame[] = [];
  private paused = false;
  private gate: Promise<void> = Promise.resolve();
  private openGate: () => void = () => undefined;
  private replaying: Promise<void> = Promise.resolve();
  /** The caller's reply's room playout ended under a pause: hold that until it really plays. */
  private held = false;
  private flushedWhilePaused = false;
  /** Bumped by every cut, so a frame that waited out a pause the reply didn't survive is dropped. */
  private cuts = 0;

  constructor(
    readonly inner: voice.AudioOutput,
    private readonly owner: object,
    private readonly log: (fields: Record<string, unknown>) => void = () => undefined,
    /** PLAYOUT_DRIFT_GUARD=on: never count a segment the room never got (see waitForPlayout). */
    private readonly driftGuard = false
  ) {
    super(inner.sampleRate, inner, { pause: true });
  }

  async captureFrame(frame: AudioFrame): Promise<void> {
    if (!this.driftGuard) await super.captureFrame(frame);
    const cuts = this.cuts;
    await this.gate;
    await this.replaying;
    if (cuts !== this.cuts) return; // the reply was cut while this frame waited
    // Counted only once forwarded: a reply cut at the gate before its first frame went
    // on must not leave a segment here that no "playout finished" will ever close.
    if (this.driftGuard) await super.captureFrame(frame);
    this.keep(frame);
    await this.inner.captureFrame(frame);
  }

  /**
   * Lost replies, 2026-10-13 (voiceai-evidence/lost-replies-repro-2026-10-13): a reply
   * whose first frame waited at the paused gate and was then cut was counted here but
   * never reached the room, so every later waitForPlayout() waited for the NEXT reply's
   * audio: each reply was recorded one turn late, with the next reply's text, or never.
   * LiveKit settles that drift in SyncedAudioOutput.waitForPlayout(), which nothing calls
   * once this output wraps it; call it so the inner chain settles too.
   */
  async waitForPlayout(): Promise<voice.PlaybackFinishedEvent> {
    if (this.driftGuard) {
      // Its drift settling runs synchronously, before its first await.
      this.inner
        .waitForPlayout()
        .catch((error: unknown) =>
          this.log({ event: 'inner_playout_failed', error: String(error) })
        );
      const drift =
        this.pendingPlayoutSegments - this.inner.pendingPlayoutSegments - (this.held ? 1 : 0);
      for (let i = 0; i < drift; i++)
        super.onPlaybackFinished({ playbackPosition: 0, interrupted: true });
      if (drift > 0) this.log({ event: 'drift_settled', drift });
    }
    return super.waitForPlayout();
  }

  private keep(frame: AudioFrame): void {
    this.recent.push(frame);
    this.recentMs += frameMs(frame);
    while (this.recent.length > 1 && this.recentMs - frameMs(this.recent[0]) >= KEEP_MS) {
      this.recentMs -= frameMs(this.recent.shift() as AudioFrame);
    }
  }

  pause(): void {
    if (!this.paused) {
      this.paused = true;
      pausedSessions.add(this.owner);
      this.gate = new Promise((resolve) => {
        this.openGate = resolve;
      });
      // What the room output is about to clear: the newest `queued` ms we sent it.
      const queued = queuedMs(this.inner as unknown as Queued) ?? 0;
      let ms = 0;
      const tail: AudioFrame[] = [];
      for (let i = this.recent.length - 1; i >= 0 && ms < queued; i--) {
        tail.unshift(this.recent[i]);
        ms += frameMs(this.recent[i]);
      }
      this.replay = tail;
      this.log({ event: 'paused', replayMs: Math.round(ms) });
    }
    super.pause(); // pauses (and clears) the room output
  }

  resume(): void {
    super.resume();
    if (!this.paused) return;
    this.paused = false;
    pausedSessions.delete(this.owner);
    const frames = this.replay;
    this.replay = [];
    this.recent = [];
    this.recentMs = 0;
    const replayMs = frames.reduce((a, f) => a + frameMs(f), 0);
    // The segment's end was already sent (and played early) or came while paused:
    // end the replayed audio the same way, or its playout is never reported.
    const endAfterReplay = this.flushedWhilePaused || this.held;
    this.flushedWhilePaused = false;
    this.replaying = (async () => {
      for (const f of frames) {
        this.keep(f);
        await this.inner.captureFrame(f);
      }
      if (!endAfterReplay) return;
      if (frames.length || !this.held) this.inner.flush();
      else this.onPlaybackFinished({ playbackPosition: 0, interrupted: false });
    })().catch((error: unknown) => this.log({ event: 'replay_failed', error: String(error) }));
    this.openGate();
    this.log({ event: 'resumed', replayMs: Math.round(replayMs) });
  }

  flush(): void {
    super.flush();
    if (this.paused) {
      // Sent on after the replay, so the replayed audio ends the segment.
      this.flushedWhilePaused = true;
      return;
    }
    void this.replaying.then(() => this.inner.flush());
  }

  clearBuffer(): void {
    // A real interruption: the paused reply is cut, nothing to bring back.
    const wasHeld = this.held;
    this.cuts += 1;
    this.replay = [];
    this.flushedWhilePaused = false;
    this.held = false;
    if (this.paused) {
      this.paused = false;
      pausedSessions.delete(this.owner);
      this.openGate();
    }
    this.inner.clearBuffer();
    if (wasHeld && this.inner.pendingPlayoutSegments === 0) {
      super.onPlaybackFinished({ playbackPosition: 0, interrupted: true });
    }
  }

  onPlaybackFinished(ev: voice.PlaybackFinishedEvent): void {
    // The room output finishes a segment early when a pause clears its queue.
    if (this.paused && !ev.interrupted) {
      this.held = true;
      return;
    }
    this.held = false;
    super.onPlaybackFinished(ev);
  }
}

/** Put a resume buffer in front of the session's audio output (again if the room replaced it). */
export function ensureResumeBuffer(
  session: { output: { audio: voice.AudioOutput | null } },
  log?: (fields: Record<string, unknown>) => void,
  env: Record<string, string | undefined> = process.env
): void {
  const audio = session.output.audio;
  if (!audio || audio instanceof ResumeBufferOutput || !audio.canPause) return;
  session.output.audio = new ResumeBufferOutput(
    audio,
    session,
    log,
    env.PLAYOUT_DRIFT_GUARD === 'on'
  );
}
