/**
 * Ferni's voice (a Pro clone) ignores <speed> and <emotion> but honors
 * <volume> (config/voice-capabilities.ts, measured 2026-10-03). Stripping
 * for it must keep volume: it is how a reply restarts softly after the caller
 * interrupts, the one level control this voice obeys.
 */
import { describe, expect, it } from 'vitest';

import { LESTER_PRO_V3_VOICE_ID } from '../../../../config/voice-ids.js';
import { prosodyTags } from '../../providers/cartesia.js';
import { opensContextOnEmotionChange } from '../../emotion-context.js';
import { DirectorEngine } from '../engine.js';
import { leverModes } from '../gate.js';

function proCloneEngine(): DirectorEngine {
  return new DirectorEngine({
    modes: leverModes({ SPEECH_DIRECTOR: 'live' }),
    voiceId: LESTER_PRO_V3_VOICE_ID,
    carry: { speed: 1 },
    cues: { takeSighs: () => 0, opensWithSpokenSigh: false, opensWithSigh: false },
    renderTags: prosodyTags,
    stripProsody: true,
  });
}

describe('stripping prosody for a Pro clone keeps volume', () => {
  it('keeps the opening volume and drops speed and emotion', () => {
    const e = proCloneEngine();
    const out = [
      ...e.take('<volume ratio="0.72"/><speed ratio="1.1"/><emotion value="calm"/>Sorry, go on. '),
      ...e.finish(),
    ].join('');
    expect(out).toContain('<volume ratio="0.72"/>');
    expect(out).not.toMatch(/<speed|<emotion/);
    expect(out).toContain('Sorry, go on.');
  });

  it('keeps a later volume change and inline volume tags', () => {
    const e = proCloneEngine();
    const out = [
      ...e.take('Okay, so here is the thing. '),
      ...e.take('<volume ratio="1"/><emotion value="happy"/>It worked out fine. '),
      ...e.finish(),
    ].join('');
    expect(out).toContain('<volume ratio="1"/>');
    expect(out).not.toMatch(/<emotion/);
  });
});

describe('a new Cartesia context per emotion change', () => {
  it('only for voices that honor emotion tags, and not when the director owns emotion', () => {
    // a new context resets intonation: worth it only if the voice renders the emotion
    expect(opensContextOnEmotionChange(LESTER_PRO_V3_VOICE_ID, 'off')).toBe(false);
    expect(opensContextOnEmotionChange('11111111-2222-3333-4444-555555555555', 'off')).toBe(true);
    expect(opensContextOnEmotionChange('11111111-2222-3333-4444-555555555555', 'live')).toBe(false);
  });
});
