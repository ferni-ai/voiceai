/**
 * The caller's world over three calls, through the real after-call sink
 * (recordWorldObservations) → store → next-call load (loadTemporalWorld).
 * Only the extractor (W1) and Firestore are stood in for.
 */

import { describe, expect, it } from 'vitest';
import { recordWorldObservations } from '../ingest.js';
import { loadTemporalWorld } from '../load.js';
import type { SupersedeJudge } from '../resolve.js';
import { createMemoryWorldFactStore } from './memory-store.js';
import type { WorldObservation } from '../types.js';

const ON = { WORLD_MODEL_TEMPORAL: 'on' };
const TZ = 'America/New_York';
const USER = 'voice-eval-temporal';

// Saturday 2026-10-10: "Mindy's knee surgery is Tuesday." Tuesday is 10-13.
const CALL1_AT = '2026-10-10T18:00:00.000Z';
const CALL1_END = '2026-10-10T18:20:00.000Z';
// Wednesday 2026-10-14: "She had it yesterday... no, Tuesday. She's recovering." "I quit Acme."
const CALL2_AT = '2026-10-14T14:00:00.000Z';
const CALL2_END = '2026-10-14T14:15:00.000Z';

function obs(
  partial: Partial<WorldObservation> & Pick<WorldObservation, 'subject' | 'attribute' | 'value'>,
  at: string,
  sessionId: string
): WorldObservation {
  return {
    subjectKind: partial.subject === 'self' ? 'self' : 'person',
    observedAt: at,
    confidence: 0.9,
    source: { kind: 'summary', sessionId },
    ...partial,
  };
}

const call1 = [
  obs(
    {
      subject: 'Mindy',
      relation: 'sister',
      attribute: 'event',
      value: 'knee surgery',
      eventDate: '2026-10-13',
    },
    CALL1_AT,
    's1'
  ),
  obs({ subject: 'self', attribute: 'job', value: 'works at Acme' }, CALL1_AT, 's1'),
];
const call2 = [
  obs(
    {
      subject: 'Mindy',
      relation: 'sister',
      attribute: 'status',
      value: 'recovering from knee surgery',
      since: '2026-10-13',
    },
    CALL2_AT,
    's2'
  ),
  obs({ subject: 'self', attribute: 'job', value: 'quit Acme' }, CALL2_AT, 's2'),
];

/** Stands in for the LLM: a recovery report finishes the surgery it names. */
const judge: SupersedeJudge = async (o, open) =>
  open.filter((f) => o.value.includes(f.value)).map((f) => f.id);

function ids() {
  let n = 0;
  return () => `f${++n}`;
}

async function threeCalls() {
  const store = createMemoryWorldFactStore();
  const newId = ids();
  await recordWorldObservations(USER, 's1', call1, { store, judge, env: ON, newId });
  return { store, newId };
}

const load = (
  store: ReturnType<typeof createMemoryWorldFactStore>,
  now: string,
  lastEnd: string | null,
  alreadySaid?: string[]
) =>
  loadTemporalWorld(USER, {
    store,
    env: ON,
    now: new Date(now),
    timeZone: TZ,
    lastCallEndedAt: async () => lastEnd,
    alreadySaid,
  });

describe('temporal world: after-call → store → next call', () => {
  it('a scheduled event is upcoming before its day and due once it has passed', async () => {
    const { store } = await threeCalls();

    const before = await load(store, '2026-10-11T15:00:00.000Z', CALL1_END);
    expect(before?.sinceLastCall).toEqual([
      { kind: 'soon', factId: 'f1', text: 'Mindy (sister): knee surgery, Tuesday.' },
    ]);

    const after = await load(store, CALL2_AT, CALL1_END);
    expect(after?.sinceLastCall.map((i) => i.text)).toEqual([
      'Mindy (sister): knee surgery was yesterday. Ask how it went.',
    ]);
    expect(after?.sinceNote).toContain('[SINCE YOU LAST TALKED]');
  });

  it('an update supersedes the old fact; only current facts render, with the change marked', async () => {
    const { store, newId } = await threeCalls();
    const first = await load(store, CALL2_AT, CALL1_END);
    expect(first?.lines.join('\n')).toContain('works at Acme');

    const result = await recordWorldObservations(USER, 's2', call2, {
      store,
      judge,
      env: ON,
      newId,
    });
    expect(result).toEqual({ created: 2, closed: 2, refreshed: 0 });

    // Friday 10-16, the next call.
    const next = await load(store, '2026-10-16T14:00:00.000Z', CALL2_END);
    const text = next?.lines.join('\n') ?? '';
    expect(next?.lines).toContain('Mindy (sister), recovering from knee surgery since Tuesday');
    expect(text).toContain('quit Acme');
    expect(text).not.toContain('works at Acme');
    expect(next?.sinceLastCall ?? []).toEqual([]);

    // History is kept, closed, and points at what replaced it.
    const all = store.all(USER);
    const job = all.find((f) => f.value === 'works at Acme');
    const surgery = all.find((f) => f.value === 'knee surgery');
    const quit = all.find((f) => f.value === 'quit Acme');
    expect(job).toMatchObject({ validTo: CALL2_AT, supersededBy: quit?.id });
    expect(quit).toMatchObject({ validTo: null, replaced: 'works at Acme', supersedes: [job?.id] });
    expect(surgery?.validTo).toBe('2026-10-13T12:00:00.000Z');
  });

  it('nothing stale shows: an event long past with no word on it drops out', async () => {
    const { store } = await threeCalls();
    const weeksLater = await load(store, '2026-11-05T15:00:00.000Z', CALL1_END);
    expect(weeksLater?.sinceLastCall).toEqual([]);
    expect(weeksLater?.lines.join('\n')).not.toContain('surgery');
    expect(weeksLater?.lines).toEqual(['Them, works at Acme']);
  });

  it('a due item the opener or last-call block already carries is not repeated', async () => {
    const { store } = await threeCalls();
    const said = await load(store, CALL2_AT, CALL1_END, [
      "Calling to ask how Mindy's surgery went",
    ]);
    expect(said?.sinceLastCall).toEqual([]);
    const other = await load(store, CALL2_AT, CALL1_END, ['Last time you talked about running']);
    expect(other?.sinceLastCall).toHaveLength(1);
  });

  it('a due item comes up on one call only, even if nothing was learned about it', async () => {
    const { store } = await threeCalls();
    // Call 2 ended 10-14 without a word about the surgery; call 3 is 10-16.
    const third = await load(store, '2026-10-16T14:00:00.000Z', CALL2_END);
    expect(third?.sinceLastCall).toEqual([]);
    // Still current (inside the stale window), shown as passed, not upcoming.
    expect(third?.lines).toContain('Mindy (sister), knee surgery (was Tuesday)');
  });

  it('a first call has no "since"', async () => {
    const { store } = await threeCalls();
    const first = await load(store, CALL2_AT, null);
    expect(first?.sinceLastCall).toEqual([]);
    expect(first?.sinceNote).toBeNull();
  });

  it('something heard outside a call since the last one shows as a change', async () => {
    const { store, newId } = await threeCalls();
    const texted = [
      obs(
        { subject: 'self', attribute: 'job', value: 'started at Stripe' },
        '2026-10-12T16:00:00.000Z',
        'sms-1'
      ),
    ];
    await recordWorldObservations(USER, 'sms-1', texted, { store, judge, env: ON, newId });
    const next = await load(store, '2026-10-12T20:00:00.000Z', CALL1_END);
    expect(next?.sinceLastCall.map((i) => i.text)).toEqual([
      'Mindy (sister): knee surgery, tomorrow.',
      'Them: now started at Stripe (was: works at Acme).',
    ]);
  });

  it('with WORLD_MODEL_TEMPORAL off nothing is written or loaded', async () => {
    const store = createMemoryWorldFactStore();
    expect(await recordWorldObservations(USER, 's1', call1, { store, judge, env: {} })).toBeNull();
    expect(store.all(USER)).toEqual([]);
    expect(await loadTemporalWorld(USER, { store, env: {} })).toBeNull();
  });
});
