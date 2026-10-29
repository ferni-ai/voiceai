import { afterEach, describe, expect, it, vi } from 'vitest';

import { seededChance } from '../../utils/random-generator.js';
import { LinguisticMirroringEngine } from '../linguistic-mirroring.js';
import {
  contractionPattern,
  mirrorGrammarGuardEnabled,
  noToNahPattern,
} from '../mirroring-grammar.js';

/** An engine that has heard three casual lines, so it mirrors contractions and formality. */
const casualCaller = (): LinguisticMirroringEngine => {
  const engine = new LinguisticMirroringEngine('mirroring-grammar-test');
  for (const line of ["yeah I'm gonna chill lol", "nah it's cool haha", "yep we're good lol"]) {
    engine.analyzeMessage(line);
  }
  return engine;
};

/** Pin Date.now to a moment where the 50% casualization roll passes (it seeds on Date.now). */
const pinCasualRoll = (): void => {
  let t = 1;
  while (!seededChance(`${t}:512`, 0.5)) t++;
  vi.spyOn(Date, 'now').mockReturnValue(t);
};

describe('MIRROR_GRAMMAR_GUARD', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is off unless set to "on"', () => {
    expect(mirrorGrammarGuardEnabled({})).toBe(false);
    expect(mirrorGrammarGuardEnabled({ MIRROR_GRAMMAR_GUARD: 'true' })).toBe(false);
    expect(mirrorGrammarGuardEnabled({ MIRROR_GRAMMAR_GUARD: 'on' })).toBe(true);
  });

  describe('flag off: mirroring is unchanged', () => {
    it('still contracts a clause-final pair and turns every "no" into "nah"', () => {
      pinCasualRoll();
      const engine = casualCaller();
      expect(engine.getProfile().formalityLevel).toBe('casual');
      expect(engine.applyStreamingSafeMirroring("I'm ready when you are.")).toBe(
        "I'm ready when you're."
      );
      expect(engine.applyStreamingSafeMirroring('There is no need for that.')).toBe(
        "There's nah need for that."
      );
    });

    it('keeps the old patterns', () => {
      expect(contractionPattern('you are', false).source).toBe('\\byou are\\b');
      expect(noToNahPattern(false).source).toBe('\\bno\\b(?!\\w)');
    });
  });

  describe('flag on: the caller hears grammatical English', () => {
    it('does not contract "you are" / "it is" / "that is" at the end of a clause', () => {
      vi.stubEnv('MIRROR_GRAMMAR_GUARD', 'on');
      const engine = casualCaller();
      // Prod 2026-10-19: "ready when you're.", "Big Papa it's.", "what that's."
      expect(engine.applyStreamingSafeMirroring("I'm ready when you are.")).toBe(
        "I'm ready when you are."
      );
      expect(engine.applyStreamingSafeMirroring('Big Papa it is.')).toBe('Big Papa it is.');
      expect(engine.applyStreamingSafeMirroring("I don't know what that is?")).toBe(
        "I don't know what that is?"
      );
    });

    it('still contracts a pair that a word follows', () => {
      vi.stubEnv('MIRROR_GRAMMAR_GUARD', 'on');
      const engine = casualCaller();
      expect(engine.applyStreamingSafeMirroring('It is late, and you are right.')).toBe(
        "It's late, and you're right."
      );
    });

    it('turns only a standalone "no" into "nah", never "no more" or "no need"', () => {
      vi.stubEnv('MIRROR_GRAMMAR_GUARD', 'on');
      pinCasualRoll();
      const engine = casualCaller();
      // Prod 2026-10-19: "nah more wild accusations", "nah need for that kind of language".
      expect(engine.applyStreamingSafeMirroring('No more wild accusations, I promise.')).toBe(
        'No more wild accusations, I promise.'
      );
      expect(engine.applyStreamingSafeMirroring('There is no need for that.')).toBe(
        "There's no need for that."
      );
      expect(engine.applyStreamingSafeMirroring("No, I didn't hang up. No.")).toBe(
        "nah, I didn't hang up. nah."
      );
    });

    it('matches only a reply-shaped "no"', () => {
      const replace = (s: string): string => s.replace(noToNahPattern(true), 'nah');
      expect(replace('No kids on the way, and no pets either.')).toBe(
        'No kids on the way, and no pets either.'
      );
      expect(replace('Really, no matter what.')).toBe('Really, no matter what.');
      expect(replace('Oh. No!')).toBe('Oh. nah!');
      expect(replace('no')).toBe('nah');
    });
  });
});
