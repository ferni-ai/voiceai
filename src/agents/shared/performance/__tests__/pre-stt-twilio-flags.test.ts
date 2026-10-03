/**
 * Phone (8 kHz) input respects the per-feature pre-STT flags. It used to be
 * built with forTwilio(), which switched every stage on whatever the config said.
 */
import { describe, expect, it } from 'vitest';
import { PreSTTProcessor, isPreSTTAvailable } from '../pre-stt-transform.js';

const native = await isPreSTTAvailable();
if (!native && process.env.CI) throw new Error('@ferni/audio must load in CI');

describe.runIf(native)('pre-STT on phone input', () => {
  it('passes audio through unchanged when every stage is off', async () => {
    const p = new PreSTTProcessor({
      sampleRate: 8000,
      inputIs8Khz: true,
      enableAgc: false,
      enableNoiseSuppression: false,
      enableHighpass: false,
      enableBandwidthExtension: false,
    });
    await p.initialize();
    expect(p.isUsingRust()).toBe(true);
    const frame = Float32Array.from(
      { length: 160 },
      (_, i) => 0.3 * Math.sin((2 * Math.PI * 300 * i) / 8000)
    );
    const out = p.processFrame(frame.slice(), true);
    expect(Array.from(out)).toEqual(Array.from(frame));
  });
});
