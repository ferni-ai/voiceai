/**
 * Which dates the hello may ask about, and who a date is about (ruling 1): an
 * allowlist, so any word not on LIGHT_WORDS makes the date sensitive. Fictional labels.
 */
import { describe, expect, it } from 'vitest';
import { LIGHT_WORDS, namesIn, personFromLabel, sensitiveDate } from '../sensitive-date.js';

/** The #3238 verify's held-out labels, both rounds: each once came out ordinary. */
const LEAKED = [
  'hospice visit',
  'rehab visit',
  'AA meeting',
  'visit to the cemetery',
  'move to memory care',
  'dinner with the oncologist',
  'custody meeting',
  'supervised visit with the kids',
  'prison visit',
  'lawyer meeting',
  'mortgage meeting',
  'tax audit meeting',
  're-hab visit',
  'post-op visit',
  'nursing-home visit',
  'assisted-living move',
  'rehabilitation visit',
  'Rehabilitation center visit',
  'physical rehabilitation class',
  'Courthouse visit',
  'aa meeting',
  'er visit',
  'irs meeting',
  'cardiology visit',
  'dermatologist visit',
  'sobriety birthday',
  'one year sober party',
  '12-step meeting',
  'recovery meeting',
  'vet visit to put the dog down',
  'ashes scattering trip',
  "dad's celebration of life",
  'visa interview',
  'green card interview',
  'asylum interview',
  'citizenship interview',
  'meeting with HR about the PIP',
  'credit counseling meeting',
  'meeting with the landlord',
  'reunion with my estranged dad',
  'visit with birth mother',
  "ex's wedding",
];

describe('sensitiveDate: only a label of light words is ordinary', () => {
  it.each(LEAKED)('held out: %j is sensitive', (label) => {
    expect(sensitiveDate(label)).toBe(true);
  });

  it.each([
    "Grandma Rose's procedure",
    "Rose, 10am at St. Mary's", // a name not in a safe shape is a content word
    'Hospice visit', // capitalised, but no possessive, relation or "with" before it
    'HOSPICE VISIT',
    '',
    '   ',
    '10:30',
    'this Saturday', // nothing left but a day
    "Priya's", // nothing left but a name
    'anniversary', // only after "wedding"
    'checkup',
    'scanner pickup',
    "Marcus's wake",
    'the divorce party', // isSensitiveThread
    'meeting with IRS', // capitals are an acronym, never a name
    "Hospital's holiday party", // a heavy word in a name's shape: isSensitiveThread still holds
  ])('%j is sensitive', (label) => {
    expect(sensitiveDate(label)).toBe(true);
  });

  it.each([
    "Priya's visit",
    'dinner with Marcus',
    "Maya's birthday",
    'family reunion',
    'job interview',
    'game night',
    "their sister Priya's visit",
    "mom's birthday",
    'wedding anniversary',
    'new year party',
    'first date',
    "Maya's birthday parties",
    'team games',
    'school concerts',
  ])('control: %j is ordinary', (label) => {
    expect(sensitiveDate(label)).toBe(false);
  });

  it('a word off the list is enough, even beside light ones', () => {
    expect(sensitiveDate('soccer game')).toBe(true);
  });
});

/** A small deterministic generator (no seed state shared between tests). */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
/** Paired words, and "night", which is also a time word: none stands alone. */
const PAIRED = new Set(['anniversary', 'new', 'year', 'night']);
const LIGHT = [...LIGHT_WORDS].filter((w) => !PAIRED.has(w));
const DAYS = ['Saturday', 'tomorrow', 'next', 'Friday', 'tonight', 'this', 'morning', '7pm', '12'];
const NAMES = ['Priya', 'Marcus', 'Rose', 'Maya'];

describe('sensitiveDate properties (500 labels each)', () => {
  it('a label with any word off the list is sensitive', () => {
    const r = rng(7);
    for (let n = 0; n < 500; n++) {
      const letters = 'bcdfghjklmnpqrstvwxz';
      let odd = '';
      while (odd.length < 4) odd += pick(r, [...letters]);
      odd += pick(r, ['ia', 'ology', 'ist', 'ment', 'ing', 'y']);
      const words = Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(r, LIGHT));
      words.splice(Math.floor(r() * (words.length + 1)), 0, odd);
      const label = words.join(r() < 0.5 ? ' ' : '-');
      expect(sensitiveDate(label), label).toBe(true);
    }
  });

  it('a label of light words, safe-shaped names and day words is ordinary', () => {
    const r = rng(11);
    for (let n = 0; n < 500; n++) {
      const name = pick(r, NAMES);
      const who = pick(r, [`${name}'s`, `my sister ${name}'s`, '', 'our']);
      const light = Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(r, LIGHT));
      const tail = pick(r, ['', ` with ${name}`, ` ${pick(r, DAYS)}`, ` on ${pick(r, DAYS)}`]);
      const label = `${who} ${light.join(' ')}${tail}`.trim();
      expect(sensitiveDate(label), label).toBe(false);
    }
  });
});

describe('namesIn and personFromLabel', () => {
  it.each([
    ["Priya's visit", ['Priya']],
    ['dinner with Marcus', ['Marcus']],
    ["their sister Priya's visit", ['Priya']],
    ['Hospice visit', []],
    ['meeting with HR', []],
  ])('namesIn(%j) -> %j', (label, expected) => {
    expect(namesIn(label)).toEqual(expected);
  });

  it.each([
    ["Grandma Rose's procedure", 'grandma Rose'],
    ["their sister Priya's visit", 'sister Priya'],
    ["my mom's surgery", 'mom'],
    ['Dad biopsy', 'dad'],
    ['grandpa Surgery', 'grandpa'], // a capitalised topic word is never taken for a name
    ['mom Oncology follow-up', 'mom'],
    ['mom Dad dinner', 'mom'],
    ['sister Wedding', 'sister'],
    ["Rose, 10am at St. Mary's", null],
    ["Marcus's appointment", null], // a bare name is no relation from the lexicon
    ['', null],
    ['stepmother', null], // whole words only
  ])('personFromLabel(%j) -> %s', (label, expected) => {
    expect(personFromLabel(label)).toBe(expected);
  });
});
