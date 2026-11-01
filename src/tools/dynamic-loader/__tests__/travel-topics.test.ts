/**
 * Drive-time and flight questions ask for getCommuteTime (information) and
 * searchFlights (travel), never the transportation ride tools; the same words
 * used as idioms ask for neither.
 *
 * Dev e2e sweep 2026-10-30: both questions below went to searchWeb because no
 * topic word loaded either domain.
 */
import { describe, expect, it } from 'vitest';
import { DynamicToolLoader } from '../index.js';

const loader = new DynamicToolLoader({ enableAutoUnload: false, essentialDomains: [] });
const detect = (said: string) => loader.detectTopics(said.toLowerCase());
const domainsFor = (said: string) => detect(said).suggestedDomains;

describe('travel topic words', () => {
  it.each([
    'How long to drive from the Denver airport to downtown Boulder?',
    "What's traffic like on I-25 right now?",
    'How bad is my commute this morning?',
    'Can you get directions to the Pearl Street Mall?',
    'How far is it to Fort Collins?',
    'How long does it take to get to the airport?',
    'How long will it take us to get there?',
    'How long would it take me to drive to Zion?',
    'Is it a long drive to Vail?',
    'What is the drive time to Golden?',
  ])('asks for getCommuteTime from information for %j', (said) => {
    expect(domainsFor(said)).toContain('information');
    expect(domainsFor(said)).not.toContain('transportation');
    expect(detect(said).leadTools[0]).toBe('getCommuteTime');
  });

  it.each([
    'Cheapest one-way flight Denver to Phoenix next Friday?',
    'Find me flights to Chicago in March',
    "I want to fly to Boston next week, what's the airfare?",
    'How much is a plane ticket to Seattle?',
    "We're flying out of DIA on Sunday",
  ])('asks for searchFlights from travel for %j', (said) => {
    expect(domainsFor(said)).toContain('travel');
    expect(detect(said).leadTools[0]).toBe('searchFlights');
  });

  it('offers searchFlights for "travel"', () => {
    expect(domainsFor('I love to travel')).toContain('travel');
    expect(detect('I love to travel').leadTools).toContain('searchFlights');
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
    'How long does it take to get over a breakup?',
  ])('asks for no travel tool for %j', (said) => {
    expect(detect(said).leadTools).toEqual([]);
    expect(domainsFor(said)).not.toContain('travel');
  });
});
