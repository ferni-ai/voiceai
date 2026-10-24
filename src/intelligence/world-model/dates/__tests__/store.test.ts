import { describe, expect, it } from 'vitest';

import type { DateObservation, TimeDoubt } from '../extract.js';
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

  it('"friday at 3pm", then just "friday": the time is dropped (fail-safe: only the same time again keeps it)', () => {
    const refresh = refreshOf([onFile()], [biopsy({ at: undefined, when: 'friday' })]);
    expect(refresh).toEqual([{ id: 'b1', observedAt: AT, confidence: 0.9, at: null }]);
  });

  it('the same time again, but doubtful (unsure, low confidence), drops it too', () => {
    expect(lastAt(refreshOf([onFile()], [biopsy({ needsConfirmation: true })]))).toBeNull();
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
    expect(lastAt(refreshOf([onFile()], [at4, biopsy({ at: undefined, when: 'friday' })]))).toBeNull(); // prettier-ignore
    expect(lastAt(refreshOf([onFile()], [at4, at3]))).toBe('15:00');
  });
});

describe('planDates: a dropped mention that names a timed date takes its time off (TimeDoubt, #2527)', () => {
  const said = () =>
    obs({ value: 'biopsy', subject: 'self', subjectKind: 'self', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-23', at: '15:00', when: 'friday at 3pm' }); // prettier-ignore
  const timed = (over: Partial<DateFact> = {}): DateFact => ({
    ...said(),
    id: 'b1',
    subjectKey: 'self',
    validFrom: AT,
    validTo: null,
    ...over,
  });
  const doubt = (over: Partial<TimeDoubt> = {}): TimeDoubt => ({
    subject: 'self',
    subjectKind: 'self',
    value: 'biopsy',
    kind: 'medical',
    recurrence: 'once',
    days: ['2026-10-23'],
    anyDay: false,
    ...over,
  });

  it('on file: one refresh drops the time and changes nothing else', () => {
    const plan = planDates([timed()], [], ids, '2026-10-20', [doubt()]);
    expect(plan).toEqual({ create: [], close: [], refresh: [{ id: 'b1', observedAt: AT, confidence: 0.9, at: null }] }); // prettier-ignore
  });

  it.each<[string, Partial<TimeDoubt>, Partial<DateFact>]>([
    ['another day', { days: ['2026-10-26'] }, {}],
    ['another thing', { value: 'dentist' }, {}],
    ['another person', { subject: 'Mindy', subjectKind: 'person' }, {}],
    ['no time on file', {}, { at: undefined }],
    ['a closed date', {}, { validTo: AT }],
    ['another thing, even with no day', { value: 'dentist', days: [], anyDay: true }, {}],
  ])('%s: nothing', (_, d, f) => {
    expect(planDates([timed(f)], [], ids, '2026-10-20', [doubt(d)]).refresh).toEqual([]);
  });

  it('made this call: the new fact is created without its time', () => {
    const plan = planDates([], [said()], ids, '2026-10-20', [doubt()]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).not.toHaveProperty('at');
    expect(plan.refresh).toEqual([]);
  });

  it('heard again this call with its time: the doubt still wins, on the one refresh', () => {
    const plan = planDates([timed()], [said()], ids, '2026-10-20', [doubt()]);
    expect(plan.refresh).toEqual([{ id: 'b1', observedAt: AT, confidence: 0.9, at: null }]);
  });

  it('a correction or doubt with no day ("moved it, not sure when") takes the time off every day of it', () => {
    const later = timed({ id: 'b2', eventDate: '2026-11-06' });
    const plan = planDates([timed(), later], [], ids, '2026-10-20', [doubt({ days: [], anyDay: true })]); // prettier-ignore
    expect(plan.refresh.map((r) => [r.id, r.at])).toEqual([
      ['b1', null],
      ['b2', null],
    ]);
  });

  it('a yearly date matches by month and day', () => {
    const birthday = timed({ recurrence: 'yearly', kind: 'birthday', value: 'birthday', monthDay: '10-23' }); // prettier-ignore
    const d = doubt({ recurrence: 'yearly', kind: 'birthday', value: 'birthday', days: ['2027-10-23'] }); // prettier-ignore
    expect(planDates([birthday], [], ids, '2026-10-20', [d]).refresh).toHaveLength(1);
  });
});

describe('planDates: a time is written only onto the one fact the words are (#2527, round 6)', () => {
  const appt = (
    id: string,
    value: string,
    at: string | undefined,
    over: Partial<DateFact> = {}
  ): DateFact => ({
    ...obs({ value, subject: 'self', subjectKind: 'self', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-23', at, when: 'friday' }), // prettier-ignore
    id,
    subjectKey: 'self',
    validFrom: AT,
    validTo: null,
    ...over,
  });
  const said = (value: string, at: string | undefined, over: Partial<DateObservation> = {}) =>
    obs({ value, subject: 'self', subjectKind: 'self', kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: '2026-10-23', at, when: `friday at ${at}`, ...over }); // prettier-ignore
  const times = (plan: ReturnType<typeof planDates>) =>
    Object.fromEntries(plan.refresh.filter((r) => 'at' in r).map((r) => [r.id, r.at]));

  it('doctor 3pm + dentist 10am, then "appointment friday at 10am": both cleared, neither moved', () => {
    const open = [
      appt('doc', 'doctor appointment', '15:00'),
      appt('den', 'dentist appointment', '10:00'),
    ];
    const plan = planDates(open, [said('appointment', '10:00')], ids);
    expect(times(plan)).toEqual({ doc: null, den: null });
    expect(plan.create).toEqual([]);
    expect(plan.close).toEqual([]);
    // The day is main's: the first match is heard, as before.
    expect(plan.refresh[0]).toMatchObject({ id: 'doc', observedAt: AT, confidence: 0.9 });
  });

  it('dentist only, 10am, then "appointment friday at 3pm": cleared, not moved', () => {
    const plan = planDates([appt('den', 'dentist appointment', '10:00')], [said('appointment', '15:00')], ids); // prettier-ignore
    expect(times(plan)).toEqual({ den: null });
  });

  it('...and the other way round: "dentist appointment" said for a fact stored as "appointment"', () => {
    const plan = planDates([appt('a', 'appointment', '10:00')], [said('dentist appointment', '15:00')], ids); // prettier-ignore
    expect(times(plan)).toEqual({ a: null });
  });

  it('two facts on the day with the very same words give the new time to neither', () => {
    const open = [
      appt('x', 'doctor appointment', '15:00'),
      appt('y', 'doctor appointment', undefined),
    ];
    expect(times(planDates(open, [said('doctor appointment', '16:00')], ids))).toEqual({ x: null });
  });

  it('exactly one fact, the same words: the new time is written', () => {
    const open = [
      appt('doc', 'doctor appointment', '15:00'),
      appt('den', 'dentist appointment', '10:00'),
    ];
    expect(times(planDates(open, [said('dentist appointment', '11:00')], ids))).toEqual({
      den: '11:00',
    });
  });

  it('a fact on another day is not a candidate', () => {
    const open = [appt('doc', 'doctor appointment', '15:00', { eventDate: '2026-10-30' }), appt('den', 'dentist appointment', '10:00')]; // prettier-ignore
    expect(times(planDates(open, [said('dentist appointment', '11:00')], ids))).toEqual({
      den: '11:00',
    });
  });

  it("does not change the caller's facts", () => {
    const open = [appt('doc', 'doctor appointment', '15:00')];
    planDates(open, [said('appointment', '10:00')], ids);
    expect(open[0].at).toBe('15:00');
  });
});

describe('planDates: property, a time is only ever deleted or said (#2527)', () => {
  /** Seeded, so a failure replays. */
  function rng(seed: number) {
    let x = seed;
    return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  }
  const VALUES = [
    'appointment',
    'doctor appointment',
    'dentist appointment',
    'biopsy',
    'the biopsy',
    'mri',
  ];
  const DAYS = ['2026-10-23', '2026-10-26', '2026-10-30'];
  const TIMES = [undefined, undefined, '10:00', '15:00'];
  const WHO: Array<[string, 'self' | 'person']> = [
    ['self', 'self'],
    ['Mindy', 'person'],
  ];
  const words = (v: string): string => v.replace(/^the /, '').split(' ').sort().join(' ');
  const stripAt = <T extends object>(x: T): T => {
    const { at: _at, ...rest } = x as T & { at?: unknown };
    return rest as T;
  };

  it('over 3,000 random plans: create and close are the timeless plan, and every time written is one said for exactly that fact', () => {
    let deleted = 0;
    let written = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const r = rng(seed);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
      const open: DateFact[] = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => {
        const [subject, subjectKind] = pick(WHO);
        return {
          ...obs({ subject, subjectKind, value: pick(VALUES), kind: 'medical', recurrence: 'once', monthDay: undefined, eventDate: pick(DAYS), at: pick(TIMES), when: 'w' }), // prettier-ignore
          id: `f${i}`,
          subjectKey: subjectKind === 'self' ? 'self' : 'person:mindy',
          validFrom: AT,
          validTo: r() < 0.1 ? AT : null,
        };
      });
      const said = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
        const [subject, subjectKind] = pick(WHO);
        return obs({
          subject, subjectKind, value: pick(VALUES), kind: 'medical', recurrence: 'once', monthDay: undefined,
          eventDate: pick(DAYS), at: pick(TIMES), when: 'w', needsConfirmation: r() < 0.3,
          observedAt: '2026-10-21T12:00:00.000Z', confidence: 0.5 + r() / 2,
          ...(r() < 0.2 ? { replaces: { attribute: 'event' as const, priorValue: 'x' } } : {}),
        }); // prettier-ignore
      });
      const doubts: TimeDoubt[] = r() < 0.5 ? [] : [{ subject: 'self', subjectKind: 'self', value: pick(VALUES), kind: 'medical', recurrence: 'once', days: [pick(DAYS)], anyDay: r() < 0.3 }]; // prettier-ignore
      const before = JSON.stringify(open);
      let n = 0;
      const plan = planDates(open, said, () => `n${(n += 1)}`, '2026-10-21', doubts);
      n = 0;
      const timeless = planDates(open.map(stripAt), said.map(stripAt), () => `n${(n += 1)}`, '2026-10-21'); // prettier-ignore
      const ctx = JSON.stringify({ seed, open, said, doubts });
      expect(JSON.stringify(open), ctx).toBe(before);
      // Days, closes and new facts are exactly the plan without any time: times move nothing.
      expect(plan.close, ctx).toEqual(timeless.close);
      expect(plan.create.map(stripAt), ctx).toEqual(timeless.create);
      // Every refresh of the timeless plan is there, with the same observedAt and confidence...
      const core = plan.refresh.filter((x) => timeless.refresh.some((t) => t.id === x.id && t.observedAt === x.observedAt && t.confidence === x.confidence)); // prettier-ignore
      expect(core.map(stripAt), ctx).toEqual(timeless.refresh);
      // ...and any other only deletes a time, leaving observedAt and confidence as on file.
      for (const x of plan.refresh.filter((y) => !core.includes(y))) {
        const f = open.find((o) => o.id === x.id);
        expect(x, ctx).toEqual({ id: x.id, observedAt: f?.observedAt, confidence: f?.confidence, at: null }); // prettier-ignore
      }
      // A created fact's time is its own words' time, or none.
      for (const c of plan.create as DateFact[]) {
        const from = said.find((o) => o.value === c.value && o.eventDate === c.eventDate && o.subject === c.subject); // prettier-ignore
        if (c.at !== undefined) expect([from?.at, ...said.map((o) => o.at)], ctx).toContain(c.at);
      }
      // A time written onto a fact on file was said plainly for that fact's own words, on its day,
      // with no other live fact of the thing on that day.
      for (const x of plan.refresh) {
        if (x.at === null) deleted += 1;
        if (typeof x.at !== 'string') continue;
        written += 1;
        const f = open.find((o) => o.id === x.id);
        const sayer = said.filter((o) => o.at === x.at && !o.needsConfirmation && o.eventDate === f?.eventDate && o.subject === f?.subject && words(o.value) === words(f?.value ?? '')); // prettier-ignore
        expect(sayer.length, ctx).toBeGreaterThan(0);
        const rivals = open.filter((o) => o.validTo === null && o.id !== f?.id && o.eventDate === f?.eventDate && o.subject === f?.subject && sayer.some((s) => s.value.split(' ').some((w) => o.value.includes(w)))); // prettier-ignore
        expect(rivals, ctx).toEqual([]);
      }
    }
    // Not vacuous: both kinds happened, many times.
    expect(deleted).toBeGreaterThan(300);
    expect(written).toBeGreaterThan(100);
  });
});
