import { describe, expect, it } from 'vitest';

import { isLightTopic } from '../../../api/home/light-topic.js';
import {
  toDateObservations,
  type DateMention,
} from '../../../intelligence/world-model/dates/extract.js';
import { planDates, type DateFact } from '../../../intelligence/world-model/dates/store.js';
import { bookendSourceItems, type BookendDateFact } from '../bookend-source.js';

const ET = 'America/New_York';
/** Tuesday 2026-10-20, 10:00 in New York (EDT, UTC-4). */
const TUE_10_ET = new Date('2026-10-20T14:00:00.000Z');
const heavy = (text: string): boolean => !isLightTopic(text);

const mention = (over: Partial<DateMention>): DateMention => ({
  who: 'self',
  what: 'biopsy',
  kind: 'medical',
  when: 'at 3',
  recurring: false,
  past: false,
  correction: false,
  unsure: false,
  confidence: 0.9,
  ...over,
});

/** The date facts one call stores (extract -> store), as the source reads them back. */
function factsFrom(...mentions: DateMention[]): DateFact[] {
  const call = { sessionId: 's1', observedAt: TUE_10_ET.toISOString(), callDate: '2026-10-20' };
  let n = 0;
  return planDates([], toDateObservations(mentions, call), () => `wd_${(n += 1)}`).create;
}

const itemsFor = (facts: readonly BookendDateFact[], now = TUE_10_ET) =>
  bookendSourceItems(facts, { zone: ET, now, heavy });

describe('bookendSourceItems', () => {
  it('"biopsy at 3" said Tue 10:00 ET happens Tue 19:00Z, asked after, heavy', () => {
    const facts = factsFrom(mention({}));
    expect(facts[0]).toMatchObject({ eventDate: '2026-10-20', at: '15:00' });

    expect(itemsFor(facts)).toEqual([
      {
        kind: 'date',
        text: 'biopsy',
        dueAt: null,
        repeat: null,
        source: { store: 'world_facts', ref: 'wd_1' },
        eventAt: '2026-10-20T19:00:00.000Z',
        eventPrecision: 'time',
        askType: 'how-did-it-go',
        salience: { weight: 0.9, heavy: true, sensitive: true, by: 'rule', v: 1 },
      },
    ]);
  });

  it('names whose it is, and reads a light event as light', () => {
    const facts = factsFrom(mention({ who: 'Mindy', what: 'recital', kind: 'event', when: 'Friday at 6pm' })); // prettier-ignore
    const [item] = itemsFor(facts);
    expect(item).toMatchObject({ text: "Mindy's recital", eventAt: '2026-10-23T22:00:00.000Z' });
    expect(item.salience).toEqual({
      weight: 0.7,
      heavy: false,
      sensitive: false,
      by: 'rule',
      v: 1,
    });
  });

  it('a medical date stays sensitive even when its words read light', () => {
    const facts = factsFrom(mention({ what: 'checkup', when: 'Friday at 9am' }));
    const [item] = bookendSourceItems(facts, { zone: ET, now: TUE_10_ET, heavy: () => false });
    expect(item.salience).toMatchObject({ heavy: false, sensitive: true });
  });

  it('"the 14th" has no time, so it is no source', () => {
    const facts = factsFrom(mention({ what: 'dentist', when: 'the 14th' }));
    expect(facts[0]).not.toHaveProperty('at');
    expect(itemsFor(facts)).toEqual([]);
  });

  it('a yearly birthday is no source, even with a time', () => {
    const facts = factsFrom(mention({ who: 'mom', what: 'birthday', kind: 'birthday', recurring: true, when: 'the 24th at 3' })); // prettier-ignore
    expect(facts[0]).toMatchObject({ recurrence: 'yearly', at: '15:00' });
    expect(itemsFor(facts)).toEqual([]);
  });

  it('leaves out a deadline, a day to confirm, a closed or yearly fact, and anything past', () => {
    const [timed] = factsFrom(mention({}));
    const facts: BookendDateFact[] = [
      { ...timed, id: 'deadline', kind: 'deadline' },
      { ...timed, id: 'unsure', needsConfirmation: true },
      { ...timed, id: 'closed', validTo: TUE_10_ET.toISOString() },
      { ...timed, id: 'yearly', recurrence: 'yearly' },
    ];
    expect(itemsFor(facts)).toEqual([]);
    expect(itemsFor([timed], new Date('2026-10-20T19:00:00.000Z'))).toEqual([]);
  });
});
