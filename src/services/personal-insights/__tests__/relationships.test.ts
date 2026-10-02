import { beforeEach, describe, expect, it } from 'vitest';
import { approachesFromText, triggerFromText } from '../../superhuman/conflict-signals.js';
import {
  registerBoundariesPort,
  registerImportantDatesPort,
  resetIntegrationPorts,
} from '../integrations.js';
import { buildPeopleModel } from '../people-model.js';
import { invalidatePersonalInsightsCache, refreshPersonalInsights } from '../pipeline.js';
import { formatPersonNote } from '../session-block.js';
import { DAY, MemoryStore, NOW, fact, sources, summary } from './fixtures.js';

beforeEach(() => {
  resetIntegrationPorts();
  registerImportantDatesPort(null);
  registerBoundariesPort(null);
  invalidatePersonalInsightsCache();
});

const partnerSources = () =>
  sources({
    facts: [
      fact('user', 'wife', 'Sam', { at: NOW - 90 * DAY }),
      fact('Sam', 'how_they_met', 'at a friend’s barbecue in 2015', { at: NOW - 90 * DAY }),
      fact('Sam', 'anniversary', 'October 6', { at: NOW - 90 * DAY }),
      fact('Sam', 'date_night', 'date night every Friday at their favorite taco place', {
        at: NOW - 30 * DAY,
      }),
      fact('Sam', 'love_language', 'quality time, feels loved when they cook together', {
        at: NOW - 30 * DAY,
      }),
    ],
    summaries: [
      summary('c1', 20, { keyPoints: ['Big argument with Sam about chores again'] }),
      summary('c2', 19, { keyPoints: ['A walk before talking helped them and Sam make up'] }),
      summary('c3', 6, {
        keyPoints: ['Tension with Sam about money this week'],
        followUps: ['They want to listen more to Sam'],
      }),
      summary('c4', 2, { keyPoints: ['Sam was supportive about the job stress'] }),
    ],
  });

describe('partner relationship', () => {
  it('tracks status, how they met, what they appreciate, rituals and dynamics', () => {
    const { people, dates } = buildPeopleModel(partnerSources(), NOW);
    const sam = people[0];
    const bond = sam.relationshipDetails!;
    expect(sam.relationship).toBe('partner');
    expect(bond.status).toBe('married');
    expect(bond.isFormer).toBe(false);
    expect(bond.howMet).toMatch(/barbecue/);
    expect(bond.appreciates[0]).toMatch(/quality time/);
    expect(bond.dateIdeas[0]).toMatch(/taco/);
    expect(bond.tensions).toEqual(expect.arrayContaining(['chores']));
    expect(bond.whatHelped[0]).toMatch(/walk/);
    expect(bond.growthIntentions[0].text).toMatch(/listen more/);
    expect(bond.support[0]).toMatch(/supportive/);
    const anniversary = dates.find((d) => d.kind === 'anniversary')!;
    expect(anniversary).toMatchObject({
      title: 'Anniversary with Sam',
      date: '--10-06',
      recurring: true,
      personId: sam.id,
    });
    const dateNight = dates.find((d) => /Date night/.test(d.title))!;
    expect(dateNight).toMatchObject({
      title: 'Date night with Sam',
      date: '2026-10-02',
      kind: 'event',
    });
  });

  it('gives conflict context when the user brings the partner up', () => {
    const { people } = buildPeopleModel(partnerSources(), NOW);
    const note = formatPersonNote(people[0], 1000)!;
    expect(note).toMatch(
      /When things got tense before, taking a break \(like a walk\) before talking helped/
    );
    expect(note).toMatch(/Recurring friction: chores/);
  });

  it('merges conflicts recorded through the conflict tools', () => {
    const src = {
      ...partnerSources(),
      conflicts: [
        {
          withPerson: 'Sam',
          relationship: 'partner',
          conflictType: 'recurring_issue',
          triggers: ['in-laws'],
          effectiveApproaches: ['sleep_on_it'],
          ineffectiveApproaches: [],
          outcome: 'resolved',
          timestamp: NOW - 40 * DAY,
        },
      ],
    };
    const bond = buildPeopleModel(src, NOW).people[0].relationshipDetails!;
    expect(bond.tensions).toEqual(expect.arrayContaining(['in-laws', 'chores']));
    expect(bond.whatHelped.join(' ')).toMatch(/sleeping on it/);
  });

  it('maps everyday phrasing onto conflict approaches and triggers', () => {
    expect(approachesFromText('a walk before talking helped')).toContain('take_a_break');
    expect(approachesFromText('we saw a couples counselor')).toContain('third_party');
    expect(triggerFromText('Big argument with Sam about chores again')).toBe('chores');
  });
});

describe('relationship changes over time', () => {
  const breakup = () =>
    sources({
      facts: [
        fact('user', 'boyfriend', 'Alex', { at: NOW - 200 * DAY, conversationIds: ['c0'] }),
        fact('Alex', 'anniversary', 'June 3', { at: NOW - 200 * DAY, conversationIds: ['c0'] }),
      ],
      summaries: [
        summary('c1', 100, { keyPoints: ['Planning a trip with Alex'] }),
        summary('c2', 30, {
          keyPoints: ['They broke up with Alex last week'],
          followUps: ['Check in on how they feel about Alex'],
        }),
      ],
    });

  it('keeps history, marks a former partner, and drops open threads', () => {
    const alex = buildPeopleModel(breakup(), NOW).people[0];
    expect(alex.relationship).toBe('ex');
    expect(alex.group).toBe('other');
    expect(alex.relationshipDetails!.statusHistory.map((h) => h.status)).toEqual([
      'dating',
      'broken_up',
    ]);
    expect(alex.relationshipDetails!.isFormer).toBe(true);
    expect(alex.openThreads).toEqual([]);
    expect(formatPersonNote(alex)).toMatch(/never bring them up yourself/);
  });

  it('never surfaces an ex proactively and does not send their anniversary to reminders', async () => {
    const upserts: string[] = [];
    registerImportantDatesPort({
      upsertImportantDate: async (_u, d) => void upserts.push(d.title),
      getUpcomingDates: async () => [],
    });
    const store = new MemoryStore(breakup());
    await refreshPersonalInsights('u1', { store, llm: null, now: () => NOW });
    expect(upserts).toEqual([]);
    const bundle = JSON.stringify(store.bundle);
    expect(bundle).not.toMatch(/Alex/);
    expect([...store.people.values()][0].name).toBe('Alex'); // still remembered for when they bring it up
  });

  it('notes estrangement and reconciliation for family', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [fact('user', 'brother', 'Tom')],
        summaries: [
          summary('c1', 60, { keyPoints: ['Not speaking with Tom since the holidays'] }),
          summary('c2', 5, { keyPoints: ['Tom and they are talking again after a long call'] }),
        ],
      }),
      NOW
    );
    expect(people[0].relationshipDetails!.statusHistory.map((h) => h.status)).toEqual([
      'estranged',
      'reconciled',
    ]);
    expect(people[0].relationshipDetails!.status).toBe('reconciled');
  });
});
