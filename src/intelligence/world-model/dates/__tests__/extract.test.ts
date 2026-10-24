import { describe, expect, it } from 'vitest';

import { buildDatesPrompt, parseDateMentions, timeDoubts, toDateObservations } from '../extract.js';

const CALL = { sessionId: 's1', observedAt: '2026-10-11T19:00:00.000Z', callDate: '2026-10-11' };

const reply = (...dates: object[]): string => `\`\`\`json\n${JSON.stringify({ dates })}\n\`\`\``;

describe('parseDateMentions', () => {
  it('reads the model reply and drops items that are not someone in the caller life', () => {
    const got = parseDateMentions(
      reply(
        { who: 'mom', what: 'birthday', kind: 'birthday', when: 'the 14th', confidence: 0.9 },
        { who: 'Ferni', what: 'sister birthday', kind: 'birthday', when: 'Tuesday' },
        { who: 'me', what: 'dentist', kind: 'medical', when: 'Nov 3' },
        { who: 'Sam', what: 'party' }
      )
    );
    expect(got.map((m) => m.who)).toEqual(['mom', 'self']);
    expect(got[0]).toMatchObject({ kind: 'birthday', recurring: true, confidence: 0.9 });
  });

  it('is empty for no JSON or a broken reply', () => {
    expect(parseDateMentions(null)).toEqual([]);
    expect(parseDateMentions('none came up')).toEqual([]);
    expect(parseDateMentions('{"dates": [')).toEqual([]);
  });
});

describe('toDateObservations', () => {
  it('resolves "the 3rd" near a month end in code (Nov 3), not as the model guessed (Oct 3)', () => {
    const [o] = toDateObservations(
      parseDateMentions(
        reply({
          who: 'Mindy', relation: 'sister', what: 'knee surgery', kind: 'medical',
          when: 'the 3rd', guess: '2026-10-03', confidence: 0.9,
        }) // prettier-ignore
      ),
      { ...CALL, callDate: '2026-10-30' }
    );
    expect(o).toMatchObject({
      subject: 'Mindy',
      relation: 'sister',
      attribute: 'event',
      value: 'knee surgery',
      eventDate: '2026-11-03',
      recurrence: 'once',
      origin: 'dates',
      // The two readings differ, so Ferni checks before relying on it.
      needsConfirmation: true,
    });
  });

  it('stores a birthday as yearly, at its next occurrence, even one that was yesterday', () => {
    const [o] = toDateObservations(
      parseDateMentions(
        reply({ who: 'Sam', what: 'birthday', kind: 'birthday', when: 'yesterday', past: true })
      ),
      CALL
    );
    expect(o).toMatchObject({ recurrence: 'yearly', monthDay: '10-10', eventDate: '2027-10-10' });
  });

  it('keeps a one-time birthday party one-time', () => {
    const [o] = toDateObservations(
      parseDateMentions(
        reply({ who: 'Ava', what: 'birthday party', kind: 'birthday', recurring: false, when: 'this Saturday' })
      ), // prettier-ignore
      CALL
    );
    expect(o).toMatchObject({ recurrence: 'once', eventDate: '2026-10-17' });
    expect(o.monthDay).toBeUndefined();
  });

  it("keeps mom's birthday and her birthday party from one call as two dates", () => {
    const got = toDateObservations(
      parseDateMentions(
        reply(
          { who: 'mom', what: 'birthday', kind: 'birthday', when: 'October 20th' },
          { who: 'mom', what: 'birthday party', kind: 'birthday', recurring: false, when: 'Saturday' }
        )
      ), // prettier-ignore
      CALL
    );
    expect(got.map((o) => [o.value, o.recurrence, o.eventDate])).toEqual([
      ['birthday', 'yearly', '2026-10-20'],
      ['birthday party', 'once', '2026-10-17'],
    ]);
  });

  it('keeps a yearly birthday and a one-time "birthday" of another kind as two dates', () => {
    const got = toDateObservations(
      parseDateMentions(
        reply(
          { who: 'mom', what: 'birthday', kind: 'birthday', when: 'October 20th' },
          { who: 'mom', what: 'birthday', kind: 'event', when: 'Saturday' }
        )
      ),
      CALL
    );
    expect(got.map((o) => o.recurrence)).toEqual(['yearly', 'once']);
  });

  it('reads a party with recurring unsaid as one-time, and a bare birthday as yearly', () => {
    const got = parseDateMentions(
      reply(
        { who: 'mom', what: 'birthday party', kind: 'birthday', when: 'Saturday' },
        { who: 'mom', what: "Mom's birthday", kind: 'birthday', when: 'October 20th' }
      )
    );
    expect(got.map((m) => m.recurring)).toEqual([false, true]);
  });

  it('lets a correction in the same call win, and marks it as replacing', () => {
    const got = toDateObservations(
      parseDateMentions(
        reply(
          { who: 'mom', what: 'birthday', kind: 'birthday', when: 'the 14th' },
          { who: 'Mom', what: 'birthday', kind: 'birthday', when: 'the 15th', correction: true }
        )
      ),
      CALL
    );
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ eventDate: '2026-10-15', replaces: { attribute: 'event' } });
  });

  it('asks to confirm what was ambiguous, hedged or only the model guess', () => {
    const got = toDateObservations(
      parseDateMentions(
        reply(
          { who: 'self', what: 'interview', kind: 'event', when: 'next Friday', confidence: 0.9 },
          { who: 'Rosa', what: 'birthday', kind: 'birthday', when: 'the 3rd', unsure: true, confidence: 0.9 }, // prettier-ignore
          { who: 'Jo', what: 'move', kind: 'event', when: 'end of the month thing', guess: '2026-10-31', confidence: 0.9 } // prettier-ignore
        )
      ),
      { ...CALL, observedAt: '2026-10-12T19:00:00.000Z', callDate: '2026-10-12' }
    );
    expect(got.map((o) => [o.subject, o.eventDate, o.needsConfirmation, o.confidence])).toEqual([
      ['self', '2026-10-23', true, 0.63],
      ['Rosa', '2026-11-03', true, 0.63],
      ['Jo', '2026-10-31', true, 0.63],
    ]);
  });

  it('drops a mention with no day it can trust', () => {
    const got = toDateObservations(
      parseDateMentions(
        reply(
          { who: 'cousin', what: 'wedding', kind: 'event', when: 'sometime in June' },
          { who: 'Al', what: 'trip', kind: 'event', when: 'whenever', guess: '2031-01-01' }
        )
      ),
      CALL
    );
    expect(got).toEqual([]);
  });
});

describe('buildDatesPrompt', () => {
  it("gives the call's day and asks for the caller's own words, not a computed date", () => {
    const prompt = buildDatesPrompt('CALLER: hi', {
      date: '2026-10-11',
      weekday: 'Sunday',
      timezone: 'America/New_York',
    });
    expect(prompt).toContain('Sunday 2026-10-11');
    expect(prompt).toMatch(/exact words for the day, copied, not computed/);
  });
});

describe('toDateObservations: words against the model reading', () => {
  it('keeps the day the words say, but asks when the model read another day', () => {
    const [o] = toDateObservations(
      parseDateMentions(
        reply({ who: 'Pete', what: 'birthday', kind: 'birthday', when: 'the 19th', guess: '2026-12-19', confidence: 1 }) // prettier-ignore
      ),
      { ...CALL, callDate: '2026-01-07' }
    );
    expect(o).toMatchObject({ eventDate: '2026-01-19', needsConfirmation: true, confidence: 0.7 });
  });

  it('does not ask when they agree (a yearly date compares month and day)', () => {
    const [o] = toDateObservations(
      parseDateMentions(
        reply({ who: 'mom', what: 'birthday', kind: 'birthday', when: 'the 14th', guess: '2025-10-14', confidence: 1 }) // prettier-ignore
      ),
      CALL
    );
    expect(o).toMatchObject({ eventDate: '2026-10-14', needsConfirmation: false });
  });
});

describe('timeDoubts: the mentions toDateObservations drops, kept to take a time off (#2527)', () => {
  // Saturday 2026-10-24: "friday" is 10-30.
  const call = { sessionId: 's1', observedAt: '2026-10-24T14:00:00.000Z', callDate: '2026-10-24' };
  const said = (when: string, over: Record<string, unknown> = {}) => ({
    who: 'self', what: 'biopsy', kind: 'medical' as const, when, recurring: false, past: false,
    correction: false, unsure: false, confidence: 0.9, ...over,
  }); // prettier-ignore

  it.each(['friday at 4pm EST', 'friday, not sure what time', 'sometime friday'])(
    '"%s" is dropped as a date and kept as a doubt on friday',
    (when) => {
      expect(toDateObservations([said(when)], call)).toEqual([]);
      const [d, ...more] = timeDoubts([said(when)], call);
      expect(more).toEqual([]);
      expect(d).toMatchObject({ subject: 'self', subjectKind: 'self', value: 'biopsy', kind: 'medical', recurrence: 'once' }); // prettier-ignore
      expect(d.days).toContain('2026-10-30');
    }
  );

  it('a mention that makes a date, or one with no day anywhere in it, is no doubt', () => {
    expect(timeDoubts([said('friday at 3pm')], call)).toEqual([]);
    expect(timeDoubts([said('sometime friday', { guess: '2026-10-30' })], call)).toEqual([]);
    expect(timeDoubts([said('not sure when')], call)).toEqual([]);
  });

  it('a correction, or an unsure mention, with no day in it doubts every day ("moved it, not sure when")', () => {
    for (const [when, over] of [['not sure when', { correction: true }], ['TBD', { unsure: true }], ['moved it, not sure when', { correction: true, unsure: true }]] as const) // prettier-ignore
      expect(timeDoubts([said(when, over)], call), when).toEqual([expect.objectContaining({ days: [], anyDay: true, value: 'biopsy' })]); // prettier-ignore
    // Plain, it says nothing about any date.
    expect(timeDoubts([said('TBD')], call)).toEqual([]);
    // A correction doubts every day even when it names one; a plain mention only the one it names.
    expect(timeDoubts([said('sometime friday', { correction: true })], call)[0]).toMatchObject({ anyDay: true }); // prettier-ignore
    expect(timeDoubts([said('sometime friday')], call)[0]).toMatchObject({ anyDay: false });
  });

  it('reads a day from up to three words in a row ("christmas eve", not "christmas")', () => {
    const [d] = timeDoubts([said('sometime christmas eve')], call);
    expect(d.days).toContain('2026-12-24');
  });

  it('only the last mention of a date counts, as for dates', () => {
    expect(timeDoubts([said('sometime friday'), said('friday at 3pm')], call)).toEqual([]);
    expect(timeDoubts([said('friday at 3pm'), said('sometime friday')], call)).toHaveLength(1);
  });
});
