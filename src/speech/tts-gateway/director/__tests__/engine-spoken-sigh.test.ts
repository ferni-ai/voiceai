/**
 * Review M3: the spoken-sigh check must run on the first push that actually
 * has spoken text, not on a tags-only first push (continuation-tts can split
 * the leading `<emotion value="gentle"/>` tag from the "Ahh." that follows it
 * across two pushes). Checking on the tags-only push burns the one-time
 * check before the cue text arrives, so the next push's "Ahh." is never
 * stripped: Stage 2 plays the sigh AND Cartesia says "Ahh." — heard twice.
 */
import { describe, expect, it } from 'vitest';

import { VOICE_IDS } from '../../../../config/voice-ids.js';
import { prosodyTags } from '../../providers/cartesia.js';
import { DirectorEngine, type EngineContext } from '../engine.js';
import { leverModes } from '../gate.js';

const LIVE = leverModes({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NONVERBAL: 'live' });

function newEngine(opensWithSpokenSigh: boolean): DirectorEngine {
  const ctx: EngineContext = {
    modes: LIVE,
    voiceId: VOICE_IDS.FERNI,
    carry: { speed: 1 },
    // RawCues' own invariant (raw-cues.ts): a spoken-sigh cue always implies
    // the general opensWithSigh cue too (`opensWithSigh = opensWithSpokenSigh
    // || OPENING_SIGH.test(head)`); decideOpening reads opensWithSigh.
    cues: { takeSighs: () => 0, opensWithSpokenSigh, opensWithSigh: opensWithSpokenSigh },
    renderTags: prosodyTags,
  };
  return new DirectorEngine(ctx);
}

describe('DirectorEngine: spoken-sigh check timing (review M3)', () => {
  it('a tags-only first push is stashed, not treated as the checked push', () => {
    const engine = newEngine(true);
    const out1 = engine.take('<emotion value="gentle"/>');
    expect(out1).toEqual([]); // nothing to speak yet; opening not decided from empty text
    expect(engine.decided).toBe(false);

    const out2 = engine.take('Ahh. That is hard.');
    expect(out2.join('')).not.toMatch(/ahh/i);
    expect(out2.join('')).toContain('That is hard.');
    expect(engine.decided).toBe(true);
    expect(engine.opening.opening?.kind).toBe('sigh');
  });

  it('control: "Ahh." in the very first push is still stripped (unaffected by the fix)', () => {
    const engine = newEngine(true);
    const out = engine.take('Ahh. That is hard.');
    expect(out.join('')).not.toMatch(/ahh/i);
    expect(out.join('')).toContain('That is hard.');
    expect(engine.opening.opening?.kind).toBe('sigh');
  });

  it('control: without the cue, "Ahh." is left as ordinary speech', () => {
    const engine = newEngine(false);
    const out1 = engine.take('<emotion value="gentle"/>');
    expect(out1).toEqual([]);
    const out2 = engine.take('Ahh. That is hard.');
    expect(out2.join('')).toMatch(/ahh/i);
    expect(engine.opening.opening?.kind).not.toBe('sigh');
  });
});
