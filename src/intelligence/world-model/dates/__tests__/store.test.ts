import { describe, expect, it } from 'vitest';

import type { DateObservation } from '../extract.js';
import { planDates, type DateFact } from '../store.js';

const AT = '2026-10-11T19:00:00.000Z';

function obs(over: Partial<DateObservation> = {}): DateObservation {
  return {
    subject: 'mom', subjectKind: 'person', attribute: 'event', value: 'birthday',
    eventDate: '2026-10-14', observedAt: AT, confidence: 0.9,
    source: { kind: 'turn', sessionId: 's1', quote: "my mom's birthday is the 14th" },
    origin: 'dates', kind: 'birthday', recurrence: 'yearly', monthDay: '10-14',
    when: 'the 14th', needsConfirmation: false, ...over,
  }; // prettier-ignore
}

function fact(over: Partial<DateFact> = {}): DateFact {
  const o = obs();
  return { ...o, id: 'f1', subjectKey: 'person:mom', validFrom: AT, validTo: null, ...over };
}

let n = 0;
const ids = () => `new${++n}`;

describe('planDates', () => {
  it('refreshes a date heard again instead of storing it twice', () => {
    const plan = planDates([fact()], [obs({ confidence: 1 })], ids);
    expect(plan).toEqual({ create: [], close: [], refresh: [{ id: 'f1', observedAt: AT, confidence: 1 }] }); // prettier-ignore
  });

  it("replaces a person's birthday told with a new day (a correction on a later call)", () => {
    const plan = planDates([fact()], [obs({ eventDate: '2026-10-15', monthDay: '10-15' })], ids);
    expect(plan.close).toEqual([{ id: 'f1', validTo: AT, supersededBy: plan.create[0].id }]);
    expect(plan.create[0]).toMatchObject({ eventDate: '2026-10-15', supersedes: ['f1'], subjectKey: 'person:mom' }); // prettier-ignore
  });

  it('treats a one-time date with a new day as a reschedule only while the old day is ahead', () => {
    const surgery = (id: string, eventDate: string) =>
      fact({ id, value: 'knee surgery', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate }); // prettier-ignore
    const moved = obs({ value: 'surgery', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-16' }); // prettier-ignore
    expect(planDates([surgery('ahead', '2026-10-13')], [moved], ids).close.map((c) => c.id)).toEqual(['ahead']); // prettier-ignore
    expect(planDates([surgery('past', '2026-09-01')], [moved], ids).close).toEqual([]);
  });

  it("never lets a one-time date (her birthday party) replace a person's yearly birthday", () => {
    const party = obs({ value: 'birthday party', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-17' }); // prettier-ignore
    const plan = planDates([fact()], [party], ids);
    expect(plan.close).toEqual([]);
    expect((plan.create as DateFact[]).map((f) => [f.value, f.recurrence])).toEqual([
      ['birthday party', 'once'],
    ]);
  });

  it('never lets a yearly birthday heard later close her one-time birthday party', () => {
    const party = fact({ id: 'party', value: 'birthday party', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-17' }); // prettier-ignore
    const plan = planDates([party], [obs({ eventDate: '2026-10-20', monthDay: '10-20' })], ids);
    expect(plan.close).toEqual([]);
    expect(plan.create).toHaveLength(1);
  });

  it("replaces the world extractor's one-time birthday (no recurrence) with the yearly one", () => {
    const extracted = fact({ id: 'w1', value: 'birthday', recurrence: undefined, kind: undefined, monthDay: undefined, eventDate: '2026-10-20' }); // prettier-ignore
    const plan = planDates([extracted], [obs({ eventDate: '2026-10-20', monthDay: '10-20' })], ids);
    expect(plan.close.map((c) => c.id)).toEqual(['w1']);
  });

  it("keeps the world extractor's party and birthday apart from this task's dates", () => {
    const extracted = (id: string, value: string) =>
      fact({ id, value, recurrence: undefined, kind: undefined, monthDay: undefined, eventDate: '2026-10-17' }); // prettier-ignore
    const birthday = obs({ eventDate: '2026-10-20', monthDay: '10-20' });
    const party = obs({ value: 'birthday party', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-18' }); // prettier-ignore
    expect(planDates([extracted('w2', 'birthday party')], [birthday], ids).close).toEqual([]);
    expect(planDates([extracted('w3', 'birthday')], [party], ids).close).toEqual([]);
  });

  it("reads 'still ahead' on the caller's own day, not the UTC one", () => {
    // 21:00 Sunday Oct 11 in New York is 01:00 Monday Oct 12 UTC; the surgery is today, local.
    const today = fact({ id: 'today', value: 'knee surgery', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-11' }); // prettier-ignore
    const moved = obs({ value: 'surgery', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-16', observedAt: '2026-10-12T01:00:00.000Z' }); // prettier-ignore
    expect(planDates([today], [moved], ids, '2026-10-11').close.map((c) => c.id)).toEqual(['today']); // prettier-ignore
    expect(planDates([today], [moved], ids).close).toEqual([]);
  });

  it("never touches another person's date or Ferni's own promises", () => {
    const plan = planDates(
      [
        fact({ id: 'dad', subjectKey: 'person:dad', subject: 'dad' }),
        fact({ id: 'f', by: 'ferni' }),
      ],
      [obs({ eventDate: '2026-10-15', monthDay: '10-15' })],
      ids
    );
    expect(plan.close).toEqual([]);
    expect(plan.create).toHaveLength(1);
  });
});

describe('planDates: the time of a date heard again (#2527)', () => {
  const biopsy = (over: Partial<DateObservation> = {}) =>
    obs({ value: 'biopsy', subject: 'self', subjectKind: 'self', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-23', at: '15:00', when: 'friday at 3pm', ...over }); // prettier-ignore
  const onFile = (over: Partial<DateFact> = {}): DateFact => ({
    ...biopsy(),
    id: 'b1',
    subjectKey: 'self',
    validFrom: AT,
    validTo: null,
    ...over,
  });
  /** The one refresh a call makes, and that it makes nothing else: the day stays as it was. */
  const refreshOf = (open: DateFact[], heard: DateObservation[]) => {
    const plan = planDates(open, heard, ids);
    expect(plan.create).toEqual([]);
    expect(plan.close).toEqual([]);
    expect(new Set(plan.refresh.map((r) => r.id))).toEqual(new Set(['b1']));
    return plan.refresh;
  };
  const lastAt = (refresh: ReturnType<typeof refreshOf>) =>
    refresh.reduce<string | null | undefined>((at, r) => ('at' in r ? r.at : at), undefined);

  it('"friday at 3pm", then "friday at 4pm": the time follows the newer words', () => {
    expect(lastAt(refreshOf([onFile()], [biopsy({ at: '16:00', when: 'friday at 4pm' })]))).toBe('16:00'); // prettier-ignore
  });

  it('a correction gives the new time too', () => {
    const corrected = biopsy({ at: '16:00', when: 'friday at 4pm', replaces: { attribute: 'event', priorValue: 'biopsy' } }); // prettier-ignore
    expect(lastAt(refreshOf([onFile()], [corrected]))).toBe('16:00');
  });

  it('"friday at 3pm", then just "friday": the time stays', () => {
    const refresh = refreshOf([onFile()], [biopsy({ at: undefined, when: 'friday' })]);
    expect(refresh).toEqual([{ id: 'b1', observedAt: AT, confidence: 0.9 }]);
  });

  it('the same time again changes nothing', () => {
    expect(refreshOf([onFile()], [biopsy()])).toEqual([{ id: 'b1', observedAt: AT, confidence: 0.9 }]); // prettier-ignore
  });

  it.each([
    ['friday afternoon', {}],
    ['friday at 4', {}],
    ['friday, an hour later', {}],
    ['moved it to 4pm', {}],
    ['friday', { replaces: { attribute: 'event', priorValue: 'biopsy' } }],
  ])('"%s" with no time read: the old time is dropped, the day kept', (when, over) => {
    expect(lastAt(refreshOf([onFile()], [biopsy({ at: undefined, when, ...over })]))).toBeNull();
  });

  it('a new time that needs confirming (a midnight) drops the old one instead of taking it', () => {
    const midnight = biopsy({ at: '00:00', when: 'friday at 12am', needsConfirmation: true });
    expect(lastAt(refreshOf([onFile()], [midnight]))).toBeNull();
    // ...and is not added where there was none.
    expect(refreshOf([onFile({ at: undefined })], [midnight])).toEqual([{ id: 'b1', observedAt: AT, confidence: 0.9 }]); // prettier-ignore
  });

  it('a time said where there was none is kept', () => {
    expect(lastAt(refreshOf([onFile({ at: undefined, when: 'friday' })], [biopsy()]))).toBe(
      '15:00'
    );
  });

  it('within one call the last mention wins', () => {
    const at4 = biopsy({ at: '16:00', when: 'friday at 4pm' });
    const at3 = biopsy({ at: '15:00', when: 'friday at 3pm' });
    expect(lastAt(refreshOf([onFile()], [at4, biopsy({ at: undefined, when: 'friday' })]))).toBe('16:00'); // prettier-ignore
    expect(lastAt(refreshOf([onFile()], [at4, at3]))).toBe('15:00');
  });
});
