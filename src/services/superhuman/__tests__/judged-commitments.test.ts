/**
 * COMMITMENT_SINGLE_WRITER: the after-call judge's candidates become stored
 * commitments only when it is sure and the statement names who it is about,
 * and readers under the flag show only those rows. Only the store, the
 * forgotten-topics read and the cohort store are fakes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { forgetFlagCache, type CohortStore } from '../../platform/cohort-flags.js';
import { loadCallCheckIns, toOpenCommitment } from '../commitment-follow-up.js';
import { JUDGED_SOURCE, singleWriterFor } from '../commitment-single-writer.js';
import {
  judgedCommitmentDocs,
  keepJudged,
  recordJudgedCommitments,
  type JudgedCommitment,
  type JudgedSink,
} from '../judged-commitments.js';

const TZ = 'America/New_York';
// Monday 2026-10-12, 12:00 in New York.
const NOW = Date.parse('2026-10-12T16:00:00Z');
const ctx = { userId: 'u1', sessionId: 's1', now: NOW, timezone: TZ };

const j = (over: Partial<JudgedCommitment> = {}): JudgedCommitment => ({
  statement: 'call Mindy tomorrow',
  person: 'Mindy',
  due: '2026-10-13',
  isCommitment: true,
  confidence: 0.9,
  quote: "I'll call her tomorrow",
  ...over,
});

function memorySink(open: string[] = []) {
  const added: Array<Record<string, unknown>> = [];
  const sink: JudgedSink = {
    openJudged: async () => open,
    add: async (_uid, doc) => void added.push(doc),
  };
  return { sink, added };
}

afterEach(() => forgetFlagCache());

describe('which judged candidates are kept', () => {
  it('keeps a sure commitment and drops what the judge said is not one, or is unsure of', () => {
    expect(keepJudged(j())).toBe(true);
    expect(keepJudged(j({ isCommitment: false }))).toBe(false);
    expect(keepJudged(j({ confidence: 0.5 }))).toBe(false);
  });

  it('drops a "her" or "him" with no one named, and keeps it when the caller named who', () => {
    expect(keepJudged(j({ statement: 'call her this afternoon', person: undefined }))).toBe(false);
    expect(keepJudged(j({ statement: 'tell them on Monday', person: 'them' }))).toBe(false);
    // Statements are the caller's own words now, so the pronoun stays and the person says who.
    expect(keepJudged(j({ statement: 'call her tomorrow', person: 'Mindy' }))).toBe(true);
    expect(keepJudged(j({ statement: 'call her tomorrow', person: 'aunt Ingrid' }))).toBe(true);
    expect(keepJudged(j({ statement: 'run three miles tomorrow', person: undefined }))).toBe(true);
    // "it" too: "take it in tomorrow" says nothing without what "it" is.
    expect(keepJudged(j({ statement: 'take it in tomorrow', person: undefined }))).toBe(false);
    expect(keepJudged(j({ statement: 'take it in tomorrow', person: 'the car' }))).toBe(true);
  });

  it('a "his" or "hers" needs who, like "her" and "him"', () => {
    expect(keepJudged(j({ statement: 'return his drill this weekend', person: undefined }))).toBe(false); // prettier-ignore
    expect(keepJudged(j({ statement: 'give hers back on Friday', person: undefined }))).toBe(false);
    expect(keepJudged(j({ statement: 'return his drill this weekend', person: 'Carlos' }))).toBe(true); // prettier-ignore
  });

  it('keeps an "it" no one named when the rest says the plan; never a bare one', () => {
    const it_ = (statement: string) => keepJudged(j({ statement, person: undefined }));
    // #1985 verify: after "How's the car?", only Ferni said what "it" is.
    expect(it_('taking it in for an oil change on Wednesday')).toBe(true);
    expect(it_('handle it')).toBe(false);
    expect(it_('deal with it whenever')).toBe(false);
  });

  it('a "them" or "\'em" needs who or what too', () => {
    expect(keepJudged(j({ statement: "tell 'em on Monday", person: undefined }))).toBe(false);
    // Gemini, 3/3 (#2723 verify): "em" as the person names no one.
    expect(keepJudged(j({ statement: 'tell em on Monday', person: 'em' }))).toBe(false);
    expect(keepJudged(j({ statement: "tell 'em on Monday", person: 'the Hendersons' }))).toBe(true);
    expect(keepJudged(j({ statement: 'clear them out Saturday morning', person: undefined }))).toBe(false); // prettier-ignore
    expect(keepJudged(j({ statement: 'clear them out Saturday morning', person: 'the gutters' }))).toBe(true); // prettier-ignore
  });

  it('writes the resolved statement with person, day and source, followed up that evening', () => {
    const [doc] = judgedCommitmentDocs([j()], ctx);
    expect(doc).toMatchObject({
      userId: 'u1',
      statement: 'call Mindy tomorrow',
      person: 'Mindy',
      personInvolved: 'Mindy',
      due: '2026-10-13',
      source: JUDGED_SOURCE,
      quote: "I'll call her tomorrow",
      status: 'active',
      // Tuesday 2026-10-13, 17:00 in New York.
      targetDate: Date.parse('2026-10-13T21:00:00Z'),
    });
  });

  it('ignores a day already past, keeps one of two same commitments, and at most three a call', () => {
    const [past] = judgedCommitmentDocs([j({ due: '2026-10-10' })], ctx);
    expect(past?.targetDate).toBeUndefined();
    expect(past?.due).toBeUndefined();
    const twice = judgedCommitmentDocs([j(), j({ statement: 'call Mindy tomorrow night' })], ctx);
    expect(twice).toHaveLength(1);
    const many = ['pay rent', 'book the vet', 'renew the passport', 'wash the car'];
    expect(judgedCommitmentDocs(many.map((statement) => j({ statement, person: undefined })), ctx)).toHaveLength(3); // prettier-ignore
  });
});

describe('recordJudgedCommitments', () => {
  it('writes only kept candidates', async () => {
    const { sink, added } = memorySink();
    const n = await recordJudgedCommitments(
      [j(), j({ statement: 'catch you later', isCommitment: false, person: undefined })],
      ctx,
      { sink, forgotten: async () => [] }
    );
    expect(n).toBe(1);
    expect(added.map((d) => d.statement)).toEqual(['call Mindy tomorrow']);
  });

  it('skips one already open as a judged row, a forgotten topic, and writes nothing blind', async () => {
    const open = memorySink(['call Mindy tomorrow']);
    expect(await recordJudgedCommitments([j()], ctx, { sink: open.sink, forgotten: async () => [] })).toBe(0); // prettier-ignore
    const forgot = memorySink();
    expect(await recordJudgedCommitments([j()], ctx, { sink: forgot.sink, forgotten: async () => ['mindy'] })).toBe(0); // prettier-ignore
    const blind = memorySink();
    expect(await recordJudgedCommitments([j()], ctx, { sink: blind.sink, forgotten: async () => null })).toBe(0); // prettier-ignore
    expect([...open.added, ...forgot.added, ...blind.added]).toEqual([]);
  });

  it('stores nothing about a forgotten person, even when only the person field names them', async () => {
    const { sink, added } = memorySink();
    const sister = j({ statement: 'call your sister tomorrow', person: 'Mindy', quote: "I'll call her tomorrow" }); // prettier-ignore
    const forgotten = async () => ['mindy'];
    expect(await recordJudgedCommitments([sister], ctx, { sink, forgotten })).toBe(0);
    expect(await recordJudgedCommitments([sister], ctx, { sink, forgotten: async () => ['rosa'] })).toBe(1); // prettier-ignore
    expect(added.map((d) => d.person)).toEqual(['Mindy']);
  });

  it('writes nothing with the capture kill switch off', async () => {
    const { sink, added } = memorySink();
    const env = { COACH_COMMITMENT_CAPTURE: 'off' };
    expect(await recordJudgedCommitments([j()], ctx, { sink, env, forgotten: async () => [] })).toBe(0); // prettier-ignore
    expect(added).toEqual([]);
  });
});

describe('readers under COMMITMENT_SINGLE_WRITER', () => {
  const legacy = {
    status: 'active',
    statement: "I'll send Tom the resume by Thursday",
    createdAt: NOW - 86_400_000,
  };
  const judged = { ...legacy, statement: 'text Mindy back', source: JUDGED_SOURCE };

  it('flag off: a legacy row reads exactly as before', () => {
    expect(toOpenCommitment('l', legacy)).toMatchObject({
      statement: 'send Tom the resume by Thursday',
    });
    expect(toOpenCommitment('l', { ...legacy, statement: 'call her tomorrow' })).toBeNull();
  });

  it('flag on: legacy rows are hidden, judged rows show, three words included', () => {
    expect(toOpenCommitment('l', legacy, { judgedOnly: true })).toBeNull();
    expect(toOpenCommitment('j', judged, { judgedOnly: true })).toMatchObject({
      statement: 'text Mindy back',
    });
    // "go for a run" ends on a word the regex-capture filter takes for a sign-off.
    expect(
      toOpenCommitment('j', { ...judged, statement: 'go for a run' }, { judgedOnly: true })
    ).not.toBeNull();
  });

  it('check-ins hide a judged row about a forgotten person (person field only), and show nothing blind', async () => {
    const row = { ...judged, statement: 'call your sister tomorrow', person: 'Mindy' };
    const store = { active: async () => [{ id: 'j', data: row }], markFollowedUp: async () => undefined }; // prettier-ignore
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    try {
      expect(
        await loadCallCheckIns('u1', store, NOW, undefined, async () => ['rosa'])
      ).toHaveLength(1);
      expect(await loadCallCheckIns('u1', store, NOW, undefined, async () => ['mindy'])).toEqual(
        []
      );
      expect(await loadCallCheckIns('u1', store, NOW, undefined, async () => null)).toEqual([]);
    } finally {
      delete process.env.COMMITMENT_SINGLE_WRITER;
    }
    // Flag off: as on main, no forget read and the row reads as before.
    const unread = async (): Promise<string[]> => {
      throw new Error('read with the flag off');
    };
    expect(await loadCallCheckIns('u1', store, NOW, undefined, unread)).toHaveLength(1);
  });

  it('is decided per person: a cohort turns it on for one caller and no one else', async () => {
    const store: CohortStore = {
      cohortsFor: async (uid) =>
        uid === 'seth' ? [{ id: 'seth', enabled: true, flags: { COMMITMENT_SINGLE_WRITER: 'on' } }] : [], // prettier-ignore
      overridesFor: async (uid): Promise<Record<string, string>> =>
        uid === 'opted-out' ? { COMMITMENT_SINGLE_WRITER: 'off' } : {},
    };
    const env = { COHORT_FLAGS: 'on' };
    expect(await singleWriterFor('seth', env, store)).toBe(true);
    expect(await singleWriterFor('mom', env, store)).toBe(false);
    // The agent's own 'on' applies unless a person's override says otherwise.
    const agentOn = { ...env, COMMITMENT_SINGLE_WRITER: 'on' };
    expect(await singleWriterFor('mom', agentOn, store)).toBe(true);
    expect(await singleWriterFor('opted-out', agentOn, store)).toBe(false);
    const seen = await Promise.all(
      ['seth', 'mom'].map(async (u) => toOpenCommitment(u, legacy, { judgedOnly: await singleWriterFor(u, env, store) })) // prettier-ignore
    );
    expect(seen.map((c) => c !== null)).toEqual([false, true]);
  });
});
