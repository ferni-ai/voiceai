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
 * BARGE_IN_PAUSE_HOLD=on: LiveKit's pause for the caller's overlap waits PAUSE_HOLD_MS and is
 * applied only if the caller is still speaking then. Dev 2026-11-28: the barge-in model called
 * 2 of 3 "mm-hm"s an interruption after 0.02 s of overlap; the pause (and, with
 * BARGE_IN_FAST_STOP, the clear of the queued audio) stopped Ferni mid-sentence, and the verdict
 * that it was a backchannel came ~1.7 s later. A backchannel is over before the hold ends, so
 * the reply plays straight through; a real interruption still stops it, and a verdict to cut
 * (clearBuffer) or the soft pause's own pause (pauseNow) acts at once.
 *
 * A pause that LiveKit never resumes at all, because the caller's end of speech
 * came before it (a VAD frame left over from their last words), is resumed by
 * the SDK patch's watchdog (PAUSE_RESUME_WATCHDOG; paused-lead-in.sdk.test.ts).
 *
 * @module agents/multi-agent/resume-buffer
 */
import { voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { flagOn } from '../../config/env-flag.js';

/** More than the room output can queue (rtc AudioSource, 1 s by default). */
const KEEP_MS = 1500;

/**
 * BARGE_IN_PAUSE_HOLD: how long LiveKit's pause waits for the caller to go quiet. The pause lands
 * ~0.2 s into the caller's speech and user-state "speaking" runs 350 ms past the last word, so a
 * 0.5 s backchannel reports as speaking until ~0.85 s from its start (~0.65 s after the pause);
 * 750 ms clears that, and the sustained-speech fast path (950 ms) acts at about the same point.
 */
const PAUSE_HOLD_MS = 750;

/** The caller's voice as LiveKit's AgentSession shows it (the owner; absent on a bare owner). */
interface CallerVoice {
  userState?: string;
  on?: (event: string, handler: (ev: unknown) => void) => unknown;
  off?: (event: string, handler: (ev: unknown) => void) => unknown;
}

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

/** `f` without its first `ms` (already heard before a pause cleared the rest). */
function dropStart(f: AudioFrame, ms: number): AudioFrame {
  const drop = Math.round((ms * f.sampleRate) / 1000);
  if (drop <= 0 || drop >= f.samplesPerChannel) return f;
  const data = f.data.subarray(drop * f.channels);
  return new AudioFrame(data, f.sampleRate, f.channels, f.samplesPerChannel - drop);
}

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
  /** That held playout event: on a cut it goes on as interrupted, with its position and words. */
  private heldEv?: voice.PlaybackFinishedEvent;
  private flushedWhilePaused = false;
  /** Bumped by every cut, so a frame that waited out a pause the reply didn't survive is dropped. */
  private cuts = 0;
  /** The paused reply was cut (dropCutReply): its frames are dropped until the next resume. */
  private dropping = false;
  /** BARGE_IN_PAUSE_HOLD: how long LiveKit's pause waits (the rows measure against it). */
  static readonly holdMs = PAUSE_HOLD_MS;
  /** BARGE_IN_PAUSE_HOLD: LiveKit's pause, waiting to see whether the caller keeps speaking. */
  private deferred?: { timer: ReturnType<typeof setTimeout>; since: number; off: () => void };

  constructor(
    readonly inner: voice.AudioOutput,
    private readonly owner: object,
    private readonly log: (fields: Record<string, unknown>) => void = () => undefined,
    /** PLAYOUT_DRIFT_GUARD=on: never count a segment the room never got (see waitForPlayout). */
    private readonly driftGuard = false
  ) {
    super(inner.sampleRate, inner, { pause: true });
    // BARGE_IN_FAST_STOP clears the room queue at a pause only with this buffer in front to
    // replay it (patches/@livekit__agents@1.9.3.patch, room_io/_output.js).
    for (let o: unknown = inner; o; o = (o as { nextInChain?: unknown }).nextInChain) {
      if ((o as Queued).audioSource)
        (o as { __ferniResumeBuffered?: boolean }).__ferniResumeBuffered = true;
    }
  }

  async captureFrame(frame: AudioFrame): Promise<void> {
    if (!this.driftGuard) await super.captureFrame(frame);
    const cuts = this.cuts;
    await this.gate;
    await this.replaying;
    if (cuts !== this.cuts || this.dropping) return; // the reply was cut while this frame waited
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

  /** LiveKit's pause for the caller's overlap; with BARGE_IN_PAUSE_HOLD it waits (deferPause). */
  pause(): void {
    if (!this.deferPause()) this.pauseNow();
  }

  /** Hold LiveKit's pause while the caller is speaking; true when it is being held. */
  private deferPause(): boolean {
    if (this.deferred) return true;
    if (this.paused || !flagOn('BARGE_IN_PAUSE_HOLD')) return false;
    const caller = this.owner as CallerVoice;
    if (caller.userState !== 'speaking') return false; // no overlap now (or unknown): as on main
    const onState = (ev: unknown): void => {
      if ((ev as { newState?: string })?.newState !== 'speaking') this.endDeferral('quiet');
    };
    caller.on?.('user_state_changed', onState);
    const timer = setTimeout(
      () => this.endDeferral(caller.userState === 'speaking' ? 'applied' : 'quiet'),
      PAUSE_HOLD_MS
    );
    this.deferred = {
      timer,
      since: Date.now(),
      off: () => caller.off?.('user_state_changed', onState),
    };
    return true;
  }

  /** Stop holding the pause; 'applied' (the caller kept speaking) applies it now. */
  private endDeferral(
    why: 'applied' | 'quiet' | 'resumed' | 'interrupted' | 'superseded' | 'backchannel'
  ): void {
    const held = this.deferred;
    if (!held) return;
    this.deferred = undefined;
    clearTimeout(held.timer);
    held.off();
    this.log({ event: 'pause_hold_ended', why, heldMs: Date.now() - held.since });
    if (why === 'applied') this.pauseNow();
  }

  /** The barge-in model's verdict says backchannel: drop the held pause for good, the reply plays on. */
  cancelHold(): void {
    this.endDeferral('backchannel');
  }

  /** Pause now, never held: the soft pause decides on sustained speech, and the hold's end. */
  pauseNow(): void {
    this.endDeferral('superseded');
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
      // The oldest frame was partly heard already: replay only its unheard end.
      if (tail.length && ms > queued) {
        tail[0] = dropStart(tail[0], ms - queued);
        ms = queued;
      }
      this.replay = tail;
      this.log({ event: 'paused', replayMs: Math.round(ms) });
    }
    super.pause(); // pauses (and clears) the room output
  }

  resume(): void {
    this.endDeferral('resumed'); // never paused: the reply played on
    super.resume();
    this.dropping = false;
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
    const heldEv = this.heldEv;
    this.flushedWhilePaused = false;
    this.replaying = (async () => {
      for (const f of frames) {
        this.keep(f);
        await this.inner.captureFrame(f);
      }
      if (!endAfterReplay) return;
      if (frames.length || !this.held) this.inner.flush();
      else this.onPlaybackFinished(heldEv ?? { playbackPosition: 0, interrupted: false });
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

  /**
   * SOFT_PAUSE_CUT_DROPS_HELD: a soft pause was decided 'interrupted' (#3857). The reply's
   * forwarder is waiting at the closed gate, and LiveKit clears the buffer only once that
   * forwarder has stopped (it waits up to 2 s for it). Drop the reply's frames unplayed from
   * now on, so the forwarder stops at once. The output stays paused; the next reply's launch
   * resumes it, and that resume ends the drop.
   */
  dropCutReply(): void {
    if (!this.paused || this.dropping) return;
    this.dropping = true;
    this.replay = [];
    this.cuts += 1;
    this.openGate();
    this.log({ event: 'cut_dropped' });
  }

  clearBuffer(): void {
    // A real interruption: the paused reply is cut, nothing to bring back.
    this.endDeferral('interrupted');
    const wasHeld = this.held;
    const heldEv = this.heldEv;
    this.heldEv = undefined;
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
      super.onPlaybackFinished({ ...(heldEv ?? { playbackPosition: 0 }), interrupted: true });
    }
  }

  onPlaybackFinished(ev: voice.PlaybackFinishedEvent): void {
    // The room output finishes a segment early when a pause clears its queue.
    // With BARGE_IN_FAST_STOP that early finish says interrupted (what played was cut short),
    // but the reply may still resume: hold it all the same.
    if (this.paused) {
      this.held = true;
      this.heldEv = ev;
      return;
    }
    this.held = false;
    this.heldEv = undefined;
    super.onPlaybackFinished(ev);
  }
}

/**
 * Put a resume buffer in front of the session's audio output (again if the room replaced it).
 * Returns the session's output, or null when it has none (nothing to put a buffer in front of).
 */
export function ensureResumeBuffer(
  session: { output?: { audio: voice.AudioOutput | null } },
  log?: (fields: Record<string, unknown>) => void,
  env: Record<string, string | undefined> = process.env
): { audio: voice.AudioOutput | null } | null {
  const { output } = session;
  if (!output) return null;
  const audio = output.audio;
  if (!audio || audio instanceof ResumeBufferOutput || !audio.canPause) return output;
  output.audio = new ResumeBufferOutput(audio, session, log, env.PLAYOUT_DRIFT_GUARD === 'on');
  return output;
}
