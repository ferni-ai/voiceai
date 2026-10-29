import { afterEach, describe, expect, it, vi } from 'vitest';

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
   * #2347: mirroring contracts by utils/spoken-contractions.ts. Off (the default),
   * `contractBroadly` keeps main's breadth and fixes only its bugs; with
   * MIRROR_SHARED_CONTRACTIONS=on it uses the speech director's strict rule.
   */
  describe('contraction rule: before and after #2347', () => {
    const casual = heard("I'm good.", "we're hanging out", "it's fine, don't worry");

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** Main got these right mid-clause; flag off must keep every one. */
    const MID_CLAUSE: ReadonlyArray<readonly [string, string]> = [
      ['It is late, and you are right.', "It's late, and you're right."],
      ['Here is the thing: there is time.', "Here's the thing: there's time."],
      ["I'm so glad you are here.", "I'm so glad you're here."],
      ['Sounds like you are exhausted.', "Sounds like you're exhausted."],
      ['Maybe it is time.', "Maybe it's time."],
      ['Of course I am here.', "Of course I'm here."],
      ['Mom says you are the best.', "Mom says you're the best."],
      ['I know how you are feeling.', "I know how you're feeling."],
      ['I know what you are worried about.', "I know what you're worried about."],
      ['It is not your fault.', "It isn't your fault."],
      ['I can not believe it.', "I can't believe it."],
      ['I am Jordan.', "I'm Jordan."],
    ];

    it.each(MID_CLAUSE)('flag off, unchanged from main: %s', (line, mirrored) => {
      expect(casual.applyStreamingSafeMirroring(line, '')).toBe(mirrored);
    });

    /** Main's bugs, fixed with the flag off too: each was its output before #2347. */
    it.each([
      ['I can see how worried you are about this.', "I can see how worried you're about this."],
      ['Look how far we are right now.', "Look how far we're right now."],
      ['I love the way you are right now.', "I love the way you're right now."],
      ['Who you are matters.', "Who you're matters."],
      ['What a mess it is right now!', "What a mess it's right now!"],
      ['How bad do you think it is right now?', "How bad do you think it's right now?"],
      ["I'm ready when you are.", "I'm ready when you're."],
      ['Big Papa it is.', "Big Papa it's."],
      ['It IS a lot.', "It's a lot."],
      ['IT IS WHAT IT IS.', "It's WHAT It's."],
      ['He said, "I am not coming back."', 'He said, "I\'m not coming back."'],
      ["Your note says 'it is done' at the top.", "Your note says 'it's done' at the top."],
      ['Type `do not disturb` in settings.', "Type `don't disturb` in settings."],
    ])('flag off, a bug main had stays fixed: %s (main: %j)', (line) => {
      expect(casual.applyStreamingSafeMirroring(line, '')).toBe(line);
    });

    it('flag off: MIRROR_GRAMMAR_GUARD still decides a clause-final negation', () => {
      expect(casual.applyStreamingSafeMirroring('I do not.', '')).toBe("I don't.");
      vi.stubEnv('MIRROR_GRAMMAR_GUARD', 'on');
      expect(casual.applyStreamingSafeMirroring('I do not.', '')).toBe('I do not.');
    });

    it('flag on: the strict rule, with its new pairs and order', () => {
      vi.stubEnv('MIRROR_SHARED_CONTRACTIONS', 'on');
      expect(casual.applyStreamingSafeMirroring('It is not your fault.', '')).toBe(
        "It's not your fault."
      );
      expect(casual.applyStreamingSafeMirroring('It was not my fault. I will be here.', '')).toBe(
        "It wasn't my fault. I'll be here."
      );
      expect(casual.applyStreamingSafeMirroring('Sounds like you are exhausted.', '')).toBe(
        'Sounds like you are exhausted.'
      );
      expect(casual.applyStreamingSafeMirroring('I am too.', '')).toBe('I am too.');
    });

    it('a chunk keeps a stranded pair when the wh-word came in an earlier chunk', () => {
      expect(
        casual.applyStreamingSafeMirroring('you are about this.', 'I can see how worried ')
      ).toBe('you are about this.');
      expect(casual.applyStreamingSafeMirroring('you are about to win.', 'Honestly? ')).toBe(
        "you're about to win."
      );
      vi.stubEnv('MIRROR_SHARED_CONTRACTIONS', 'on');
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
