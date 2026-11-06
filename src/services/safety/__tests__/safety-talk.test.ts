/**
 * namesSafetyHelp is the one reader for "does this sentence name an emergency
 * service or a help line?". It must never be narrower than the readers it
 * replaces, and it fails closed: the overmatches below are the price. All lines
 * are fictional.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { offersCrisisLine } from '../crisis-line-speech.js';
import { CRISIS_RESOURCES } from '../crisis-response.js';
import { EMERGENCY_SERVICE, namesSafetyHelp } from '../index.js';

type Reader = 'service' | 'offersCrisisLine' | 'namesSafetyLine' | 'lineCallerDials';
/**
 * Every string an old safety reader matched, pinned so namesSafetyHelp is never
 * narrower than any of them: emergency-claim's SERVICE (EMERGENCY_SERVICE, read
 * lower-case), offersCrisisLine, #3499's namesSafetyLine (at 8d122af2b) and
 * #3500's lineCallerDials (at 4e227ce9f, closed, read as a whole `who`). Two of
 * the readers are not on main, so their hits are kept here. Computed 2026-11-06
 * over those readers' own tests, main's action-claim and crisis-line tests, the
 * scripts/crisis-eval corpus and labelled cases, and the names the crisis verify
 * listed. readAsWholeNumber: the only strings an old reader matched that
 * namesSafetyHelp leaves. lineCallerDials joined a sentence's digits into 988;
 * offersCrisisLine's own tests pin each as no crisis line.
 */
const PINNED = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/safety-talk-corpus.json'), 'utf8')
) as Record<Reader | 'readAsWholeNumber', string[]>;
const SERVICE = new RegExp(EMERGENCY_SERVICE);
const CORPUS_DIR = join(__dirname, '../../../../scripts/crisis-eval/corpus');

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('namesSafetyHelp is never narrower than an old reader', () => {
  it.each<Reader>(['service', 'offersCrisisLine', 'namesSafetyLine', 'lineCallerDials'])(
    'reads every string %s read',
    (reader) => {
      const hits = PINNED[reader];
      expect(hits.length).toBeGreaterThan(80);
      expect(hits.filter((t) => !namesSafetyHelp(t))).toEqual([]);
    }
  );

  it('reads whatever offersCrisisLine or EMERGENCY_SERVICE reads in the crisis-eval corpus', () => {
    const corpus = readdirSync(CORPUS_DIR).flatMap((f) =>
      strings(JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')))
    );
    const read = corpus.filter((t) => offersCrisisLine(t) || SERVICE.test(t.toLowerCase()));
    expect(read.length).toBeGreaterThan(10);
    expect(read.filter((t) => !namesSafetyHelp(t))).toEqual([]);
  });

  it('leaves only the sentences lineCallerDials read as one joined number', () => {
    for (const t of PINNED.readAsWholeNumber) {
      expect(offersCrisisLine(t), t).toBe(false);
      expect(namesSafetyHelp(t), t).toBe(false);
    }
  });
});

describe('names every line and service the crisis verify listed', () => {
  it.each([
    'Call the suicide prevention line tonight.',
    'suicide prevention',
    'RAINN can help with that.',
    'You could try NAMI.',
    'SAMHSA',
    'Childhelp',
    'the Trevor Project',
    'Trans Lifeline',
    'the Veterans Crisis Line',
    'a crisis counselor',
    'the warmline',
    '1-800-273-TALK',
    'Go to the ER.',
    'Get to A&E now.',
    'urgent care',
    'poison control',
    'Samaritans',
    'a helpline',
    'the hotline',
    'a DV hotline',
    'the crisis team',
    'the crisis text line',
    'Text HOME to 741741.',
    'Call 988.',
    'nine eight eight',
    'the paramedics',
    'Call the police.',
    'EMS is on the way.',
    'an ambulance',
    'the fire department',
    'Call 911.',
    '9-1-1',
    '9 1 1',
    'nine one one',
    'Ring 999 now.',
    'Dial 112.',
    'Call 000.',
    'triple zero',
    'triple nine',
    'call 311',
    '311',
    '(888) 555-0100',
  ])('%s', (text) => {
    expect(namesSafetyHelp(text)).toBe(true);
  });
});

describe('reads the CRISIS_RESOURCES lines from the resources themselves', () => {
  const resources = Object.values(CRISIS_RESOURCES).flat();

  it.each(resources.map((r) => [r.name]))('by name: %s', (name) => {
    expect(namesSafetyHelp(`You could reach ${name}.`)).toBe(true);
  });

  it('by the short name a line starts with', () => {
    for (const short of ['RAINN', 'NAMI', 'SAMHSA', 'Childhelp']) {
      expect(namesSafetyHelp(`Have you tried ${short}?`), short).toBe(true);
    }
  });

  it('by every phone and text number', () => {
    const numbers = resources
      .flatMap((r) => [r.phone, r.text])
      .map((s) => (s ?? '').replace(/[^\d-]/g, ''))
      .filter((d) => d.replace(/-/g, '').length >= 3);
    expect(numbers.length).toBeGreaterThan(8);
    for (const n of numbers) expect(namesSafetyHelp(`The number is ${n}.`), n).toBe(true);
    expect(namesSafetyHelp('Text START to 88788.')).toBe(true);
  });
});

describe('ordinary talk is no safety help', () => {
  it.each([
    'call the hotel',
    'the police drama',
    'We watched that police procedural again.',
    '999 problems',
    'I owe 112 dollars.',
    'It cost $1,000.',
    'the fire was lovely',
    'my emergency contact is my sister',
    'Call me at 6 tomorrow.',
    'I called my mom.',
    'the line at the bank was long',
    'That trip cost $988 all in.',
    'Route 66 is a long drive.',
    'Order 98812 shipped today.',
  ])('%s', (text) => {
    expect(namesSafetyHelp(text)).toBe(false);
  });
});

describe('fails closed on ordinary names that share the words', () => {
  it.each([
    'Hope from the hotline team at work called.',
    "Sam from Samaritan's Purse dropped by.",
    'the customer service hotline',
    'My bank is 1-800-555-0100.',
    'She was a lifeline for the shop.',
    'He works in the ER.',
    "It's not an emergency.",
    'the police are slow on our street',
    'Call 411 for the number.',
  ])('%s', (text) => {
    expect(namesSafetyHelp(text)).toBe(true);
  });
});
