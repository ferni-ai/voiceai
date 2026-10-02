import { describe, expect, it } from 'vitest';
import { daysUntil, detectDatesInFact, parseDate } from '../date-detection.js';
import { buildPeopleModel, findPerson } from '../people-model.js';
import { DAY, NOW, entity, fact, rel, sources, summary } from './fixtures.js';

describe('person alias merge', () => {
  it('merges "Mom", "my mother" and "Linda" into one person', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [
          fact('Mom', 'name', 'Linda', { conversationIds: ['c1'] }),
          fact('my mother', 'lives_in', 'Ohio', { conversationIds: ['c2'] }),
          fact('Linda', 'hobby', 'gardening', { conversationIds: ['c3'] }),
        ],
      }),
      NOW
    );
    expect(people).toHaveLength(1);
    const mom = people[0];
    expect(mom.name).toBe('Linda');
    expect(mom.relationship).toBe('mother');
    expect(mom.group).toBe('family');
    expect(mom.aliases).toEqual(expect.arrayContaining(['Linda', 'Mom', 'my mother']));
    expect(mom.keyFacts.map((f) => f.text).join(' ')).toMatch(/gardening/);
    expect([...mom.sourceConversationIds].sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('merges "Linda" with "Linda Smith"', () => {
    const { people } = buildPeopleModel(
      sources({
        entities: [entity('Linda'), entity('Linda Smith', 'person', { relationship: 'aunt' })],
      }),
      NOW
    );
    expect(people).toHaveLength(1);
    expect(people[0].relationship).toBe('aunt');
  });

  it('keeps two named sisters apart and does not guess which one "my sister" is', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [
          fact('user', 'sister', 'Kate'),
          fact('user', 'sister', 'Anna'),
          fact('my sister', 'job', 'nurse'),
        ],
      }),
      NOW
    );
    const names = people.map((p) => p.name).sort();
    expect(names).toEqual(['Anna', 'Kate', 'your sister']);
    expect(findPerson(people, 'sister')?.name).toBe('your sister'); // the unnamed one, never Kate or Anna
    expect(findPerson(people, 'Kate')?.relationship).toBe('sister');
  });

  it('merges "my sister" with the only named sister', () => {
    const { people } = buildPeopleModel(
      sources({ facts: [fact('user', 'sister', 'Kate'), fact('my sister', 'job', 'nurse')] }),
      NOW
    );
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe('Kate');
    expect(people[0].keyFacts.some((f) => /nurse/.test(f.text))).toBe(true);
  });
});

describe('family relationship extraction to profiles', () => {
  it('builds profiles from user relationships and entity attributes', () => {
    const { people } = buildPeopleModel(
      sources({
        relationships: [rel('user', 'Sam', 'partner'), rel('Jordan', 'user', 'coworker_of')],
        entities: [entity('Biscuit', 'pet', { relationship: 'dog' }), entity('Austin', 'place')],
      }),
      NOW
    );
    const byName = Object.fromEntries(people.map((p) => [p.name, p]));
    expect(byName.Sam.relationship).toBe('partner');
    expect(byName.Sam.group).toBe('partner');
    expect(byName.Jordan.group).toBe('work');
    expect(byName.Biscuit.group).toBe('pet');
    expect(byName.Austin).toBeUndefined(); // places are not people
  });

  it('collects open threads from follow-ups and drops resolved ones', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [fact('Mom', 'name', 'Linda')],
        summaries: [
          summary('c1', 10, { followUps: ["Ask how mom's doctor visit went"] }),
          summary('c2', 6, { followUps: ["Check on mom's surgery next week"] }),
          summary('c3', 3, { keyPoints: ['The doctor visit went fine, mom is relieved'] }),
        ],
      }),
      NOW
    );
    const mom = people[0];
    expect(mom.openThreads.map((t) => t.text)).toEqual(["Check on mom's surgery next week"]);
    expect(mom.openThreads[0].sourceConversationIds).toEqual(['c2']);
    expect(mom.mentionCount).toBeGreaterThanOrEqual(3);
  });

  it('tracks a declining sentiment trend', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [fact('user', 'partner', 'Sam')],
        summaries: [
          summary('c1', 30, { keyPoints: ['Had a great, happy weekend with Sam'] }),
          summary('c2', 20, { keyPoints: ['Sam was supportive and fun'] }),
          summary('c3', 10, { keyPoints: ['Argument with Sam, feeling upset'] }),
          summary('c4', 2, { keyPoints: ['Sam and they are tense and frustrated'] }),
        ],
      }),
      NOW
    );
    expect(people[0].sentimentTrend).toBe('declining');
  });

  it('skips tombstoned people', () => {
    const first = buildPeopleModel(sources({ facts: [fact('user', 'partner', 'Sam')] }), NOW);
    const again = buildPeopleModel(
      sources({ facts: [fact('user', 'partner', 'Sam')] }),
      NOW,
      new Set([first.people[0].id])
    );
    expect(again.people).toHaveLength(0);
  });
});

describe('important-date detection', () => {
  it('detects a recurring birthday tied to the person', () => {
    const { people, dates } = buildPeopleModel(
      sources({ facts: [fact('Mom', 'name', 'Linda'), fact('Linda', 'birthday', 'March 3rd')] }),
      NOW
    );
    expect(people[0].importantDates[0]).toMatchObject({
      kind: 'birthday',
      date: '--03-03',
      recurring: true,
      personId: people[0].id,
      title: "Linda's birthday",
    });
    expect(dates).toHaveLength(1);
  });

  it('detects a relative surgery date anchored to when it was said', () => {
    const said = Date.UTC(2026, 8, 30); // Wednesday
    const [d] = detectDatesInFact(
      fact('Mom', 'upcoming_event', 'surgery next Tuesday', { at: said }),
      { personId: 'p1', name: 'Mom' }
    );
    expect(d).toMatchObject({
      kind: 'event',
      date: '2026-10-06',
      recurring: false,
      title: "Mom's surgery",
    });
    expect(d.confidence).toBeLessThan(0.9);
  });

  it('parses common formats and ignores facts without an event', () => {
    expect(parseDate('on 3/14', NOW)).toMatchObject({ month: 3, day: 14 });
    expect(parseDate('2026-12-25', NOW)).toMatchObject({ year: 2026, month: 12, day: 25 });
    expect(parseDate('the 5th of November', NOW)).toMatchObject({ month: 11, day: 5 });
    expect(detectDatesInFact(fact('Sam', 'likes', 'tacos on March 3'))).toEqual([]);
  });

  it('counts days to recurring and one-off dates', () => {
    expect(daysUntil('--10-05', NOW)).toBe(3);
    expect(daysUntil('--10-01', NOW)).toBe(364);
    expect(daysUntil('2026-10-09', NOW)).toBe(7);
    expect(daysUntil('2026-09-01', NOW)).toBeNull();
    expect(NOW - DAY).toBeLessThan(NOW);
  });
});
