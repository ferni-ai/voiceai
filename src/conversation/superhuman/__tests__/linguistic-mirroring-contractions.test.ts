import { readFileSync } from 'node:fs';

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
   * #2347. Off (the default), MIRROR_SHARED_CONTRACTIONS leaves mirroring exactly as on
   * main: the golden file holds main's output on 135 lines (the verifier's mirror-ab,
   * mirror-mid and mirror-fresh sets) with MIRROR_GRAMMAR_GUARD off and on. On, mirroring
   * contracts by utils/spoken-contractions.ts in its mirroring mode.
   */
  describe('MIRROR_SHARED_CONTRACTIONS', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const golden = JSON.parse(
      readFileSync(new URL('./fixtures/mirroring-main-golden.json', import.meta.url), 'utf8')
    ) as { cases: Array<{ guard: string; chunks: string[]; main: string }> };
    const fresh = (): LinguisticMirroringEngine =>
      new LinguisticMirroringEngine('golden', { usesContractions: true, sampleCount: 5 });

    it('off: byte-identical to main on all 270 golden cases', () => {
      expect(golden.cases).toHaveLength(270);
      for (const { guard, chunks, main } of golden.cases) {
        vi.stubEnv('MIRROR_GRAMMAR_GUARD', guard);
        const mirror = fresh().streamingMirror();
        expect(chunks.map((chunk) => mirror(chunk)).join(''), chunks.join('')).toBe(main);
      }
    });

    const on = (line: string): string => {
      vi.stubEnv('MIRROR_SHARED_CONTRACTIONS', 'on');
      return fresh().streamingMirror()(line);
    };

    /** Correct contractions main makes; the shared rule must keep every one. */
    it.each([
      ["I'm so glad you are here.", "I'm so glad you're here."],
      ['Sounds like you are exhausted.', "Sounds like you're exhausted."],
      ['Mom says you are the best.', "Mom says you're the best."],
      ['I know how you are feeling.', "I know how you're feeling."],
      ['I know what you are worried about.', "I know what you're worried about."],
      ['I am Jordan.', "I'm Jordan."],
      // Round-4 verifier rows (mirror-fresh): wh-word earlier, not right before the pair.
      ['What I love is that you are so kind to her.', "What I love is that you're so kind to her."],
      ['I love how you are always there for her.', "I love how you're always there for her."],
      ["That's what I am here for.", "That's what I'm here for."],
      ['I wonder what you are up to this weekend.', "I wonder what you're up to this weekend."],
      ['Someone who you are close to can help.', "Someone who you're close to can help."],
      ['What matters is you are safe.', "What matters is you're safe."],
      ["I'm not sure how much it is worth.", "I'm not sure how much it's worth."],
      ['So what you are saying is it is over?', "So what you're saying is it's over?"],
      [
        'Remember how happy you are when you are outside.',
        "Remember how happy you are when you're outside.",
      ],
      ['How lucky are we that it is sunny?', "How lucky are we that it's sunny?"],
      // Elision apostrophes are not quotes.
      ["Call 'em and tell them you are coming.", "Call 'em and tell them you're coming."],
      ["I'll be up 'til late, so I am around.", "I'll be up 'til late, so I'm around."],
      ["It's 'cause you are a good friend.", "It's 'cause you're a good friend."],
    ])("on: keeps main's contraction: %s", (line, mirrored) => {
      expect(on(line)).toBe(mirrored);
    });

    /** Main's bugs, fixed only with the flag on. */
    it.each([
      'I can see how worried you are about this.',
      'Look how far we are right now.',
      'I love the way you are right now.',
      'Who you are matters.',
      'What a mess it is right now!',
      'How bad do you think it is right now?',
      "That's how worried I think you are about this.",
      'How big a deal do you think it is for her?',
      "I'm ready when you are.",
      'Big Papa it is.',
      'I am too.',
      'It IS a lot.',
      'IT IS WHAT IT IS.',
      'He said, "I am not coming back."',
      "Your note says 'it is done' at the top.",
      'Type `do not disturb` in settings.',
    ])('on: keeps the full form main got wrong: %s', (line) => {
      expect(on(line)).toBe(line);
    });

    it('on: the shared table and order', () => {
      expect(on('It is not your fault.')).toBe("It's not your fault.");
      expect(on('It was not my fault. I will be here.')).toBe("It wasn't my fault. I'll be here.");
      expect(on('What is it?')).toBe('What is it?');
    });

    it('on: a wh-word in an earlier chunk still strands the pair', () => {
      vi.stubEnv('MIRROR_SHARED_CONTRACTIONS', 'on');
      const mirror = fresh().streamingMirror();
      expect(mirror('I can see how worried ')).toBe('I can see how worried ');
      expect(mirror('you are about this. ')).toBe('you are about this. ');
      expect(mirror('It is late now.')).toBe("It's late now.");
    });
  });
});
