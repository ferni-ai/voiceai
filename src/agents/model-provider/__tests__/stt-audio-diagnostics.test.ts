/**
 * STT_AUDIO_DIAGNOSTICS (stt-audio-diagnostics.ts): the 30 s STT_AUDIO window,
 * the STT_HEARD_NO_WORDS detector and the STT_INPUT_DISCARD transitions, driven
 * with fake frames, fake STT events and fake VAD state changes.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';
import {
  type AudioFrameLike,
  inputAudioDiscardReason,
  watchSessionSttAudio,
  watchSttStream,
} from '../stt-audio-diagnostics.js';

const ON = { STT_AUDIO_DIAGNOSTICS: 'on' };
const { INTERIM_TRANSCRIPT, FINAL_TRANSCRIPT, START_OF_SPEECH } = stt.SpeechEventType;

const frame = (value: number, n = 480, sampleRate = 48000): AudioFrameLike => ({
  data: Int16Array.from({ length: n }, (_, i) => (i % 2 ? -value : value)),
  sampleRate,
});

function rig(env: Record<string, string> = ON) {
  let t = 1_000_000;
  const ticks: Array<() => void> = [];
  const sink = { info: vi.fn(), warn: vi.fn() };
  const every = vi.fn((_ms: number, fn: () => void) => {
    ticks.push(fn);
    return () => ticks.splice(ticks.indexOf(fn), 1);
  });
  const opts = { env, sink, now: () => t, every };
  const pushed: AudioFrameLike[] = [];
  const events: Array<{ type: number }> = [];
  const close = vi.fn();
  const stream = {
    pushFrame: (f: AudioFrameLike) => void pushed.push(f),
    next: async () =>
      events.length
        ? { done: false as const, value: events.shift() as { type: number } }
        : { done: true as const, value: undefined },
    close,
  };
  const originalPush = stream.pushFrame;
  const sttInstance = {};
  const handlers: Array<(ev: { newState?: string }) => void> = [];
  const session = {
    on: vi.fn((_e: string, fn: (ev: { newState?: string }) => void) => handlers.push(fn)),
    agentState: 'listening',
    _aecWarmupRemaining: 0,
    _activity: { shouldDiscardInputAudio: () => false },
  };
  watchSttStream(sttInstance, stream, 1, opts);
  watchSessionSttAudio(session, sttInstance, opts);
  return {
    sink,
    every,
    stream,
    originalPush,
    pushed,
    session,
    advance: (ms: number) => void (t += ms),
    tick: () => ticks.forEach((fn) => fn()),
    receive: async (...types: number[]) => {
      events.push(...types.map((type) => ({ type })));
      await Promise.all(types.map(() => stream.next()));
    },
    speak: () => handlers.forEach((fn) => fn({ newState: 'speaking' })),
    msgs: (level: 'info' | 'warn', msg: string) =>
      sink[level].mock.calls.filter((c) => c[1] === msg).map((c) => c[0]),
  };
}

describe('STT_AUDIO window', () => {
  it('reports frames, zero share, peak/RMS dBFS, rate and transcript counts, then resets', async () => {
    const r = rig();
    for (let i = 0; i < 5; i++) r.stream.pushFrame(frame(0));
    for (let i = 0; i < 5; i++) r.stream.pushFrame(frame(16384));
    await r.receive(INTERIM_TRANSCRIPT, INTERIM_TRANSCRIPT, FINAL_TRANSCRIPT, START_OF_SPEECH);
    expect(r.pushed).toHaveLength(10); // every frame still reaches STT
    r.advance(30_000);
    r.tick();
    expect(r.every.mock.calls[0][0]).toBe(30_000);
    expect(r.msgs('info', 'STT_AUDIO')).toEqual([
      {
        stream: 1,
        windowMs: 30_000,
        sampleRate: 48000,
        frames: 10,
        zeroFrameShare: 0.5,
        peakDbfs: -6,
        rmsDbfs: -9, // half the frames at -6 dBFS RMS, half silent
        audio: 'present',
        interim: 2,
        final: 1,
      },
    ]);
    r.advance(30_000);
    r.tick();
    expect(r.msgs('info', 'STT_AUDIO')[1]).toMatchObject({
      frames: 0,
      zeroFrameShare: null,
      peakDbfs: null,
      audio: 'none',
      interim: 0,
      final: 0,
    });
  });

  it('calls all-zero audio silent and a faint floor near_silent', () => {
    const r = rig();
    r.stream.pushFrame(frame(0));
    r.tick();
    r.stream.pushFrame(frame(50)); // -56.3 dBFS
    r.tick();
    const [silent, faint] = r.msgs('info', 'STT_AUDIO');
    expect(silent).toMatchObject({ zeroFrameShare: 1, peakDbfs: null, audio: 'silent' });
    expect(faint).toMatchObject({ zeroFrameShare: 0, peakDbfs: -56.3, audio: 'near_silent' });
  });

  it('flushes the last window when the stream closes and stops its timer', () => {
    const r = rig();
    r.stream.pushFrame(frame(1000));
    r.stream.close();
    expect(r.msgs('info', 'STT_AUDIO')).toHaveLength(1);
    r.tick(); // timer removed
    expect(r.msgs('info', 'STT_AUDIO')).toHaveLength(1);
  });
});

describe('STT_HEARD_NO_WORDS', () => {
  it('warns on the third VAD burst within 20 s with no transcript, with levels since the first', () => {
    const r = rig();
    r.stream.pushFrame(frame(16384)); // loud audio before the run is not counted
    r.speak();
    r.stream.pushFrame(frame(0));
    r.advance(5_000);
    r.speak();
    r.advance(5_000);
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toHaveLength(0);
    r.speak();
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toEqual([
      {
        stream: 1,
        bursts: 3,
        spanMs: 20_000,
        sampleRate: 48000,
        frames: 1,
        zeroFrameShare: 1,
        peakDbfs: null,
        rmsDbfs: null,
        audio: 'silent',
      },
    ]);
  });

  it('says audio was present when the bursts carried sound', () => {
    const r = rig();
    r.speak();
    r.stream.pushFrame(frame(8000));
    r.speak();
    r.speak();
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')[0]).toMatchObject({
      audio: 'present',
      peakDbfs: -12.2,
    });
  });

  it('an interim transcript after a burst clears the run', async () => {
    const r = rig();
    r.speak();
    r.speak();
    await r.receive(INTERIM_TRANSCRIPT);
    r.speak();
    r.speak();
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toHaveLength(0);
    r.speak();
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toHaveLength(1);
  });

  it('bursts older than 20 s drop out of the run', () => {
    const r = rig();
    r.speak();
    r.advance(15_000);
    r.speak();
    r.advance(15_000);
    r.speak(); // first burst is 30 s old
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toHaveLength(0);
    r.advance(2_000);
    r.speak();
    expect(r.msgs('warn', 'STT_HEARD_NO_WORDS')).toHaveLength(1);
  });
});

describe('STT_INPUT_DISCARD', () => {
  it('warns when the SDK starts and stops sending STT silence, with the reason', () => {
    const r = rig();
    let discard = true;
    r.session._activity.shouldDiscardInputAudio = () => discard;
    r.session.agentState = 'speaking';
    r.session._aecWarmupRemaining = 3000;
    r.stream.pushFrame(frame(0));
    r.stream.pushFrame(frame(0)); // no repeat while unchanged
    r.advance(1_200);
    discard = false;
    r.stream.pushFrame(frame(500));
    expect(r.msgs('warn', 'STT_INPUT_DISCARD')).toEqual([
      { stream: 1, discarding: true, reason: 'aec_warmup' },
      { stream: 1, discarding: false, reason: 'aec_warmup', durationMs: 1_200 },
    ]);
  });

  it('a probe that throws warns once and stops probing; audio still reaches STT', () => {
    const r = rig();
    const probe = vi.fn(() => {
      throw new Error('moved');
    });
    r.session._activity.shouldDiscardInputAudio = probe;
    r.stream.pushFrame(frame(0));
    r.stream.pushFrame(frame(0));
    expect(probe).toHaveBeenCalledTimes(1);
    expect(r.msgs('warn', 'STT_INPUT_DISCARD_UNREADABLE')).toEqual([
      { stream: 1, error: 'Error: moved' },
    ]);
    expect(r.pushed).toHaveLength(2);
  });

  it('names uninterruptible speech when no AEC warm-up is running', () => {
    const session = {
      agentState: 'speaking',
      _aecWarmupRemaining: 0,
      _activity: { shouldDiscardInputAudio: () => true },
    };
    expect(inputAudioDiscardReason(session)).toBe('uninterruptible_speech');
    expect(inputAudioDiscardReason({ ...session, _aecWarmupRemaining: 500 })).toBe('aec_warmup');
    expect(inputAudioDiscardReason({ _activity: {} })).toBeNull();
  });

  it('the SDK still has the predicate and state this reads (fails on an upgrade that moves them)', () => {
    const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
    const activity = readFileSync(join(dist, 'voice/agent_activity.js'), 'utf8');
    const session = readFileSync(join(dist, 'voice/agent_session.js'), 'utf8');
    expect(activity).toMatch(/shouldDiscardInputAudio\(\) \{/);
    expect(activity).toContain('this.agentSession._aecWarmupRemaining > 0');
    expect(session).toMatch(/get _activity\(\) \{/);
  });
});

describe('flag off', () => {
  it('wraps nothing and logs nothing', async () => {
    const r = rig({});
    expect(r.stream.pushFrame).toBe(r.originalPush);
    expect(r.every).not.toHaveBeenCalled();
    expect(r.session.on).not.toHaveBeenCalled();
    r.stream.pushFrame(frame(0));
    r.speak();
    r.speak();
    r.speak();
    await r.receive(FINAL_TRANSCRIPT);
    r.stream.close();
    expect(r.sink.info).not.toHaveBeenCalled();
    expect(r.sink.warn).not.toHaveBeenCalled();
    expect(r.stream.close).toHaveBeenCalledTimes(1);
  });
});

describe('on the real SDK SpeechStream', () => {
  class EchoStream extends stt.SpeechStream {
    label = 'echo';
    protected async run(): Promise<void> {
      for await (const input of this.input) {
        if (typeof input === 'symbol') continue;
        this.queue.put({ type: INTERIM_TRANSCRIPT, alternatives: [] } as never);
      }
    }
  }
  class EchoSTT extends stt.STT {
    label = 'echo';
    constructor() {
      super({ streaming: true, interimResults: true });
    }
    protected _recognize(): Promise<stt.SpeechEvent> {
      throw new Error('streaming only');
    }
    stream(): EchoStream {
      return new EchoStream(this, 48000);
    }
  }

  it('sees frames the SDK pumps in and events the session reads out', async () => {
    const sink = { info: vi.fn(), warn: vi.fn() };
    const echo = new EchoSTT();
    const stream = echo.stream();
    watchSttStream(echo, stream, 1, { env: ON, sink, every: () => () => {} });
    const frames = [0, 16384, 16384].map(
      (v) =>
        new AudioFrame(
          Int16Array.from({ length: 480 }, () => v),
          48000,
          1,
          480
        )
    );
    stream.updateInputStream(
      new ReadableStream<AudioFrame>({
        start(controller) {
          frames.forEach((f) => controller.enqueue(f));
          controller.close();
        },
      })
    );
    let seen = 0;
    for await (const event of stream) {
      expect(event.type).toBe(INTERIM_TRANSCRIPT);
      if (++seen === 3) break;
    }
    stream.close();
    expect(sink.info.mock.calls.find((c) => c[1] === 'STT_AUDIO')?.[0]).toMatchObject({
      frames: 3,
      zeroFrameShare: 0.333,
      peakDbfs: -6,
      interim: 3,
    });
  });
});
