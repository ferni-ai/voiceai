/**
 * The pronunciation dictionary is valid Cartesia input and covers the team.
 * Before 2026-10-12 only Ferni and Nayan were in it; before 2026-10-20
 * Nayan's IPA used ʌ, a symbol outside Cartesia's set.
 */
import { describe, expect, it } from 'vitest';

import { COMMON_DIFFICULT_NAMES } from '../constants.js';
import {
  NAME_IPA,
  pronunciationDictItems,
  SPOKEN_WORD_PRONUNCIATIONS,
  TEAM_NAME_PRONUNCIATIONS,
  type PronunciationDictItem,
} from '../team-names.js';

/** Cartesia's General American phoneme set, all 41 (docs: capability-guides/phonemes). */
const PHONEMES = new Set(
  'p b t d k ɡ tʃ dʒ f v θ ð s z ʃ ʒ h m n ŋ l ɹ j w i ɪ ɛ æ ɑ ɔ ʊ u ə ɝ eɪ aɪ ɔɪ aʊ oʊ ˈ ˌ'.split(
    ' '
  )
);

const items = pronunciationDictItems();
const isIpa = (p: string) => p.includes('<<');

/**
 * Cartesia's matching as probed 2026-10-20: whole words, a possessive matches
 * its base word, case-sensitive keys match their own spelling (a lowercase
 * one also the sentence-start capital), case-insensitive keys any spelling.
 */
function entryFor(word: string, dict: PronunciationDictItem[]): PronunciationDictItem | undefined {
  const base = word.replace(/['’]s$/, '');
  return dict.find((i) =>
    i.case_sensitive
      ? i.text === base ||
        (i.text === i.text.toLowerCase() && base === i.text[0].toUpperCase() + i.text.slice(1))
      : i.text.toLowerCase() === base.toLowerCase()
  );
}

describe('pronunciationDictItems', () => {
  it('writes every IPA entry in Cartesia notation: known symbols, one primary stress an entry', () => {
    for (const { text, pronunciation } of items.filter((i) => isIpa(i.pronunciation))) {
      let primaries = 0;
      for (const word of pronunciation.split(' ')) {
        const m = /^<<(.+)>>$/.exec(word);
        expect(m, `${text}: ${word}`).not.toBeNull();
        const symbols = (m?.[1] ?? '').split('|');
        for (const s of symbols) expect(PHONEMES.has(s), `${text}: "${s}"`).toBe(true);
        primaries += symbols.filter((s) => s === 'ˈ').length;
        expect(symbols.at(-1), `${text} ends in a stress mark`).not.toMatch(/[ˈˌ]/);
      }
      expect(primaries, text).toBe(1);
    }
  });

  it('says Nayan NAH-yahn: two words so ɑ+j does not glide into "NIGH", stress on the first', () => {
    // One-word <<ˈ|n|ɑ|j|ɑ|n>> came out "n aɪ" in 23 of 24 takes (2026-10-20).
    expect(TEAM_NAME_PRONUNCIATIONS.Nayan).toBe('<<ˈ|n|ɑ>> <<j|ɑ|n>>');
    expect(entryFor("Nayan's", items)?.pronunciation).toBe('<<ˈ|n|ɑ>> <<j|ɑ|n>>');
  });

  it('keeps sounds-like spellings free of capital runs, which Sonic spells out as letters', () => {
    for (const { text, pronunciation } of items.filter((i) => !isIpa(i.pronunciation))) {
      expect(pronunciation, text).not.toMatch(/[A-Z]{2,}/);
      expect(pronunciation, text).not.toMatch(/[<>|]/);
    }
  });

  it('has one entry per text, with no clash Cartesia would reject', () => {
    const texts = items.map((i) => i.text);
    expect(new Set(texts).size).toBe(texts.length);
    // A case-insensitive key collides with any entry of the same letters.
    const folded = items.filter((i) => !i.case_sensitive).map((i) => i.text.toLowerCase());
    for (const f of folded) {
      expect(
        items.filter((i) => i.text.toLowerCase() === f),
        f
      ).toHaveLength(1);
    }
  });

  it("leaves callers' names to Sonic: no untested sounds-like spelling of a common name", () => {
    // 2026-10-22: the owner heard Ferni say names "way off". These were among
    // 107 forced on every caller with that name, however they say it.
    for (const word of ['Chloe', 'Zoe', 'Liam', 'Bjorn', 'Leila', 'Joao', 'Niamh', 'Sean']) {
      expect(COMMON_DIFFICULT_NAMES[word.toLowerCase()], word).toBeDefined();
      expect(entryFor(word, items), word).toBeUndefined();
    }
    const tested = new Set([
      ...Object.keys(NAME_IPA),
      ...Object.keys(SPOKEN_WORD_PRONUNCIATIONS),
      ...Object.keys(TEAM_NAME_PRONUNCIATIONS),
    ]);
    expect(items.filter((i) => !tested.has(i.text)).map((i) => i.text)).toEqual([]);
    // The tested IPA still covers names Sonic misread with no entry.
    expect(entryFor('Siobhan', items)?.pronunciation).toBe(NAME_IPA.Siobhan);
    expect(entryFor('Nayan', items)?.pronunciation).toBe(TEAM_NAME_PRONUNCIATIONS.Nayan);
  });

  it('covers every teammate, legend and story place, and their possessives through the base word', () => {
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
      expect(entryFor(name, items)?.pronunciation, name).toBe(TEAM_NAME_PRONUNCIATIONS[name]);
      expect(entryFor(`${name}'s`, items)?.pronunciation, `${name}'s`).toBe(
        TEAM_NAME_PRONUNCIATIONS[name]
      );
      expect(entryFor(`${name}’s`, items)?.pronunciation, `${name}’s`).toBe(
        TEAM_NAME_PRONUNCIATIONS[name]
      );
    }
    // Possessives come from the base word; an "X's" entry would be dead weight.
    expect(items.filter((i) => /['’]s$/.test(i.text))).toEqual([]);
  });

  it('matches spoken words in any capitalisation, plurals by their own entry', () => {
    for (const text of Object.keys(SPOKEN_WORD_PRONUNCIATIONS))
      expect(text).toBe(text.toLowerCase());
    expect(entryFor('Saudade', items)?.pronunciation).toBe(SPOKEN_WORD_PRONUNCIATIONS.saudade);
    expect(entryFor('401K', items)?.pronunciation).toBe('four oh one K');
    expect(entryFor('quinceañeras', items)?.pronunciation).toBe(
      SPOKEN_WORD_PRONUNCIATIONS.quinceañeras
    );
    expect(entryFor('Quinceaneras', items)?.pronunciation).toBe(
      SPOKEN_WORD_PRONUNCIATIONS.quinceaneras
    );
  });

  it('leaves out words a global entry would get wrong somewhere', () => {
    // "Louis" as "Loo-ee" broke St. Louis; function words take every reading.
    for (const word of ['Louis', 'her', 'Her', 'him', 'the', 'live', 'read', 'desert']) {
      expect(entryFor(word, items), word).toBeUndefined();
    }
  });
});
