/**
 * The Twilio enhancer always returns 16 kHz, with bandwidth extension off by
 * default (it and noise suppression hurt Ink-2 accuracy on phone audio).
 */
import { describe, expect, it } from 'vitest';
import { getTwilioEnhancer, upsample2x } from '../twilio-audio-enhance.js';

describe('Twilio audio enhancer', () => {
  it('returns 16 kHz audio (twice the 8 kHz input length) by default', async () => {
    const e = await getTwilioEnhancer({ sessionId: 'rate-test' });
    const frame = Int16Array.from({ length: 160 }, (_, i) =>
      Math.round(8000 * Math.sin((2 * Math.PI * 300 * i) / 8000))
    );
    expect(e.enhanceFrame(frame).samples).toHaveLength(320);
    e.cleanup();
  });

  it('upsamples by linear interpolation', () => {
    expect(Array.from(upsample2x(Float32Array.from([0, 1, 0])))).toEqual([0, 0.5, 1, 0.5, 0, 0]);
  });
});
