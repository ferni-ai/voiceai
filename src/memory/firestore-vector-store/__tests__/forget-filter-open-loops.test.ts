/**
 * Vector search drops an open loop's indexed copy on any distinctive word of a forgotten topic,
 * as the open-loops store (#4048) and the insight broker (#4056) do: the copy is the caller's
 * own words (open-loops.ts saveOpenLoop → onCoachingInsightChange → store-hooks.ts, document id
 * `coaching_coaching_insight_open_loop_<id>`). Every other result keeps the all-words rule, so
 * facts, summaries and journal copies don't start over-holding. Only with FORGET_EVERY_READER on;
 * off, every result keeps main's rule. Names are fictional.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearForgottenTopicsCache, withoutForgotten, type ForgetReads } from '../forget-filter.js';

const reads = (topics: string[]): ForgetReads => ({
  topics: async () => topics,
  docs: async (paths) => new Map(paths.map((p) => [p, undefined])),
});

/** An open loop's copy, as store-hooks.ts writes it. */
const loopCopy = (loopId: string, words: string, metadata: Record<string, unknown> = {}) => ({
  document: {
    id: `coaching_coaching_insight_open_loop_${loopId}`,
    text: `Coaching insight: Open loop (intention): ${words}. Context: Priority: 5, Status: open. Category: follow_up. Actionable.`,
    metadata: {
      storeType: 'coaching',
      entityType: 'coaching_insight',
      entityId: `open_loop_${loopId}`,
      ...metadata,
    },
  },
  score: 0.9,
});
const other = (id: string, text: string, metadata: Record<string, unknown> = {}) => ({
  document: { id, text, metadata },
  score: 0.8,
});
const ON = { FORGET_EVERY_READER: 'on' };
const forgetOn = <T extends Parameters<typeof withoutForgotten>[1][number]>(
  results: T[],
  topics: string[],
  env: Record<string, string> = ON
) => withoutForgotten('u-fiction', results, reads(topics), Date.now(), env);
const ids = (out: Array<{ document: { id: string } }>) => out.map((r) => r.document.id);

beforeEach(() => clearForgottenTopicsCache());

describe("an open loop's vector copy is forgotten on any distinctive word", () => {
  it('"forget the Denver job" drops the copy that says "Denver office"', async () => {
    const out = await forgetOn(
      [
        loopCopy('l1', 'I got the offer from the Denver office'),
        loopCopy('l2', 'plant the tomatoes'),
      ],
      ['Denver job']
    );
    expect(ids(out)).toEqual(['coaching_coaching_insight_open_loop_l2']);
  });

  it('is known by its id alone (a copy with no metadata)', async () => {
    const copy = loopCopy('l3', 'I got the offer from the Denver office');
    delete (copy.document as { metadata?: unknown }).metadata;
    const out = await forgetOn([copy], ['Denver job']);
    expect(out).toEqual([]);
  });

  it('every other result keeps the all-words rule: the same text stays', async () => {
    const text = 'Coaching insight: I got the offer from the Denver office.';
    const out = await forgetOn(
      [
        other('coaching_coaching_insight_growth_g1', text, { entityId: 'growth_g1' }),
        other('journal_entry_j1', text),
      ],
      ['Denver job']
    );
    expect(ids(out)).toEqual(['coaching_coaching_insight_growth_g1', 'journal_entry_j1']);
  });

  it('a short-word topic still needs all its words on a loop copy ("Bob DUI" keeps "call Bob")', async () => {
    const out = await forgetOn([loopCopy('l4', 'call Bob back tomorrow')], ['Bob DUI']);
    expect(out).toHaveLength(1);
  });

  it('the copy\'s own labels don\'t count: a topic "priority mail" keeps it', async () => {
    const out = await forgetOn([loopCopy('l5', 'plant the tomatoes')], ['priority mail']);
    expect(out).toHaveLength(1);
  });

  it('a copy of a new shape is read whole', async () => {
    const copy = loopCopy('l6', 'x');
    copy.document.text = 'Open loop: the offer from the Denver office';
    expect(await forgetOn([copy], ['Denver job'])).toEqual([]);
  });

  it("a topic still matching every word drops the copy with the flag off (main's rule)", async () => {
    const out = await forgetOn([loopCopy('l7', 'the Denver job offer')], ['Denver job'], {});
    expect(out).toEqual([]);
  });

  it('the flag only adds: what main drops on the whole copy still drops ("open loop")', async () => {
    expect(await forgetOn([loopCopy('l8', 'plant the tomatoes')], ['open loop'])).toEqual([]);
  });

  it('with FORGET_EVERY_READER off, the copy that says "Denver office" stays', async () => {
    const copy = loopCopy('l1', 'I got the offer from the Denver office');
    expect(ids(await forgetOn([copy], ['Denver job'], {}))).toEqual([copy.document.id]);
    const off = await forgetOn([copy], ['Denver job'], { FORGET_EVERY_READER: 'off' });
    expect(off).toHaveLength(1);
  });
});
