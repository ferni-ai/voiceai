/**
 * MINOR_CARE: the audio processor never records a held caller's voice sample. It recorded one
 * per utterance, with the last topic as context, and voice prosody's own timer flushed them
 * (minor-care #2826). The purge also drops what was stored before the hold (held-window.ts);
 * this is the other half: nothing is recorded once the call is held.
 */
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const recordVoiceSample = vi.hoisted(() => vi.fn());
const emotion = vi.hoisted(() => ({
  primary: 'neutral',
  confidence: 0.9,
  stressLevel: 0.2,
  prosody: { pitchMean: 180, pitchRange: 20, energyMean: 0.5, speechRate: 150 },
}));
const noop = vi.hoisted(
  () => new Proxy({}, { get: (_t, key) => (key === 'then' ? undefined : () => undefined) }) as never
);

vi.mock('../../../services/trust-systems/index.js', () => ({ recordVoiceSample }));
vi.mock('../../../speech/audio-prosody.js', () => ({
  getSessionAudioProsodyAnalyzer: () => ({
    processAudioFrame: () => undefined,
    clearBuffers: () => undefined,
    analyze: () => emotion,
  }),
  getRealTimeAnalyzer: () => noop,
}));

import { processAudioStream } from '../audio-processor.js';
import { bindSessionUser, heldAfter, resetMinorCare } from '../../../utils/minor-care.js';

const frame = { data: new Int16Array(480), sampleRate: 48000, channels: 1, samplesPerChannel: 480 };

/** One utterance's audio for this session, then the stream ends (the batch analysis runs). */
async function utterance(sessionId: string, userId: string): Promise<void> {
  const stream = new ReadableStream<AudioFrame>({
    start(c) {
      c.enqueue(frame as unknown as AudioFrame);
      c.close();
    },
  });
  await processAudioStream(stream as never, {
    sessionId,
    userId,
    userData: {} as never,
    sendDataMessage: async () => undefined,
  });
}

afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
  recordVoiceSample.mockClear();
});

describe('MINOR_CARE: voice samples from the audio processor', () => {
  it('records an ordinary caller’s sample', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    bindSessionUser('ap-ordinary', 'ApMcOrdinary7xQ2pLk9Vb4Hc8Zt');
    await utterance('ap-ordinary', 'ApMcOrdinary7xQ2pLk9Vb4Hc8Zt');
    expect(recordVoiceSample).toHaveBeenCalledTimes(1);
  });

  it('records nothing once the caller has said they are under 18', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const user = 'ApMcHeldUser7xQ2pLk9Vb4Hc8Zt';
    bindSessionUser('ap-held', user);
    expect(heldAfter('ap-held', "I'm 15.", { userId: user })).toBe(true);
    await utterance('ap-held', user);
    expect(recordVoiceSample).not.toHaveBeenCalled();
  });

  it('records as before with MINOR_CARE off', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    const user = 'ApMcFlagsOff7xQ2pLk9Vb4Hc8Zt';
    expect(heldAfter('ap-off', "I'm 15.", { userId: user })).toBe(false);
    await utterance('ap-off', user);
    expect(recordVoiceSample).toHaveBeenCalledTimes(1);
  });
});
