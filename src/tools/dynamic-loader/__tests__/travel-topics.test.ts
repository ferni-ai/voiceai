/**
 * Drive-time and flight questions load transportation (getCommuteTime) and
 * travel (searchFlights); the same words used as idioms load neither.
 *
 * Dev e2e sweep 2026-10-30: both questions below went to searchWeb because no
 * topic word loaded either domain.
 */
import { describe, expect, it } from 'vitest';
import { DynamicToolLoader } from '../index.js';

const loader = new DynamicToolLoader({ enableAutoUnload: false, essentialDomains: [] });
const domainsFor = (said: string) => loader.detectTopics(said.toLowerCase()).suggestedDomains;

describe('travel topic words', () => {
  it.each([
    'How long to drive from the Denver airport to downtown Boulder?',
    "What's traffic like on I-25 right now?",
    'How bad is my commute this morning?',
    'Can you get directions to the Pearl Street Mall?',
    'How far is it to Fort Collins?',
    'How long does it take to get to the airport?',
    'Is it a long drive to Vail?',
    'What is the drive time to Golden?',
  ])('loads transportation for %j', (said) => {
    expect(domainsFor(said)).toContain('transportation');
  });

  it.each([
    'Cheapest one-way flight Denver to Phoenix next Friday?',
    'Find me flights to Chicago in March',
    "I want to fly to Boston next week, what's the airfare?",
    'How much is a plane ticket to Seattle?',
    "We're flying out of DIA on Sunday",
  ])('loads travel for %j', (said) => {
    expect(domainsFor(said)).toContain('travel');
  });

  it('maps "travel" to the travel domain, which holds searchFlights', () => {
    expect(domainsFor('I love to travel')).toContain('travel');
  });

  it.each([
    "I'm driven, I always have been",
    'Those meetings drive me crazy',
    'He is driving me up the wall',
    'My hard drive is full',
    "Don't fly off the handle",
    'What a flight of fancy',
    'I climbed a flight of stairs',
    'My fight or flight kicked in',
    'Read the directions on the bottle',
    'How far along are you in the book?',
  ])('does not load transportation or travel for %j', (said) => {
    const domains = domainsFor(said);
    expect(domains).not.toContain('transportation');
    expect(domains).not.toContain('travel');
  });
});
