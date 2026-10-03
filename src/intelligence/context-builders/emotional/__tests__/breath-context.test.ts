/**
 * breath-context.ts builds LLM-facing guidance for grounding pauses. It used
 * to splice a literal, copy-pasteable example from breath-sounds.json into
 * that guidance, e.g. "Contemplative breath: <break time=\"300ms\"/>[soft
 * breath]<break time=\"200ms\"/>" — even with the bracket cue stripped out,
 * handing the model a tag snippet to copy risks it reaching for literal SSML
 * syntax in its own replies (the bracket itself isn't a Cartesia nonverbal
 * tag either; only `[laughter]` is). Owner rule: describe the behavior, do
 * not exemplify it — no literal tags or bracket cues anywhere in the
 * guidance text.
 */
import { describe, expect, it } from 'vitest';
import { generateBreathGuidance } from '../breath-context.js';

const CONTEXTS = ['late_night', 'after_share', 'grounding_needed', 'heavy_topic'] as const;

describe('generateBreathGuidance', () => {
  it.each(CONTEXTS)('%s guidance has no literal tag or bracket cue to copy', (context) => {
    const guidance = generateBreathGuidance(context);
    expect(guidance).not.toBeNull();
    // No SSML tags at all (the old bug: "<break .../>[soft breath]<break .../>").
    expect(guidance).not.toMatch(/<[^>]*>/);
    // The fixed "[BREATH: ...]" section header is a prompt label, not a
    // copy-pasteable tag; the hazard is specifically a bracketed nonverbal
    // cue like "[soft breath]" or "[gentle exhale]" — never followed by ":".
    expect(guidance).not.toMatch(
      /\[(?:soft|gentle|deep|quiet|still|slow)?\s*(?:breath|exhale|inhale|sigh)(?!\s*:)/i
    );
  });

  it('describes a wordless pause in plain language per context', () => {
    expect(generateBreathGuidance('after_share')).toMatch(/pause/i);
    expect(generateBreathGuidance('grounding_needed')).toMatch(/pause/i);
    expect(generateBreathGuidance('heavy_topic')).toMatch(/pause/i);
    expect(generateBreathGuidance('late_night')).toMatch(/pause/i);
  });

  it('returns null for "none" and "before_hard_thing" (no guidance to give)', () => {
    expect(generateBreathGuidance('none')).toBeNull();
    expect(generateBreathGuidance('before_hard_thing')).toBeNull();
  });

  it('still caps usage at one breath sound per response', () => {
    expect(generateBreathGuidance('heavy_topic')).toContain(
      'Max 1 breath sound per response. Less is more.'
    );
  });
});
