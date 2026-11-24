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

/** Habit talk without the word "habit": all ten must bring up Maya. */
const HABIT_TALK = [
  'I kept forgetting to stretch',
  'I keep on forgetting to take my vitamins',
  'I want to read each night before bed',
  'I was flossing every night and then I just stopped',
  'I keep hitting snooze',
  'I keep forgetting to drink water',
  'I keep skipping my walks',
  'I broke my journaling streak',
  'I want to stretch every morning',
  'I want to journal each evening',
];

/**
 * Grief, crisis, medication, drinking and gambling: none may bring up Maya, even with a
 * habit phrase in them. The first eight are the round-1 review's; the rest are fresh.
 */
const NOT_HABIT_TALK_LINES = [
  'I keep forgetting to eat since she died',
  "every morning I wake up and wish I hadn't",
  'I cry every morning in the car since the funeral',
  "I keep skipping my meds and I don't care anymore",
  'my losing streak at poker',
  "I've been drinking every single evening",
  'she used to call me each evening',
  'I fell off the wagon',
  'ever since my dad passed away I keep forgetting to take my vitamins',
  'I stopped stretching every morning after the funeral',
  'I keep forgetting to take my pills and honestly whatever',
  "I've been having a few drinks every night before bed",
  "I've been betting on games every single night",
  "I keep forgetting to go to the gym, I don't care anymore",
  'my reading streak ended the week my wife died',
  'I relapsed and stopped journaling every night',
  'I miss her every morning when I walk every morning alone',
  'what is the point of reading every night anyway, no point',
];

describe('MAYA_HABIT_TRIGGERS=on', () => {
  it.each(HABIT_TALK)('"%s" fits Maya', (words) => {
    set(true);
    expect(fits(words)).toBe('Maya');
  });

  it('brings up Maya for all ten habit lines', () => {
    set(true);
    expect(HABIT_TALK.filter((w) => fits(w) === 'Maya')).toEqual(HABIT_TALK);
  });

  it.each(NOT_HABIT_TALK_LINES)('"%s" never brings up Maya', (words) => {
    set(true);
    expect(isMayaHabitTalk(words.toLowerCase())).toBe(false);
    expect(fits(words)).not.toBe('Maya');
    expect(onOwnBeat('maya-santos', words)).toBe(false);
  });

  it('holds Maya back on her own words too when grief is in the turn', () => {
    set(true);
    expect(fits('since she died I can not keep any routine')).toBeUndefined();
    set(false);
    expect(fits('since she died I can not keep any routine')).toBe('Maya'); // main
  });

  it('sends no team line on a crisis turn, habit phrase or not', () => {
    set(true);
    expect(teamByNeedNote('ferni', 'i keep forgetting to stretch', '', true)).toBe('');
    expect(teamByNeedNote('ferni', 'i keep forgetting to stretch', '', false)).toMatch(/fits Maya/);
  });

  it.each([
    'I forgot my keys',
    'I keep forgetting to call her back',
    'every morning is hard',
    'I broke my streak',
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
    expect(fits('I see a pattern, I keep forgetting to stretch')).toBe('Peter');
  });

  it('keeps them for that teammate after they were offered: Maya does not take them over', () => {
    set(true);
    expect(fits('I meditate every morning', 'Nayan could help with that.')).toBeUndefined();
  });

  it('offers Maya once a call', () => {
    set(true);
    expect(fits('I keep skipping my walks', 'Want Maya for that?')).toBeUndefined();
  });

  it("makes habit talk Maya's own beat when she is the one answering", () => {
    set(true);
    expect(onOwnBeat('maya-santos', 'I keep skipping my walks')).toBe(true);
    expect(onOwnBeat('peter-john', 'I keep skipping my walks')).toBe(false);
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

  it('keeps the team line on a crisis turn, as on main', () => {
    set(false);
    expect(teamByNeedNote('ferni', 'my morning routine is a mess', '', true)).toBe(
      teamByNeedNote('ferni', 'my morning routine is a mess', '', false)
    );
    expect(teamByNeedNote('ferni', 'my morning routine is a mess', '', true)).toMatch(/fits Maya/);
  });
});
