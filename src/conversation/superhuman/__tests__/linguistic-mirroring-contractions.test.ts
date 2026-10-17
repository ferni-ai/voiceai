import { describe, expect, it } from 'vitest';

import { LinguisticMirroringEngine } from '../linguistic-mirroring.js';

/** An engine that has heard the caller's lines (mirroring starts after three). */
const heard = (...lines: string[]): LinguisticMirroringEngine => {
  const engine = new LinguisticMirroringEngine('contractions-test');
  for (const line of lines) engine.analyzeMessage(line);
  return engine;
};

describe('contraction mirroring', () => {
  // Prod call 2026-10-17: after lines like these, Jordan said "I am Jordan . it is really cool".
  const formal = heard('We are hanging out.', 'I am good.', 'It is fine, we do not mind.');

  it('a caller who says "I am" still hears contractions, never expanded ones', () => {
    expect(formal.getProfile().usesContractions).toBe(false);
    const said = "That's awesome. I'm Jordan. It's really cool to meet you, and I don't mind.";
    expect(formal.applyStreamingSafeMirroring(said)).toBe(said);
    expect(formal.applyMirroring(said).mirroredResponse).not.toMatch(/\b(?:I am|it is|do not)\b/i);
  });

  it('a caller who uses contractions gets ours contracted, keeping a capital at the start', () => {
    const casual = heard("I'm good.", "we're hanging out", "it's fine, don't worry");
    expect(casual.getProfile().usesContractions).toBe(true);
    expect(casual.applyStreamingSafeMirroring('It is late. I am here, and that is okay.')).toMatch(
      /^It's late\. I'm here, and that's okay\.$/
    );
  });
});
