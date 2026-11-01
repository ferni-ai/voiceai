/**
 * dateFor (DATES_IN_HELLO): a date the caller told Ferni about, within three
 * days, as a candidate for the hello's one thread. Picking it writes nothing;
 * only commit(line), when the line names its day or person, marks it raised and
 * claims the opener. A sensitive date is presence, never a question or its topic
 * word. Fictional caller, fake store, and no database (it counts as a crisis).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaisableDate } from '../../../intelligence/world-model/dates/recall.js';
import { dueDate } from '../../../intelligence/world-model/dates/recall.js';
import { clearOpenerClaims, takeOpenerClaim } from '../../../memory/recall/opener-claim.js';
import { noteCrisisRisk } from '../../../services/safety/crisis-call-risk.js';
import { dateFor } from '../greeting-date.js';

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => null,
}));

const USER = 'voice-eval-riley';
const NOW = new Date('2026-10-14T15:00:00Z'); // a Wednesday
const TODAY = '2026-10-14';
const day = (n: number): string =>
  new Date(Date.parse(`${TODAY}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function date(over: Partial<RaisableDate>): RaisableDate {
  return {
    id: 'wd_1',
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
    when: 'Friday',
    needsConfirmation: false,
    eventDate: day(2),
    ...over,
  };
}

let stored: RaisableDate[] = [];
let crisisLately = false;
const listOpen = vi.fn(async () => stored);
const store = { listOpen, listRaisedSince: async () => [], apply: async () => undefined };
const mark = vi.fn(async () => undefined);
let n = 0;
const pick = (userId: string = USER, sessionId = `gd-${++n}`) =>
  dateFor(
    { userId, sessionId, zone: 'UTC' },
    {
      now: () => NOW,
      store,
      mark,
      forgotten: async () => [],
      recentCrisis: async () => crisisLately,
    }
  );

beforeEach(() => {
  vi.stubEnv('DATES_IN_HELLO', 'on');
  stored = [date({})];
  listOpen.mockClear();
  mark.mockClear();
  clearOpenerClaims();
  crisisLately = false;
});
afterEach(() => vi.unstubAllEnvs());

describe('dateFor picks without side effects', () => {
  it('an ordinary date two days out: the spec direction, its words in the facts, nothing written', async () => {
    const c = await pick();
    expect(c?.careful).toBe(false);
    expect(c?.factId).toBe('wd_1');
    expect(c?.direction).toBe(
      ' There is something on their calendar soon: you may say hello, then mention it once and let them take it where they want, naming it in their words ("Hey Riley. Priya\'s visit is Saturday, isn\'t it. Looking forward to it?"). Not a report.'
    );
    expect(c?.facts).toEqual({
      'something on their calendar': "their sister Priya's visit",
      when: 'Friday',
    });
    expect(mark).not.toHaveBeenCalled();
    expect(takeOpenerClaim(USER)).toBeUndefined();
  });

  it('commit marks it raised for its day and moment, and claims the opener as the greeting date', async () => {
    const sessionId = 'gd-commit';
    const c = await pick(USER, sessionId);
    c!.commit("Hey Riley. Priya's visit is Friday, isn't it.");
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(USER, 'wd_1', TODAY, 'soon', sessionId);
    expect(takeOpenerClaim(USER)).toBe('greeting-date');
  });

  it.each(['Hey Riley. What are you up to?', 'Hey Riley. How was your week?', ''])(
    'commit with a line that never names the date writes nothing: %j',
    async (line) => {
      const c = await pick();
      c!.commit(line);
      expect(mark).not.toHaveBeenCalled();
      expect(takeOpenerClaim(USER)).toBeUndefined();
    }
  );

  it.each([
    ['its day', 'Hey Riley. Big Friday coming.'],
    ['its person', 'Hey Riley. How is Priya doing?'],
  ])('commit with a line that names only %s still counts', async (_l, line) => {
    const c = await pick();
    c!.commit(line);
    expect(mark).toHaveBeenCalledTimes(1);
  });

  // The #3238 verify's six false commits, and two more: a shared word is not the date.
  it.each([
    ['soon', 2, 'visit', 'Did your sister ever call back?', false],
    ['soon', 2, 'visit', 'Thanks for the visit to the site yesterday.', false],
    ['soon', 2, 'visit', 'Looking forward to the visit?', false],
    ['soon', 2, 'visit', "How's your day going?", false],
    ['sensitive, passed', -2, 'hospice visit', 'Long week.', false],
    ['passed', -2, 'visit', 'Busy one today.', false],
    // These name the date's own day, which is the rule: they commit.
    ['passed Monday', -2, 'visit', 'Rough Monday ahead at work?', true],
    ['today', 0, 'visit', "How's your day going today?", true],
    ['today', 0, 'visit', 'Busy one today.', true],
  ])('%s %s: %j commits=%s', async (_m, at, value, line, commits) => {
    stored = [date({ value: String(value), eventDate: day(Number(at)) })];
    const c = await pick();
    c!.commit(String(line));
    expect(mark).toHaveBeenCalledTimes(commits ? 1 : 0);
  });
});

describe('a sensitive date is presence, not a question', () => {
  it('names the person from the label, never the topic, and asks nothing', async () => {
    stored = [
      date({
        subject: 'Rose',
        relation: 'grandma',
        subjectKey: 'person:rose',
        value: 'procedure',
        eventDate: day(1),
      }),
    ];
    const c = await pick();
    expect(c?.careful).toBe(true);
    expect(c?.direction).toContain('Thinking of your grandma Rose, with tomorrow coming up.');
    expect(c?.direction).not.toContain('?');
    expect(c?.direction).not.toMatch(/procedure/i);
    expect(JSON.stringify(c?.facts)).not.toMatch(/procedure/i);
  });

  it('with no person in the label: "thinking of you"', async () => {
    stored = [date({ subject: 'self', subjectKind: 'self', subjectKey: 'self', value: 'scan' })];
    const c = await pick();
    expect(c?.direction).toContain('Thinking of you, with Friday coming up.');
    expect(c?.direction).not.toMatch(/\bscan\b|\?/);
  });

  it('a sensitive date just passed: "after <day>", and the base direction asks nothing', async () => {
    stored = [date({ value: 'hospice visit', eventDate: day(-2) })];
    const c = await pick();
    expect(c?.careful).toBe(true);
    expect(c?.direction).toContain('Thinking of your sister Priya, after Monday.');
    expect(`${c?.base}${c?.direction}`).not.toMatch(/\?|quick easy question|hospice/i);
  });

  it('an unclassifiable label is treated as sensitive', async () => {
    stored = [date({ value: "10am at St. Mary's" })];
    const c = await pick();
    expect(c?.careful).toBe(true);
    expect(c?.direction).not.toMatch(/St\. Mary|10am|\?/);
  });
});

describe('dateFor gives nothing, and reads nothing, when it must not', () => {
  it('flag off', async () => {
    vi.stubEnv('DATES_IN_HELLO', 'off');
    await expect(pick()).resolves.toBeUndefined();
    expect(listOpen).not.toHaveBeenCalled();
  });

  it.each(['anon:abc', 'onbehalf:abc', 'phone:+15555550142', 'device:abc'])(
    'a %s caller',
    async (id) => {
      await expect(pick(id)).resolves.toBeUndefined();
      expect(listOpen).not.toHaveBeenCalled();
    }
  );

  it('crisis risk already on this call', async () => {
    noteCrisisRisk('gd-crisis');
    await expect(pick(USER, 'gd-crisis')).resolves.toBeUndefined();
    expect(listOpen).not.toHaveBeenCalled();
  });

  it('within 14 days of a crisis-level signal', async () => {
    crisisLately = true;
    await expect(pick()).resolves.toBeUndefined();
    expect(mark).not.toHaveBeenCalled();
  });

  it('no database to read the crisis signals counts as a crisis', async () => {
    const noCrisisReader = dateFor(
      { userId: USER, sessionId: 'gd-nodb', zone: 'UTC' },
      { now: () => NOW, store, mark, forgotten: async () => [] }
    );
    await expect(noCrisisReader).resolves.toBeUndefined();
  });

  it('a store that throws: no date, no throw', async () => {
    listOpen.mockRejectedValueOnce(new Error('down'));
    await expect(pick()).resolves.toBeUndefined();
  });
});

describe('the one-time lookahead is 3 days with DATES_IN_HELLO on, 1 off', () => {
  it('two days out: due with it on, not with it off', async () => {
    expect(dueDate([date({ eventDate: day(2) })], TODAY)).toMatchObject({ days: 2 });
    expect(await pick()).toBeDefined();
    vi.stubEnv('DATES_IN_HELLO', 'off');
    expect(dueDate([date({ eventDate: day(2) })], TODAY)).toBeNull();
  });

  it('four days out: due with neither', () => {
    expect(dueDate([date({ eventDate: day(4) })], TODAY)).toBeNull();
    vi.stubEnv('DATES_IN_HELLO', 'off');
    expect(dueDate([date({ eventDate: day(4) })], TODAY)).toBeNull();
  });
});
