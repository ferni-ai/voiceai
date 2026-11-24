/**
 * MAYA_HABIT_TRIGGERS (#1431): habit talk without the word "habit" brings up Maya,
 * the habits coach, on the per-turn team line, unless another teammate's own words
 * claim it. Off, the team line is what main sends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAYA_HABIT_WORDS, isMayaHabitTalk } from '../maya-habit-need.js';
import { onOwnBeat, teamByNeedNote } from '../team-by-need-note.js';

const set = (habit: boolean) => {
  vi.stubEnv('TEAM_BY_NEED', 'on');
  vi.stubEnv('MAYA_HABIT_TRIGGERS', habit ? 'on' : '');
};
afterEach(() => vi.unstubAllEnvs());

/** Who the team line says the caller's words fit, if anyone. */
const fits = (words: string, agentWords = ''): string | undefined =>
  teamByNeedNote('ferni', words.toLowerCase(), agentWords).match(/fits (\w+):/)?.[1];

const HABIT_TALK = [
  'I broke my streak again',
  'my streaks never last',
  'I want to stretch every morning',
  'I keep forgetting to drink water',
  'I keep skipping my walks',
  'I fell off the wagon this week',
  'I want to journal each evening',
];

describe('MAYA_HABIT_TRIGGERS=on', () => {
  it.each(HABIT_TALK)('"%s" fits Maya', (words) => {
    set(true);
    expect(fits(words)).toBe('Maya');
  });

  it.each([
    'I forgot my keys',
    'I forgot to call her back',
    'I think about him every day',
    'that was a streaky game',
    'every morningstar has a name',
  ])('"%s" is not habit talk', (words) => {
    set(true);
    expect(isMayaHabitTalk(words.toLowerCase())).toBe(false);
    expect(fits(words)).toBeUndefined();
  });

  it("leaves habit talk to the teammate whose words it also is: Nayan's meditation, Alex's calendar, Peter's patterns", () => {
    set(true);
    expect(fits('I meditate every morning')).toBe('Nayan');
    expect(fits('can you schedule a meeting every morning')).toBe('Alex');
    expect(fits('I see a pattern, I keep forgetting to eat')).toBe('Peter');
  });

  it('keeps them for that teammate after they were offered: Maya does not take them over', () => {
    set(true);
    expect(fits('I meditate every morning', 'Nayan could help with that.')).toBeUndefined();
  });

  it('offers Maya once a call', () => {
    set(true);
    expect(fits('I broke my streak', 'Want Maya for that?')).toBeUndefined();
  });

  it("makes habit talk Maya's own beat when she is the one answering", () => {
    set(true);
    expect(onOwnBeat('maya-santos', 'I broke my streak')).toBe(true);
    expect(onOwnBeat('peter-john', 'I broke my streak')).toBe(false);
  });
});

describe('MAYA_HABIT_TRIGGERS off (main)', () => {
  it.each(HABIT_TALK)('"%s" fits nobody, as on main', (words) => {
    set(false);
    expect(MAYA_HABIT_WORDS.test(words.toLowerCase())).toBe(true); // the words are there
    expect(isMayaHabitTalk(words.toLowerCase())).toBe(false);
    expect(fits(words)).toBeUndefined();
    expect(onOwnBeat('maya-santos', words)).toBe(false);
  });

  it('still brings up Maya for the words main already had', () => {
    set(false);
    expect(fits('my morning routine is a mess')).toBe('Maya');
  });
});
