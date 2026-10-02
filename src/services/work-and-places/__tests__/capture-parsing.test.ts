/**
 * Work & places statement parsing (pure): what the user says, what summaries
 * say, what extraction facts and place entities carry.
 */

import { describe, expect, it } from 'vitest';
import { inputsFromFacts, inputsFromPlaceEntities } from '../facts-mapping.js';
import { parsePlaceStatements, parsePlaceSummary } from '../place-capture.js';
import { dateFromPhrase } from '../text-patterns.js';
import { parseWorkStatements, parseWorkSummary } from '../work-capture.js';

// Friday 2 October 2026
const NOW = new Date('2026-10-02T15:00:00Z');
const opts = { conversationId: 'conv-1', now: NOW };

const work = (text: string) => parseWorkStatements(text, 'stated', 0.85, opts);
const places = (text: string) => parsePlaceStatements(text, 'stated', 0.85, opts);

describe('work statements', () => {
  it('captures the current employer and role', () => {
    const r = work("I'm a product manager at Acme Labs.");
    expect(r.inputs).toEqual([
      expect.objectContaining({
        kind: 'job',
        employer: 'Acme Labs',
        role: 'product manager',
        status: 'current',
        conversationId: 'conv-1',
      }),
    ]);
  });

  it('captures "I work at" and a role said separately', () => {
    const r = work('I work at Globex. I work as a data analyst.');
    expect(r.inputs[0]).toMatchObject({ kind: 'job', employer: 'Globex', status: 'current' });
    expect(r.currentJobPatch).toBeUndefined();
    expect(r.inputs.find((i) => i.employer === 'Globex')?.role).toBe('data analyst');
  });

  it('a new job starts this month', () => {
    const r = work('I just started at Initech!');
    expect(r.inputs[0]).toMatchObject({
      employer: 'Initech',
      status: 'current',
      startDate: '2026-10',
    });
  });

  it('past jobs are past, and leaving ends the job this month', () => {
    expect(work('I used to work at Acme.').inputs[0]).toMatchObject({
      employer: 'Acme',
      status: 'past',
    });
    expect(work('I quit my job at Hooli last week.').inputs[0]).toMatchObject({
      employer: 'Hooli',
      status: 'past',
      endDate: '2026-10',
    });
    expect(work('I got laid off.').leftCurrentJob).toBe(true);
  });

  it('a second job does not replace the main one', () => {
    expect(work('I also work at Starbucks on weekends.').inputs[0]).toMatchObject({
      employer: 'Starbucks',
      additional: true,
    });
  });

  it('promotion: role patch for the current job plus a win', () => {
    const r = work('I got promoted to senior engineer!');
    expect(r.currentJobPatch).toEqual({ role: 'senior engineer' });
    expect(r.inputs).toEqual([
      expect.objectContaining({ kind: 'win', title: 'Promoted to senior engineer' }),
    ]);
  });

  it('team, projects, wins and stress', () => {
    expect(work("I'm on the platform team.").currentJobPatch).toEqual({ team: 'platform team' });
    expect(work("We're working on the Q3 launch.").inputs[0]).toMatchObject({
      kind: 'project',
      title: 'Q3 launch',
      status: 'current',
    });
    const shipped = work('We finally shipped the checkout redesign.').inputs;
    expect(shipped.map((i) => i.kind)).toEqual(['project', 'win']);
    expect(shipped[0]).toMatchObject({ status: 'past', subject: 'checkout redesign' });
    expect(work('Work has been so stressful.').inputs[0]).toMatchObject({
      kind: 'stress',
      title: 'Work has been stressful',
    });
    expect(work('My boss keeps micromanaging everything.').inputs[0]).toMatchObject({
      kind: 'stress',
      subject: 'boss',
    });
  });

  it('interviews and reviews get dates; past tense means done', () => {
    expect(work('I have an interview at Stripe next Tuesday.').inputs[0]).toMatchObject({
      kind: 'event',
      eventType: 'interview',
      employer: 'Stripe',
      title: 'Interview at Stripe',
      status: 'planned',
      startDate: '2026-10-06',
    });
    expect(work('My performance review is on October 14.').inputs[0]).toMatchObject({
      eventType: 'review',
      startDate: '2026-10-14',
    });
    expect(work('I had an interview at Stripe yesterday.').inputs[0]).toMatchObject({
      status: 'done',
    });
    expect(work('The deadline is stressful').inputs.filter((i) => i.kind === 'event')).toEqual([]);
  });

  it('career goals', () => {
    expect(work('I really want to get promoted this year.').inputs[0]).toMatchObject({
      kind: 'goal',
      title: 'Get promoted',
      status: 'planned',
    });
  });

  it('ignores negations, lowercase non-names and filler', () => {
    expect(work("I don't work at Acme anymore, that's wrong.").inputs).toEqual([]);
    expect(work('I work at home most days.').inputs).toEqual([]);
    expect(work("I'm a mess at Monday meetings.").inputs).toEqual([]);
  });

  it('reads third-person summaries as inferred', () => {
    const r = parseWorkSummary(
      'The user works at Acme Labs and is preparing the board presentation.',
      opts
    );
    expect(r.inputs[0]).toMatchObject({
      employer: 'Acme Labs',
      source: 'inferred',
      confidence: 0.6,
    });
    expect(r.inputs.some((i) => i.kind === 'project')).toBe(true);
  });
});

describe('place statements', () => {
  it('home now, moves and past homes', () => {
    expect(places('I live in Park Slope, Brooklyn.')[0]).toMatchObject({
      kind: 'home',
      place: 'Park Slope, Brooklyn',
      status: 'current',
    });
    expect(places('We just moved to Denver.')[0]).toMatchObject({
      place: 'Denver',
      status: 'current',
      startDate: '2026-10',
    });
    expect(places('I used to live in Berlin for 3 years.')[0]).toMatchObject({
      place: 'Berlin',
      status: 'past',
      notes: 'Lived there for 3 years',
    });
    expect(places('I grew up in Ohio.')[0]).toMatchObject({
      status: 'past',
      notes: 'Grew up there',
    });
  });

  it('planned trips with dates, companions; not errands', () => {
    expect(places("I'm flying to Lisbon next Friday with Sam.")[0]).toMatchObject({
      kind: 'trip',
      place: 'Lisbon',
      status: 'planned',
      startDate: '2026-10-09',
      withPeople: ['Sam'],
    });
    expect(places('Our trip to Rome in May is booked.')[0]).toMatchObject({
      place: 'Rome',
      startDate: '2027-05',
    });
    expect(places("I'm going to Target later.")).toEqual([]);
  });

  it('trips taken', () => {
    expect(places('I just got back from Tokyo with my wife!')[0]).toMatchObject({
      kind: 'trip',
      place: 'Tokyo',
      status: 'done',
      withPeople: ['my wife'],
    });
    expect(places('We went to Mexico City last month.')[0]).toMatchObject({
      status: 'done',
      startDate: '2026-09',
    });
  });

  it('favourites, places with meaning, bucket list', () => {
    expect(places('My favorite coffee shop is Blue Bottle.')[0]).toMatchObject({
      kind: 'favorite',
      place: 'Blue Bottle',
      category: 'cafe',
    });
    expect(places('Prospect Park is my favourite park.')[0]).toMatchObject({
      kind: 'favorite',
      place: 'Prospect Park',
      category: 'park',
    });
    expect(places('We got engaged in Paris.')[0]).toMatchObject({
      kind: 'meaningful',
      place: 'Paris',
      meaning: 'Where you got engaged',
    });
    expect(places("I've always wanted to go to Japan.")[0]).toMatchObject({
      kind: 'bucket_list',
      place: 'Japan',
    });
    expect(places('Iceland is on my bucket list.')[0]).toMatchObject({
      kind: 'bucket_list',
      place: 'Iceland',
    });
  });

  it('summaries are inferred', () => {
    const r = parsePlaceSummary('The user is planning a trip to Kyoto next month.', opts);
    expect(r[0]).toMatchObject({
      kind: 'trip',
      place: 'Kyoto',
      source: 'inferred',
      startDate: '2026-11',
    });
  });
});

describe('dates', () => {
  it('resolves months and days in the right direction', () => {
    expect(dateFromPhrase('in March', NOW, 'future')).toBe('2027-03');
    expect(dateFromPhrase('in March', NOW, 'past')).toBe('2026-03');
    expect(dateFromPhrase('on December 3', NOW, 'future')).toBe('2026-12-03');
    expect(dateFromPhrase('on May 3', NOW, 'past')).toBe('2026-05-03');
    expect(dateFromPhrase('tomorrow', NOW, 'future')).toBe('2026-10-03');
    expect(dateFromPhrase('since 2019', NOW, 'past')).toBe('2019-01');
    expect(dateFromPhrase('soon', NOW, 'future')).toBeUndefined();
  });
});

describe('facts and place entities', () => {
  it('maps facts about the user, with fact provenance', () => {
    const r = inputsFromFacts(
      [
        { id: 'f1', entityName: 'user', key: 'employer', value: 'Acme', confidence: 0.9 },
        { id: 'f2', entityName: 'user', key: 'job_title', value: 'a designer' },
        {
          id: 'f3',
          entityName: 'user',
          key: 'trip_planned',
          value: 'Lisbon',
          temporalContext: 'in November',
        },
        { id: 'f4', entityName: 'Sam', key: 'employer', value: 'Globex' },
        { id: 'f5', entityName: 'user', key: 'favorite_restaurant', value: 'Lucali' },
      ],
      'conv-1',
      NOW
    );
    expect(r.inputs.map((i) => [i.kind, i.subject, i.factId])).toEqual([
      ['job', 'Acme', 'f1'],
      ['trip', 'Lisbon', 'f3'],
      ['favorite', 'Lucali', 'f5'],
    ]);
    expect(r.inputs[1]).toMatchObject({ startDate: '2026-11', status: 'planned' });
    expect(r.inputs[2]).toMatchObject({ category: 'restaurant' });
    expect(r.currentJobPatch).toEqual({ role: 'designer', factId: 'f2' });
  });

  it('uses place entities only when their attributes say how the user relates to them', () => {
    const r = inputsFromPlaceEntities(
      [
        { id: 'e1', name: 'Austin', type: 'place', attributes: { relation: 'lives here' } },
        { id: 'e2', name: 'Costco', type: 'place', attributes: {} },
        { id: 'e3', name: 'Cabo', type: 'place', attributes: { note: 'visited on vacation' } },
      ],
      'conv-1'
    );
    expect(r.map((i) => [i.kind, i.subject, i.entityId, i.status])).toEqual([
      ['home', 'Austin', 'e1', 'current'],
      ['trip', 'Cabo', 'e3', 'done'],
    ]);
  });
});

describe('extraction categories', () => {
  it('work and place keys get their own fact categories on the memory page', async () => {
    const { categoryForFactType } = await import('../../../memory/dynamic/fact-store.js');
    expect(categoryForFactType('attribute', 'employer')).toBe('work');
    expect(categoryForFactType('attribute', 'job_title')).toBe('work');
    expect(categoryForFactType('attribute', 'lives_in')).toBe('places');
    expect(categoryForFactType('event', 'trip_planned')).toBe('places');
    expect(categoryForFactType('preference', 'likes')).toBe('preference');
    expect(categoryForFactType('attribute')).toBe('personal');
  });
});
