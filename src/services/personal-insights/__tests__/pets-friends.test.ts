import { describe, expect, it } from 'vitest';
import { computeConnectionOpportunities } from '../../superhuman/connection-opportunities.js';
import { keepInTouchNudges, toRelationshipPerson } from '../friends.js';
import { validateGrounded } from '../insight-generator.js';
import { buildPeopleModel, findPerson } from '../people-model.js';
import { predictTopics, EMPTY_CALIBRATION } from '../prediction.js';
import { formatPersonNote, formatSessionBlock } from '../session-block.js';
import type { InsightBundle } from '../types.js';
import { DAY, NOW, entity, fact, sources, summary } from './fixtures.js';

describe('pets as family', () => {
  const src = sources({
    facts: [
      fact('user', 'dog', 'Biscuit', { id: 'p1' }),
      fact('Biscuit', 'breed', 'golden retriever', { id: 'p2' }),
      fact('Biscuit', 'vet_visit', 'hurt paw, on anti-inflammatory meds', { id: 'p3' }),
      fact('Biscuit', 'routine', 'walks at 7am in the park', { id: 'p4' }),
      fact('Biscuit', 'loves', 'tennis balls', { id: 'p5' }),
      fact('Biscuit', 'gotcha_day', 'May 12', { id: 'p6' }),
      fact('the dog', 'afraid_of', 'thunder', { id: 'p7' }),
    ],
    summaries: [summary('c2', 2, { followUps: ["Ask how Biscuit's paw is healing"] })],
  });

  it('builds a pet profile with species, breed, health, routines and merges "the dog"', () => {
    const { people, dates } = buildPeopleModel(src, NOW);
    expect(people).toHaveLength(1);
    const biscuit = people[0];
    expect(biscuit).toMatchObject({
      kind: 'pet',
      group: 'pet',
      relationship: 'dog',
      memorial: false,
    });
    expect(biscuit.pet).toMatchObject({ species: 'dog', breed: 'golden retriever' });
    expect(biscuit.pet!.health.join(' ')).toMatch(/paw/);
    expect(biscuit.pet!.routines.join(' ')).toMatch(/walks/);
    expect(biscuit.pet!.personality.join(' ')).toMatch(/tennis balls|thunder/);
    expect(biscuit.openThreads[0].text).toMatch(/paw/);
    expect(findPerson(people, 'my pup')?.id).toBe(biscuit.id);
    expect(dates.find((d) => d.personId === biscuit.id)).toMatchObject({
      kind: 'anniversary',
      recurring: true,
      date: '--05-12',
      title: "Biscuit's gotcha day",
    });
  });

  it('recognizes a pet from breed facts alone', () => {
    const { people } = buildPeopleModel(
      sources({ facts: [fact('Mochi', 'breed', 'siamese')] }),
      NOW
    );
    expect(people[0]).toMatchObject({ kind: 'pet', pet: { species: 'cat' } });
  });

  it('a pet who has died gets a memorial flag: no open threads, no predictions, no "how is" openers', () => {
    const { people } = buildPeopleModel(
      sources({
        facts: [fact('user', 'dog', 'Rex'), fact('Rex', 'status', 'passed away in the spring')],
        summaries: [
          summary('c1', 3, {
            keyPoints: ['Missing Rex, who died this spring'],
            followUps: ['Ask how Rex is doing'],
          }),
        ],
      }),
      NOW
    );
    const rex = people[0];
    expect(rex.memorial).toBe(true);
    expect(rex.openThreads).toEqual([]);
    expect(
      predictTopics({
        threads: [],
        people,
        upcomingDates: [],
        summaries: [],
        conversations: [],
        calibration: EMPTY_CALIBRATION,
        nowMs: NOW,
        max: 5,
      })
    ).toEqual([]);
    const note = formatPersonNote(rex)!;
    expect(note).toMatch(/who has died/);
    expect(note).toMatch(/past tense/);
    const ev = [
      {
        id: 'E1',
        text: 'Rex (their dog, who has died): Rex loved the beach',
        at: NOW,
        memorial: true,
        sourceConversationIds: ['c1'],
      },
    ];
    expect(validateGrounded([{ text: "How's Rex doing?", evidence: ['E1'] }], ev, 140, 3)).toEqual(
      []
    );
    expect(
      validateGrounded([{ text: 'Rex loved the beach, didn’t he?', evidence: ['E1'] }], ev, 140, 3)
    ).toHaveLength(1);
  });

  it('shows pets and memorials in the session block', () => {
    const bundle: InsightBundle = {
      computedAt: NOW,
      predictions: [],
      insights: [],
      openers: [],
      nudges: [],
      upcomingDates: [],
      safetyHold: false,
      generator: 'rules',
      sourceConversationIds: [],
      people: [
        { id: 'a', name: 'Biscuit', kind: 'pet', relationship: 'dog', openThread: 'paw healing' },
        { id: 'b', name: 'Rex', kind: 'pet', relationship: 'dog', memorial: true },
      ],
    };
    const block = formatSessionBlock(bundle)!;
    expect(block).toContain('Biscuit (dog): paw healing');
    expect(block).toContain('Rex (dog, in memory');
  });
});

describe('friendship', () => {
  const src = sources({
    facts: [
      fact('user', 'best_friend', 'Jess', { conversationIds: ['c1'], at: NOW - 40 * DAY }),
      fact('Jess', 'met_at', 'college', { conversationIds: ['c1'], at: NOW - 40 * DAY }),
      fact('Jess', 'shared_memory', 'road trip to Big Sur together', {
        conversationIds: ['c1'],
        at: NOW - 40 * DAY,
      }),
      fact('Jess', 'new_job', 'started a new job at the hospital', {
        conversationIds: ['c3'],
        at: NOW - 3 * DAY,
      }),
    ],
    entities: [
      entity(
        'Priya',
        'person',
        { relationship: 'friend' },
        { at: NOW - 60 * DAY, conversationIds: ['c0'] }
      ),
    ],
    summaries: [
      summary('c1', 40, { keyPoints: ['Had coffee with Jess and laughed a lot'] }),
      summary('c3', 3, { keyPoints: ['They should call Jess this weekend'] }),
    ],
  });

  it('tracks how they met, closeness, shared history, news, last contact and intentions', () => {
    const { people } = buildPeopleModel(src, NOW);
    const jess = people.find((p) => p.name === 'Jess')!;
    expect(jess.group).toBe('friend');
    expect(jess.connection).toMatchObject({ howMet: 'college', closeness: 'close' });
    expect(jess.connection!.sharedHistory.join(' ')).toMatch(/Big Sur/);
    expect(jess.connection!.lifeEvents[0].text).toMatch(/new job/);
    expect(jess.connection!.lastConnectedAt).toBe(NOW - 40 * DAY);
    expect(jess.connection!.intentions[0].text).toMatch(/call Jess/);
    expect(jess.openThreads.map((t) => t.text).join(' ')).toMatch(/new job|call Jess/);
  });

  it('uses the relationship-network rules for gentle check-ins with provenance', () => {
    const { people } = buildPeopleModel(src, NOW);
    const nudges = keepInTouchNudges(people, 'u1', NOW);
    expect(nudges[0].text).toMatch(/Jess has something going on: .*new job.*check in with Jess/);
    expect(nudges[0].sourceConversationIds).toEqual(['c3']);
    // Priya is a regular-at-best friend, quiet for 60 days: no guilt-trip nudge.
    expect(nudges.some((n) => /Priya/.test(n.text))).toBe(false);
  });

  it('suggests reconnecting with a close friend who has gone quiet', () => {
    const { people } = buildPeopleModel(
      sources({ facts: [fact('user', 'best_friend', 'Ana', { at: NOW - 30 * DAY })] }),
      NOW
    );
    expect(keepInTouchNudges(people, 'u1', NOW)[0].text).toMatch(
      /haven't mentioned Ana in 30 days/
    );
    const adapted = toRelationshipPerson(people[0], 'u1');
    expect(adapted).toMatchObject({ type: 'friend', importance: 0.8 });
    expect(computeConnectionOpportunities([adapted], NOW)[0].type).toBe('reconnect');
  });
});
