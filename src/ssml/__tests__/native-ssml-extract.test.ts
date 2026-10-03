/**
 * The native SSML extractors return what their TypeScript contract says:
 * objects with the tag's position as a JavaScript string index. They used to
 * return bare values (breaks: numbers, emotions: strings) and extractSpeeds
 * was not exported at all, so extractSpeedsNative threw.
 */
import { describe, expect, it } from 'vitest';
import {
  extractBreaksNative,
  extractEmotionsNative,
  extractSpeedsNative,
  isNativeSsmlAvailable,
} from '../native-ssml-processor.js';

const available = isNativeSsmlAvailable();
if (!available && process.env.CI) throw new Error('@ferni/perf must load in CI');

describe.runIf(available)('native SSML extractors', () => {
  // Non-ASCII before the tags: byte offsets would point to the wrong place.
  const text = 'Café 😊 <break time="300ms"/>ok<speed ratio="0.9"/>and <emotion value="calm"/>done';

  it('return tags with positions that slice the JS string exactly', () => {
    const [b] = extractBreaksNative(text);
    expect(b.durationMs).toBe(300);
    expect(text.slice(b.startPos, b.endPos)).toBe('<break time="300ms"/>');

    const [s] = extractSpeedsNative(text);
    expect(s.speed).toBeCloseTo(0.9);
    expect(text.slice(s.startPos, s.endPos)).toBe('<speed ratio="0.9"/>');

    const [e] = extractEmotionsNative(text);
    expect(e.emotion).toBe('calm');
    expect(text.slice(e.startPos, e.endPos)).toBe('<emotion value="calm"/>');
  });
});
