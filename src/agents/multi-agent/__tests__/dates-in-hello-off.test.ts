/**
 * DATES_IN_HELLO off is today's behaviour, byte for byte: the greeting cue, the
 * first recall note and the due-date wording. The snapshot was recorded on main
 * (80331144d) before the date candidate existed, with dates due that the flag
 * would raise (an ordinary one and a sensitive one), so any leak changes it.
 * Fictional caller only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaisableDate } from '../../../intelligence/world-model/dates/recall.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
  source: 'understudy',
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
const state = vi.hoisted(() => ({ win: false, letter: false, reads: 0 }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () =>
    state.win ? { id: 'w1', commitmentId: 'w1', text: 'call my sister Sunday' } : undefined
  ),
  markWinSurfaced: vi.fn(async () => undefined),
}));
vi.mock('../../../tools/domains/engagement/future-letters.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  letterToOffer: vi.fn(async () =>
    state.letter ? { writtenOn: 'October 18, 2026', mark: vi.fn() } : undefined
  ),
}));

const DAY = 86_400_000;
const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
function date(id: string, over: Partial<RaisableDate>): RaisableDate {
  return {
    id,
    subject: 'Priya',
    subjectKind: 'person',
    relation: 'sister',
    subjectKey: 'person:priya',
    attribute: 'event',
    value: 'visit',
    observedAt: '2026-10-01T18:00:00Z',
    validFrom: '2026-10-01T18:00:00Z',
    validTo: null,
    confidence: 0.9,
    source: { kind: 'summary', sessionId: 's0' },
    kind: 'event',
    recurrence: 'once',
    when: 'Saturday',
    needsConfirmation: false,
    ...over,
  };
}
const facts: RaisableDate[] = [];
vi.mock('../../../intelligence/world-model/temporal/store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createFirestoreWorldFactStore: () => ({
    listOpen: async () => {
      state.reads++;
      return facts;
    },
    listRaisedSince: async () => [],
    apply: async () => undefined,
  }),
  markFactRaised: vi.fn(async () => undefined),
}));

const { directedGreeting } = await import('../greeting-direction.js');
const { createMemoryRecall } = await import('../memory-recall-hook.js');
const { createDatesRecall, dueDate, formatDueDate } =
  await import('../../../intelligence/world-model/dates/recall.js');

const USER = 'voice-eval-dates-off';
let n = 0;
async function cue(): Promise<{ direction: string; facts: Record<string, string> }> {
  await directedGreeting(`dio-${++n}`, 'ferni', { userId: USER, userName: 'Riley' });
  const req = directedText.mock.calls.at(-1)![1] as unknown as {
    direction: string;
    facts: Record<string, string>;
  };
  const { ['time of day']: _hour, ...rest } = req.facts; // the hour of the test run
  return { direction: req.direction, facts: rest };
}

beforeEach(() => {
  vi.stubEnv('DATES_IN_HELLO', 'off');
  const now = Date.now();
  facts.length = 0;
  facts.push(
    date('wd_visit', { eventDate: ymd(now + 2 * DAY) }),
    date('wd_proc', {
      subject: 'Rose',
      relation: 'grandma',
      subjectKey: 'person:rose',
      value: 'procedure',
      eventDate: ymd(now + DAY),
    })
  );
  state.reads = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  state.win = false;
  state.letter = false;
});

describe('DATES_IN_HELLO off: the greeting cue is as on main', () => {
  it.each([
    ['nothing else to open on', {}],
    ['a win', { win: true }],
    ['a letter', { letter: true }],
  ])('%s', async (_label, over) => {
    Object.assign(state, over);
    expect(await cue()).toMatchSnapshot();
    expect(state.reads).toBe(0); // off: the dates are never even read for the hello
  });
});

describe('DATES_IN_HELLO off: the recall note and the due-date wording are as on main', () => {
  const TODAY = '2026-10-16';
  const at = (d: number): string => ymd(Date.parse(`${TODAY}T12:00:00Z`) + d * DAY);

  it('the first recall note raises tomorrow’s sensitive date as before', async () => {
    const store = {
      listOpen: async () => [
        date('wd_proc', {
          subject: 'Rose',
          relation: 'grandma',
          subjectKey: 'person:rose',
          value: 'procedure',
          eventDate: at(1),
        }),
      ],
      listRaisedSince: async () => [],
      apply: async () => undefined,
    };
    const dates = createDatesRecall({
      userId: USER,
      store,
      now: () => new Date(`${TODAY}T15:00:00Z`),
      forgotten: async () => [],
      mark: async () => undefined,
    });
    const recall = createMemoryRecall({
      userId: USER,
      userName: 'Riley',
      store: { facts: async () => [], summaries: async () => [] },
      ledgerStore: { save: async () => undefined, recent: async () => [] },
      dates,
      opener: true,
    });
    await recall.ready;
    expect(recall.noteFor('Hey, it is me.', { final: true })).toMatchSnapshot();
  });

  it.each([
    ['ordinary, passed', { eventDate: at(-1) }],
    ['ordinary, today', { eventDate: TODAY, observedAt: '2026-10-01T18:00:00Z' }],
    ['ordinary, tomorrow', { eventDate: at(1) }],
    ['sensitive, passed', { value: 'procedure', eventDate: at(-2) }],
    ['sensitive, tomorrow', { value: 'biopsy', eventDate: at(1) }],
    ['unclassifiable, tomorrow', { value: 'at St. Mary’s', eventDate: at(1) }],
  ])('%s', (_label, over) => {
    const due = dueDate([date('wd_x', over)], TODAY);
    expect(due && formatDueDate(due)).toMatchSnapshot();
  });

  it('a one-time date two days out is not due yet', () => {
    expect(dueDate([date('wd_x', { eventDate: at(2) })], TODAY)).toBeNull();
  });
});
