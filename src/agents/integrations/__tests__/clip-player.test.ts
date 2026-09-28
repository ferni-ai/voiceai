import { describe, expect, it } from 'vitest';
import { pcmToFrames } from '../clip-player.js';

describe('pcmToFrames', () => {
  it('turns 24 kHz clip PCM into 48 kHz mixer frames of the same duration', async () => {
    const samples = new Int16Array(24000 / 2); // 500 ms
    for (let i = 0; i < samples.length; i++) samples[i] = Math.round(8000 * Math.sin(i / 10));
    let out = 0;
    for await (const frame of pcmToFrames(samples.buffer)) {
      expect(frame.sampleRate).toBe(48000);
      expect(frame.channels).toBe(1);
      out += frame.samplesPerChannel;
    }
    expect(Math.abs(out - 24000)).toBeLessThan(480); // within 10 ms of 500 ms at 48 kHz
  });
});
