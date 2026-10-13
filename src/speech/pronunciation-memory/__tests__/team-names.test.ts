/**
 * The team's names are in the pronunciation dictionary, in valid Cartesia IPA.
 * Before, only Ferni and Nayan were (sonic-capabilities audit, 2026-10-12).
 */
import { describe, expect, it } from 'vitest';

import { pronunciationDictItems, TEAM_NAME_PRONUNCIATIONS } from '../team-names.js';

/** Cartesia's General American phoneme set (docs: capability-guides/phonemes), plus ʌ (Nayan's live entry). */
const PHONEMES = new Set(
  'aɪ aʊ b d dʒ eɪ f h i j k l m n oʊ p s t tʃ u v w z æ ð ŋ ɑ ɔ ɔɪ ə ɛ ɝ ɡ ɪ ɹ ʃ ʊ ʒ θ ˈ ˌ ʌ'.split(
    ' '
  )
);

describe('TEAM_NAME_PRONUNCIATIONS', () => {
  it('covers every teammate, legend and the places in their stories', () => {
    for (const name of [
      'Ferni',
      'Maya',
      'Santos',
      'Jordan',
      'Taylor',
      'Alex',
      'Chen',
      'Peter',
      'Nayan',
      'Patel',
      'Henry',
      'Caldwell',
      'Brannigan',
      'Nate',
      'Holloway',
      'Vadodara',
      'Gujarat',
      'Pawtucket',
    ]) {
      expect(TEAM_NAME_PRONUNCIATIONS[name], name).toBeTruthy();
    }
  });

  it('writes IPA in Cartesia notation: known phonemes, one primary stress', () => {
    for (const [name, value] of Object.entries(TEAM_NAME_PRONUNCIATIONS)) {
      if (!value.startsWith('<<')) continue; // sounds-like (Ferni's live entry)
      const m = /^<<(.+)>>$/.exec(value);
      expect(m, name).not.toBeNull();
      const symbols = m![1].split('|');
      for (const s of symbols) expect(PHONEMES.has(s), `${name}: ${s}`).toBe(true);
      expect(
        symbols.filter((s) => s === 'ˈ'),
        name
      ).toHaveLength(1);
    }
  });
});

describe('pronunciationDictItems', () => {
  const items = pronunciationDictItems();

  it('has one case-sensitive entry per name, the team IPA winning', () => {
    const texts = items.map((i) => i.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(items.every((i) => i.case_sensitive)).toBe(true);
    expect(items.find((i) => i.text === 'Nayan')?.pronunciation).toBe('<<ˈ|n|ʌ|j|ə|n>>');
    expect(items.find((i) => i.text === 'Siobhan')?.pronunciation).toBe('Shi-vawn');
  });
});
