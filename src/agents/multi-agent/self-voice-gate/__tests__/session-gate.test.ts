import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => {
  const l: Record<string, unknown> = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  l.child = () => l;
  return l as { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
});
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => log,
  getLogger: () => log,
}));

import type { LiveCallBehaviorsInput } from '../../live-call-behaviors.js';
import {
  installSelfVoiceGate,
  logSelfVoiceShadow,
  micFrameTap,
  selfVoiceGateMode,
  tapClipSource,
} from '../session-gate.js';

class FakeSource {
  queuedDuration = 0;
  async captureFrame(_frame: AudioFrame): Promise<void> {}
  clearQueue(): void {}
}
const ORIGINAL_CAPTURE = FakeSource.prototype.captureFrame;
const ORIGINAL_CLEAR = FakeSource.prototype.clearQueue;

function fakeCall() {
  const room = new FakeSource();
  // The room output sits at the end of the chain, behind a wrapper (resume buffer, sync).
  const session = { output: { audio: { nextInChain: { audioSource: room } } as unknown } };
  const on = vi.fn();
  const input = {
    session,
    sessionWithEvents: { on },
    sessionEventHandlers: [],
    cleanupFunctions: [],
    sessionId: 'call-1',
    userId: undefined,
  } as unknown as LiveCallBehaviorsInput;
  return { room, session, on, input };
}

const SHADOW = { SELF_VOICE_GATE: 'shadow' };
const frame = (data: Int16Array) => new AudioFrame(data, 16_000, 1, data.length);
const shadowLines = () => log.info.mock.calls.filter((c) => c[1] === 'SELF_VOICE_SHADOW');

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('self-voice gate on a call', () => {
  it('reads off unless SELF_VOICE_GATE=shadow', () => {
    expect(selfVoiceGateMode({})).toBe('off');
    expect(selfVoiceGateMode({ SELF_VOICE_GATE: 'on' })).toBe('off');
    expect(selfVoiceGateMode({ SELF_VOICE_GATE: ' Shadow ' })).toBe('shadow');
  });

  it('off installs nothing: no wrappers, no handlers, no logs, backchannel fed as before', () => {
    const { room, session, on, input } = fakeCall();
    installSelfVoiceGate(input, {});
    const clip = new FakeSource();
    tapClipSource(session, clip, {});
    expect(room.captureFrame).toBe(ORIGINAL_CAPTURE);
    expect(room.clearQueue).toBe(ORIGINAL_CLEAR);
    expect(Object.hasOwn(room, 'captureFrame')).toBe(false);
    expect(Object.hasOwn(clip, 'captureFrame')).toBe(false);
    expect(on).not.toHaveBeenCalled();
    expect(input.sessionEventHandlers).toHaveLength(0);
    const backchannel = { processAudioFrame: vi.fn() };
    const f = frame(new Int16Array(160));
    micFrameTap(session, f, backchannel);
    micFrameTap(session, f, null);
    expect(backchannel.processAudioFrame).toHaveBeenCalledTimes(1);
    expect(backchannel.processAudioFrame).toHaveBeenCalledWith(f);
    logSelfVoiceShadow(session, 'fastpath');
    expect(shadowLines()).toHaveLength(0);
  });

  it('shadow taps the room output found down the chain, and re-taps a replaced one', () => {
    const { room, session, on, input } = fakeCall();
    installSelfVoiceGate(input, SHADOW);
    expect(Object.hasOwn(room, 'captureFrame')).toBe(true);
    expect(Object.hasOwn(room, 'clearQueue')).toBe(true);
    expect(on.mock.calls.map((c) => c[0])).toEqual([
      'speech_created',
      'agent_state_changed',
      'user_state_changed',
    ]);
    const wrapped = room.captureFrame;
    const handler = on.mock.calls[0][1] as () => void;
    handler(); // idempotent: the same source isn't wrapped twice
    expect(room.captureFrame).toBe(wrapped);
    const replaced = new FakeSource();
    session.output.audio = { audioSource: replaced };
    handler();
    expect(Object.hasOwn(replaced, 'captureFrame')).toBe(true);
  });

  it('shadow logs one line per barge-in: Ferni echo locked, would suppress, no text', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const { room, session, input } = fakeCall();
    installSelfVoiceGate(input, SHADOW);
    const backchannel = { processAudioFrame: vi.fn() };
    // Ferni speaks bursts; the caller's mic hears them 120 ms later, 18 dB down.
    const played: Int16Array[] = [];
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let h = 0; h < 400; h++) {
      const on = h % 37 < 22; // 220 ms bursts, 150 ms gaps
      const amp = on ? 4000 + 3000 * Math.sin(h) : 0;
      const ref = new Int16Array(160).map(() => Math.round(rand() * amp));
      played.push(ref);
      await room.captureFrame(frame(ref)); // plays now: nothing queued ahead
      const echo = played[h - 12];
      const mic = new Int16Array(160).map((_, k) => Math.round((echo?.[k] ?? 0) / 8 + rand() * 30));
      micFrameTap(session, frame(mic), backchannel);
      vi.advanceTimersByTime(10);
    }
    expect(backchannel.processAudioFrame).toHaveBeenCalledTimes(400);
    logSelfVoiceShadow(session, 'fastpath');
    room.clearQueue(); // the interrupt that follows: same event, not logged twice
    vi.advanceTimersByTime(1000);
    room.clearQueue(); // an SDK pause a second later: its own line
    const lines = shadowLines();
    expect(lines.map((c) => c[0].trigger)).toEqual(['fastpath', 'output-cleared']);
    const first = lines[0][0];
    expect(Object.keys(first).sort()).toEqual(
      [
        'genuineMs',
        'lagMs',
        'lockConf',
        'pMean',
        'refActive',
        'sessionId',
        'trigger',
        'wouldSuppress',
      ].sort()
    );
    expect(first.sessionId).toBe('call-1');
    expect(Math.abs(first.lagMs - 120)).toBeLessThanOrEqual(20);
    expect(first.refActive).toBe(true);
    expect(first.wouldSuppress).toBe(true);
    expect(first.pMean).toBeLessThan(0.2);
  });
});
