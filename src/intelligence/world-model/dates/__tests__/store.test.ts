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
