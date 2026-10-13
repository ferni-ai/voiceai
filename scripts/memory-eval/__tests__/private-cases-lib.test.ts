import { describe, expect, it } from 'vitest';
import { parseCaseFile } from '../longmem-lib.js';
import {
  GENERATED,
  caseFile,
  generationPrompt,
  groupIntoHistories,
  positiveInt,
  quoteFound,
  verifiedCases,
  type StoredCall,
} from '../private-cases-lib.js';

const day = (d: string) => Date.parse(`${d}T18:00:00Z`);
const calls: StoredCall[] = [
  { id: 'c3', at: day('2026-01-20'), user: ['Started at the new branch office today.'] },
  {
    id: 'c1',
    at: day('2026-01-05'),
    user: ['My cousin Lena lives in Ohio.', 'I play piano at home.'],
  },
  { id: 'c2', at: day('2026-01-12'), user: ['Thinking about switching teams.'] },
];

describe('groupIntoHistories', () => {
  it('groups consecutive calls, oldest first, dated back from the run date', () => {
    const [h, ...rest] = groupIntoHistories(calls, 2, 5, '2026-10-11', 'Priya');
    expect(rest).toEqual([]); // the third call can't fill a second history
    expect(h!.id).toBe('real-1');
    expect(h!.sessions.map((s) => s.user[0])).toEqual([
      'My cousin Lena lives in Ohio.',
      'Thinking about switching teams.',
    ]);
    expect(h!.sessions[0]!.daysAgo).toBe(279); // 2026-01-05 to 2026-10-11
  });
});

describe('generationPrompt', () => {
  it('shows each call with its date and asks for quoted evidence', () => {
    const [h] = groupIntoHistories(calls, 3, 1, '2026-10-11', 'Priya');
    const prompt = generationPrompt(h!, '2026-10-11', 2);
    expect(prompt).toContain('Call 1 (2026-01-05):\n- My cousin Lena lives in Ohio.');
    expect(prompt).toContain('Call 3 (2026-01-20)');
    expect(prompt).toMatch(/exact words from the transcript/);
  });
});

describe('verifiedCases', () => {
  const [h] = groupIntoHistories(calls, 3, 1, '2026-10-11', 'Priya');

  it('keeps cases whose quotes are in what was said, ignoring case and punctuation', () => {
    const raw = JSON.stringify([
      {
        category: 'single-session',
        ask: 'Where does my cousin live?',
        gold: 'Ohio',
        evidence: ['my cousin lena lives in ohio'],
      },
      { category: 'abstention', ask: "What's my dog's name?", gold: 'never said', evidence: [] },
      {
        category: 'single-session',
        ask: 'What do I play?',
        gold: 'drums',
        evidence: ['I play drums at home'],
      }, // not said
      { category: 'temporal', ask: 'When?', gold: '2026-01-05', evidence: [] }, // no quote
      { category: 'restraint', ask: 'q', gold: 'g', evidence: ['I play piano at home.'] }, // not generated
    ]);
    const { kept, dropped } = verifiedCases('```json\n' + raw + '\n```', h!);
    expect(kept.map((c) => c.ask)).toEqual(['Where does my cousin live?', "What's my dog's name?"]);
    expect(dropped).toBe(3);
  });

  it('drops entries that are not objects instead of failing', () => {
    const raw = JSON.stringify([
      null,
      'a string',
      3,
      { category: 'abstention', ask: "What's my dog's name?", gold: 'never said', evidence: [] },
    ]);
    const { kept, dropped, parseError } = verifiedCases(raw, h!);
    expect(parseError).toBe(false);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(3);
    expect(verifiedCases('[null]', h!)).toEqual({ kept: [], dropped: 1, parseError: false });
  });

  it('keeps nothing from a reply that is not a JSON array, and says it failed to parse', () => {
    expect(verifiedCases('Sorry, I cannot do that.', h!)).toEqual({
      kept: [],
      dropped: 0,
      parseError: true,
    });
  });

  it('reads the array past a sentence before the code fence', () => {
    const raw = `Here are the cases:\n\`\`\`json\n${JSON.stringify([
      { category: 'abstention', ask: "What's my dog's name?", gold: 'never said', evidence: [] },
    ])}\n\`\`\`\nHope that helps.`;
    const { kept, parseError } = verifiedCases(raw, h!);
    expect(parseError).toBe(false);
    expect(kept.map((c) => c.category)).toEqual(['abstention']);
  });

  it('does not generate the opener or restraint categories', () => {
    expect(GENERATED).not.toContain('opener');
    expect(GENERATED).not.toContain('restraint');
    expect(generationPrompt(h!, '2026-10-11', 2)).not.toMatch(/- opener/);
  });

  it('writes a case file the benchmark loads', () => {
    const { kept } = verifiedCases(
      JSON.stringify([
        {
          category: 'single-session',
          ask: 'Where does Lena live?',
          gold: 'Ohio',
          evidence: ['lives in Ohio'],
        },
      ]),
      h!
    );
    const loaded = parseCaseFile(caseFile('2026-10-11', [h!], new Map([[h!.id, kept]])));
    expect(loaded.cases[0]!.ask).toBe('Where does Lena live?');
    expect(loaded.histories[0]!.sessions).toHaveLength(3);
  });
});

describe('quoteFound', () => {
  const said = 'my cousin lena lives in ohio i play piano at home';

  it('matches whole words only, so "to the part" is not found in "to the party"', () => {
    expect(quoteFound('play piano at home', said)).toBe(true);
    expect(quoteFound('i play piano at hom', said)).toBe(false);
    expect(quoteFound('went to the part', 'we went to the party')).toBe(false);
    expect(quoteFound('went to the party', 'we went to the party')).toBe(true);
  });

  it('needs a quote of 3 words or 12 characters', () => {
    expect(quoteFound('Ohio', said)).toBe(false); // one word, four characters
    expect(quoteFound('lives in ohio', said)).toBe(true); // three words
    expect(quoteFound('ohio home', said)).toBe(false); // two short words
    expect(quoteFound('saxophonists', 'i love saxophonists')).toBe(true); // one word, 12 characters
  });

  it('rejects a quote that matches only part of a word or a phrase', () => {
    expect(quoteFound('cousin lena lives in ut', said)).toBe(false);
    expect(quoteFound('cousin lena lives in ohio', said)).toBe(true);
  });
});

describe('positiveInt', () => {
  it('takes a positive whole number or the fallback', () => {
    expect(positiveInt(undefined, '--calls', 4)).toBe(4);
    expect(positiveInt('3', '--calls', 4)).toBe(3);
    expect(() => positiveInt('0', '--calls', 4)).toThrow(/positive integer/);
    expect(() => positiveInt('2.5', '--calls', 4)).toThrow(/positive integer/);
    expect(() => positiveInt('many', '--calls', 4)).toThrow(/positive integer/);
  });
});

describe('call ages', () => {
  it('counts calendar days in the caller zone, so a late call keeps its day', () => {
    // 2026-01-05 23:30 in New York is 2026-01-06 04:30 UTC.
    const lateNight = Date.parse('2026-01-06T04:30:00Z');
    const [h] = groupIntoHistories(
      [{ id: 'late', at: lateNight, user: ['Went to bed late.'] }],
      1,
      1,
      '2026-10-11',
      'Priya',
      'America/New_York'
    );
    expect(h!.sessions[0]!.daysAgo).toBe(279);
  });

  const ageIn = (at: number, runDate: string) =>
    groupIntoHistories(
      [{ id: 'c', at, user: ['Hi.'] }],
      1,
      1,
      runDate,
      'Priya',
      'America/New_York'
    )[0]!.sessions[0]!.daysAgo;

  it('keeps a call made on the run day at 0 days ago, dated the run day', () => {
    // 10:00 in New York on the run day.
    expect(ageIn(Date.parse('2026-10-11T14:00:00Z'), '2026-10-11')).toBe(0);
    const [h] = groupIntoHistories(
      [{ id: 'today', at: Date.parse('2026-10-11T14:00:00Z'), user: ['Hi.'] }],
      1,
      1,
      '2026-10-11',
      'Priya',
      'America/New_York'
    );
    expect(generationPrompt(h!, '2026-10-11', 2)).toContain('Call 1 (2026-10-11)');
  });

  it('dates a call at 23:30 the night before as 1 day ago, though it is the run day in UTC', () => {
    // 2026-10-10 23:30 in New York (EDT) is 2026-10-11 03:30 UTC.
    expect(ageIn(Date.parse('2026-10-11T03:30:00Z'), '2026-10-11')).toBe(1);
  });
});
