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
    expect(formal.applyStreamingSafeMirroring(said, '')).toBe(said);
    expect(formal.applyMirroring(said).mirroredResponse).not.toMatch(/\b(?:I am|it is|do not)\b/i);
  });

  it('a caller who uses contractions gets ours contracted, keeping a capital at the start', () => {
    const casual = heard("I'm good.", "we're hanging out", "it's fine, don't worry");
    expect(casual.getProfile().usesContractions).toBe(true);
    expect(
      casual.applyStreamingSafeMirroring('It is late. I am here, and that is okay.', '')
    ).toMatch(/^It's late\. I'm here, and that's okay\.$/);
  });

  /**
   * The contraction rule is shared with the speech director (utils/spoken-contractions.ts,
   * #2347). Mirroring keeps every contraction it made, except where the auxiliary is
   * stranded: there it used to break English.
   */
  describe('the shared rule: before and after #2347', () => {
    const casual = heard("I'm good.", "we're hanging out", "it's fine, don't worry");

    it.each([
      ['It is late, and you are right.', "It's late, and you're right."],
      ['That is a massive shift.', "That's a massive shift."],
      ['Here is the thing: there is time.', "Here's the thing: there's time."],
      [
        'I know you are tired, but we are going to figure it out.',
        "I know you're tired, but we're going to figure it out.",
      ],
      ['I know how you are feeling.', "I know how you're feeling."],
      ['I did not mean it, and I do not mind.', "I didn't mean it, and I don't mind."],
      ["I'm ready when you are.", "I'm ready when you are."],
    ])('unchanged: %s', (line, mirrored) => {
      expect(casual.applyStreamingSafeMirroring(line, '')).toBe(mirrored);
    });

    it.each([
      ['I can see how worried you are about this.', "I can see how worried you're about this."],
      ['Look how far we are right now.', "Look how far we're right now."],
      ['I love the way you are right now.', "I love the way you're right now."],
      ['Who you are matters.', "Who you're matters."],
      ['What a mess it is right now!', "What a mess it's right now!"],
      ['I am too.', "I'm too."],
    ])('a stranded auxiliary keeps the full form: %s (was %j)', (line) => {
      expect(casual.applyStreamingSafeMirroring(line, '')).toBe(line);
    });

    it('a streamed chunk that starts mid-sentence keeps the full form; after a sentence it contracts', () => {
      expect(
        casual.applyStreamingSafeMirroring('you are about this.', 'I can see how worried ')
      ).toBe('you are about this.');
      expect(casual.applyStreamingSafeMirroring('you are about to win.', 'Honestly? ')).toBe(
        "you're about to win."
      );
      expect(casual.applyStreamingSafeMirroring('you are about to win.')).toBe(
        'you are about to win.'
      );
    });

    it('streamingMirror carries the reply from chunk to chunk', () => {
      const mirror = casual.streamingMirror();
      expect(mirror('I can see how worried ')).toBe('I can see how worried ');
      expect(mirror('you are about this. ')).toBe('you are about this. ');
      expect(mirror('It is late now.')).toBe("It's late now.");
    });
  });
});
