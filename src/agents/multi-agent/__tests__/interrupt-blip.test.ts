/**
 * Cutting a paused reply drops its held audio unplayed (PATCHED(ferni) in
 * cancelSpeechPause, patches/@livekit__agents@1.5.1.patch).
 *
 * Dev talk-over runs, 2026-10-05: after every real interruption the caller
 * heard a 20-40 ms blip of the reply they had cut off. The caller's voice
 * pauses the output, holding the next frame at the gate. Cutting the reply
 * called resume() before the speech task cleared the buffer, so that frame
 * played.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const load = <T>(rel: string) => import(pathToFileURL(join(agentsDist, rel)).href) as Promise<T>;

type CancelSpeechPause = (this: unknown, options?: { interrupt?: boolean }) => Promise<void>;

async function cancelSpeechPause(): Promise<CancelSpeechPause> {
  const mod = await load<{ AgentActivity: { prototype: { cancelSpeechPause: CancelSpeechPause } } }>(
    'voice/agent_activity.js'
  );
  return mod.AgentActivity.prototype.cancelSpeechPause;
}

/** An AgentActivity whose reply the caller's voice has paused. */
function pausedActivity() {
  const calls: string[] = [];
  const audio = {
    pause: vi.fn(),
    resume: vi.fn(() => calls.push('resume')),
    clearBuffer: vi.fn(() => calls.push('clearBuffer')),
  };
  const handle = {
    interrupted: false,
    allowInterruptions: true,
    _hasGenerations: false,
    interrupt: vi.fn(() => calls.push('interrupt')),
  };
  return {
    calls,
    audio,
    handle,
    activity: {
      agentSession: {
        output: { audio },
        sessionOptions: { turnHandling: { interruption: { resumeFalseInterruption: true } } },
      },
      pausedSpeech: { handle },
      cancelSpeechPauseTask: undefined,
      falseInterruptionTimer: undefined,
      logger: { debug: vi.fn() },
    },
  };
}

describe('cutting a paused reply (patched)', () => {
  it('clears the buffer after the interrupt and never reopens the gate', async () => {
    const run = await cancelSpeechPause();
    const p = pausedActivity();
    await run.call(p.activity, { interrupt: true });
    expect(p.calls).toEqual(['interrupt', 'clearBuffer']);
    expect(p.audio.resume).not.toHaveBeenCalled();
    expect(p.activity.pausedSpeech).toBeUndefined();
  });

  it('still resumes a paused reply that is not being cut', async () => {
    const run = await cancelSpeechPause();
    const p = pausedActivity();
    await run.call(p.activity, { interrupt: false });
    expect(p.audio.resume).toHaveBeenCalledTimes(1);
    expect(p.audio.clearBuffer).not.toHaveBeenCalled();
    expect(p.handle.interrupt).not.toHaveBeenCalled();
  });

  it('resumes when the reply could not be interrupted', async () => {
    const run = await cancelSpeechPause();
    const p = pausedActivity();
    p.handle.allowInterruptions = false;
    await run.call(p.activity, { interrupt: true });
    expect(p.audio.resume).toHaveBeenCalledTimes(1);
    expect(p.audio.clearBuffer).not.toHaveBeenCalled();
  });
});

describe('the room output gate', () => {
  type Frame = { samplesPerChannel: number; sampleRate: number };
  interface RoomAudio {
    pause(): void;
    resume(): void;
    clearBuffer(): void;
    captureFrame(frame: Frame): Promise<void>;
  }

  /** A ParticipantAudioOutput with a fake audio source (no native track). */
  async function roomOutput() {
    const [{ ParticipantAudioOutput }, { Future }] = await Promise.all([
      load<{ ParticipantAudioOutput: { prototype: RoomAudio } }>('voice/room_io/_output.js'),
      load<{ Future: new () => { resolve(): void } }>('utils.js'),
    ]);
    const pushed: Frame[] = [];
    const started = new Future();
    started.resolve();
    const out = Object.assign(Object.create(ParticipantAudioOutput.prototype) as RoomAudio, {
      _capturing: false,
      playbackSegmentsCount: 0,
      pushedDuration: 0,
      firstFrameEmitted: false,
      startedFuture: started,
      interruptedFuture: new Future(),
      playbackEnabledFuture: new Future(),
      audioSource: { clearQueue: vi.fn(), captureFrame: vi.fn(async (f: Frame) => void pushed.push(f)) },
    });
    return { out, pushed };
  }

  const frame = (n: number): Frame => ({ samplesPerChannel: 480 + n, sampleRate: 24000 });

  it('drops the frame held at the gate when the buffer is cleared', async () => {
    const { out, pushed } = await roomOutput();
    out.pause();
    const held = out.captureFrame(frame(0));
    out.clearBuffer();
    await held;
    expect(pushed).toEqual([]);
  });

  it('the next reply still plays: forwarding resumes the output first', async () => {
    const { out, pushed } = await roomOutput();
    out.pause();
    const held = out.captureFrame(frame(0));
    out.clearBuffer();
    await held;
    out.resume(); // forwardAudio() calls this before its first frame
    await out.captureFrame(frame(1));
    expect(pushed).toEqual([frame(1)]);
  });
});
