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

  // A copy is known by its id, not its text (the bot verifier's N6 at 81554e5158)
  it('a loop copy whose text never says "Open loop" is still dropped on any word', async () => {
    const copy = loopCopy('l9', 'x');
    copy.document.text = 'Coaching insight: the offer from the Denver office. Category: follow_up.';
    expect(await forgetOn([copy], ['Denver job'])).toEqual([]);
  });

  it('a result that only quotes "Open loop (...)" keeps the all-words rule', async () => {
    const text =
      'Coaching insight: Open loop (intention): the offer from the Denver office. Context: Priority: 5, Status: open.';
    const out = await forgetOn([other('journal_entry_j2', text)], ['Denver job']);
    expect(ids(out)).toEqual(['journal_entry_j2']);
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

describe("an open loop's copy is checked against the loop's whole record", () => {
  // The copy keeps the loop's first 100 characters (open-loops.ts saveOpenLoop).
  const said = `${'We kept going over the move, the boxes, the lease and whether the school would work'} and then the Denver office called`;
  const cut = said.substring(0, 100);
  const LOOP_ID = 'loop_1700000000000_ab12cd';
  const PATH = `bogle_users/u-fiction/open_loops/${LOOP_ID}`;
  const record = (extra: Record<string, unknown> = {}) => ({
    id: LOOP_ID,
    userId: 'u-fiction',
    type: 'intention',
    status: 'open',
    priority: 5,
    content: said,
    context: 'we talked on Sunday',
    ...extra,
  });
  const withDocs = (
    topics: string[],
    docs: Record<string, Record<string, unknown> | undefined>
  ) => {
    const asked: string[][] = [];
    const r: ForgetReads = {
      topics: async () => topics,
      docs: async (paths) => {
        asked.push(paths);
        return new Map(paths.map((p) => [p, docs[p]]));
      },
    };
    return { r, asked };
  };
  const run = (
    r: ForgetReads,
    results: Parameters<typeof withoutForgotten>[1],
    env: Record<string, string> = ON
  ) => withoutForgotten('u-fiction', results, r, Date.now(), env);

  it('a forgotten word past the 100-character cut drops the copy', async () => {
    expect(cut).not.toContain('Denver');
    const { r, asked } = withDocs(['Denver job'], { [PATH]: record() });
    expect(await run(r, [loopCopy(LOOP_ID, cut)])).toEqual([]);
    expect(asked).toEqual([[PATH]]);
  });

  it('a person named only in the record (relatedPerson) drops it', async () => {
    const { r } = withDocs(['Kessler'], {
      [PATH]: record({ content: 'call him tomorrow', relatedPerson: 'Kessler' }),
    });
    expect(await run(r, [loopCopy(LOOP_ID, 'call him tomorrow')])).toEqual([]);
  });

  it('the record\'s labels are not the caller\'s words: a topic "intention papers" keeps it', async () => {
    const { r } = withDocs(['intention papers'], {
      [PATH]: record({ content: 'plant the tomatoes' }),
    });
    expect(await run(r, [loopCopy(LOOP_ID, 'plant the tomatoes')])).toHaveLength(1);
  });

  it.each([
    ['status', 'expired passport'],
    ['emotionAtCreation', 'hopeful letters'],
  ])('the record\'s %s is not the caller\'s words (topic "%s")', async (_l, topic) => {
    const rec = record({
      content: 'plant the tomatoes',
      status: 'expired',
      emotionAtCreation: 'hopeful',
    });
    const { r } = withDocs([topic], { [PATH]: rec });
    expect(await run(r, [loopCopy(LOOP_ID, 'plant the tomatoes')])).toHaveLength(1);
  });

  it('nothing forgotten: no record is read, and a failing read drops nothing', async () => {
    const r: ForgetReads = {
      topics: async () => [],
      docs: async () => Promise.reject(new Error('down')),
    };
    expect(await run(r, [loopCopy(LOOP_ID, cut)])).toHaveLength(1);
  });

  it('a record that is gone leaves the copy to its own words', async () => {
    const { r } = withDocs(['Denver job'], {});
    expect(await run(r, [loopCopy(LOOP_ID, cut)])).toHaveLength(1);
  });

  it("a record that can't be read drops loop copies (fails closed), not other results", async () => {
    const r: ForgetReads = {
      topics: async () => ['Denver job'],
      docs: async () => Promise.reject(new Error('down')),
    };
    const out = await run(r, [
      loopCopy(LOOP_ID, cut),
      other('journal_entry_j1', 'plant the tomatoes'),
    ]);
    expect(ids(out)).toEqual(['journal_entry_j1']);
  });

  it('with FORGET_EVERY_READER off, no record is read and the copy stays', async () => {
    const { r, asked } = withDocs(['Denver job'], { [PATH]: record() });
    expect(await run(r, [loopCopy(LOOP_ID, cut)], {})).toHaveLength(1);
    expect(asked).toEqual([]);
  });
});

describe("an expired loop's copy is only labels", () => {
  const expired = (loopId: string) => ({
    document: {
      id: `coaching_coaching_insight_open_loop_${loopId}`,
      text: 'Coaching insight: Open loop (intention) expired. Context: Status: expired. Category: follow_up.',
      metadata: {},
    },
    score: 0.7,
  });

  it.each([['expired passport'], ['follow up with Dana'], ['intention papers']])(
    'a topic "%s" on its labels keeps it',
    async (topic) => {
      expect(await forgetOn([expired('loop_9_zz')], [topic])).toHaveLength(1);
    }
  );

  it("a forgotten word in the loop's record still drops it", async () => {
    const r: ForgetReads = {
      topics: async () => ['Denver job'],
      docs: async (paths) =>
        new Map(paths.map((p) => [p, { status: 'expired', content: 'the Denver offer' }])),
    };
    const out = await withoutForgotten('u-fiction', [expired('loop_9_zz')], r, Date.now(), ON);
    expect(out).toEqual([]);
  });

  it.each([
    ['before the template', 'I got the Denver offer. '],
    ['in its brackets', null],
  ])('caller words %s: read whole', async (_l, prefix) => {
    const copy = expired('loop_9_zz');
    copy.document.text =
      prefix === null
        ? copy.document.text.replace('(intention)', '(the Denver offer)')
        : prefix + copy.document.text;
    expect(await forgetOn([copy], ['Denver job'])).toEqual([]);
  });

  it('text after the template is read whole (a shape it does not know)', async () => {
    const copy = expired('loop_9_zz');
    copy.document.text += ' I got the offer from the Denver office.';
    expect(await forgetOn([copy], ['Denver job'])).toEqual([]);
  });
});
