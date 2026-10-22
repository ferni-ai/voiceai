/**
 * MINOR_CARE: who reads as under 18 (only their own stated age or grade), and
 * the per-session hold every memory writer asks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../safe-logger.js', () => {
  const logger = {
    info: (...args: unknown[]) => void logged.push(args),
    warn: (...args: unknown[]) => void logged.push(args),
    debug: (...args: unknown[]) => void logged.push(args),
    error: (...args: unknown[]) => void logged.push(args),
  };
  return { createLogger: () => logger };
});

import {
  heldAfter,
  likelyMinor,
  memoryHeld,
  MINOR_CARE_NOTE,
  minorCareNote,
  noteCallerWords,
  resetMinorCare,
  setVerifiedOwnerCheck,
  statesUnder18,
} from '../minor-care.js';

const ON = { MINOR_CARE: 'on' };
const ASKED = 'How old are you, if you don’t mind me asking?';

afterEach(() => {
  resetMinorCare();
  logged.length = 0;
  vi.useRealTimers();
});

describe('statesUnder18: their own stated age or grade, nothing else', () => {
  it.each([
    'I am fifteen years old',
    "I'm 16 years old",
    "I'm a 15 year old girl",
    '16 years old.',
    'Um, 16 years old',
    "I'm 14 and my birthday is in May",
    'I just turned 15.',
    "I'm turning 18 next month",
    "I'll be 16 in March",
    "I'm in 10th grade",
    "I'm in the tenth grade",
    'I go to 9th grade at Lincoln',
    "I'm a sophomore in high school",
    'Sophomore in high school.',
    'yeah, junior in high school',
    "I'm in high school",
    "I'm in high school, so",
    "I'm still in middle school",
    'I go to middle school over on Pine',
    "I'm a high schooler",
    // "I'm" + 10-17 ending its clause, no age question needed (a real call: "I'm only 14")
    "I'm 14",
    "I'm 14.",
    'im only 13',
    "I'm just 15",
    "I'm only fourteen",
    "I'm 12",
    "I'm 16",
    "I'm 15 now",
    "I'm 16, so",
    "I'm 13 and bored",
    "I'm like 14",
    "I said I'm 14",
    "I told her I'm 14",
    "I'm in high school right now",
    "I'm in high school now, and I hate it",
    "I'm in 8th grade and my mom is picking me up",
    "I'm turning 18 next week",
    // when unsure, the caller's own words: the exclusions stay narrow
    "I'm in 8th grade and my kids at school are mean",
    "I'm a sophomore, my parents' kids are loud",
    "I'm 15 years old, was wondering",
    "I'm 14 years old when I'm with my dad",
    "I just said I'm 14",
    "I already said I'm 14 years old",
    "I literally said I'm 14",
  ])('flags %j', (said) => {
    expect(statesUnder18(said)).toBe(true);
  });

  it.each([
    ['16.', ASKED],
    ['Sixteen.', ASKED],
    ['um, fifteen', 'Wait, how old are you?'],
    ["I'm 16", ASKED],
    ["I'm only 13 and kind of bored", 'what age are you?'],
    ['I’m 14, so my mom drives me', 'what grade are you in, how old?'],
  ])('flags %j as the answer to Ferni asking their age', (said, asked) => {
    expect(statesUnder18(said, asked)).toBe(true);
  });

  it.each([
    // someone else, or the past
    'my son is 16',
    'my son is 16 years old',
    '16 years ago I moved here',
    "I'm 61",
    "I'm 18",
    "I'm 25 and tired",
    'I teach high school',
    'I was 16 when I learned to drive',
    'I was 16 years old then',
    'my daughter is in high school',
    'my daughter is a sophomore in high school',
    "she's 15 and I'm her dad",
    'I skipped school today',
    "I'm a senior",
    'I was in high school then',
    "I'm in 16th place",
    "I'll be 40 next week",
    // a unit after the number
    "I'm 16 minutes away",
    "I'm 16 weeks pregnant",
    "I'm 16 percent sure",
    "I'll be 10 minutes late",
    'I will be 12 days sober',
    "I'll be 15 years sober in June",
    "I'm turning 10 pages a night",
    "I'll be 12 miles out",
    "I'll be 8 hours",
    // a bare number nobody asked about as an age
    "I'm 8.",
    "my pain? I'm 7",
    "I'm 9 though",
    'sixteen.',
    "I'm 40",
    // a unit or a noun after the number
    "I'm 14 days sober",
    "I'm 15 minutes away",
    "I'm 16 and a half weeks pregnant",
    "I'm 17 years into my marriage",
    "I'm 14 for sure",
    "I'm 15 in line",
    "I'm 12 out of 20",
    "I'm 14 on the list",
    'I got a 14 for my score',
    '16th of March',
    // someone else's age or words, or a past age
    'my 14 year old daughter',
    'I have a 16 year old',
    'when I was 15',
    'my daughter is 14 years old',
    "she said I'm 14 years old and stormed off",
    "my mom goes I'm 14",
    "he told me I'm 14",
    '16 years old when I had her',
    'Sixteen years old is when I started working',
    "I'm 12 years old at heart",
    "I feel 16 years old again",
    // a parent at a school
    "I'm in high school right now picking up my kid",
    "I'm in high school now, waiting for my son",
    "I'm in middle school pickup with my son",
    "I'm a high school teacher",
    "I'm a freshman in college",
    // school words that aren't their school
    'I go to high school football games',
    'I attend high school games',
    "I'm in the middle school pickup line",
    "I'm in high school pickup right now",
    'I go to high school reunions every year',
    "I'm in 5th grade pickup",
    // jokes
    "lol I feel like I'm 12",
    "I'm like 14 now haha",
    "honestly I'm 12 lol",
    "I feel like I'm in middle school again",
  ])('does not flag %j', (said) => {
    expect(statesUnder18(said)).toBe(false);
  });

  it('a bare number answers an age question, not a pain scale or an amount', () => {
    expect(statesUnder18("I'm 7", 'On a scale of one to ten, how bad is the pain?')).toBe(false);
    expect(statesUnder18('8.', 'How would you rate today, one to ten?')).toBe(false);
    expect(statesUnder18("I'm 10.", 'On a scale of one to ten, how bad is it?')).toBe(false);
    expect(statesUnder18("I'm 15.", 'How many minutes out are you?')).toBe(false);
    expect(statesUnder18('16.')).toBe(false); // a lone number stays ask-gated
  });
});

describe('the per-session hold', () => {
  it('holds memory once the caller sounds under 18, flag on, not a verified owner', () => {
    expect(memoryHeld('s1', ON)).toBe(false);
    expect(noteCallerWords('s1', 'What should I watch tonight?', { env: ON })).toBe(false);
    expect(memoryHeld('s1', ON)).toBe(false);
    expect(noteCallerWords('s1', "I'm 16 years old and I'm bored", { env: ON })).toBe(true);
    expect(likelyMinor('s1')).toBe(true);
    expect(memoryHeld('s1', ON)).toBe(true);
    // Sticks for the session, later words don't clear it.
    noteCallerWords('s1', 'anyway', { env: ON });
    expect(memoryHeld('s1', ON)).toBe(true);
    expect(memoryHeld('s2', ON)).toBe(false);
  });

  it('heldAfter reads a bare answer against what Ferni just asked', () => {
    expect(heldAfter('s5', '16.', { env: ON })).toBe(false);
    expect(heldAfter('s5', '16.', { env: ON, asked: ASKED })).toBe(true);
  });

  it('a verified account owner is never held', () => {
    setVerifiedOwnerCheck((id) => id === 'owner');
    noteCallerWords('owner', "I'm 16 years old", { env: ON });
    expect(memoryHeld('owner', ON)).toBe(false);
  });

  it('flag off: nothing held, no note, no state and no log', () => {
    expect(heldAfter('s3', "I'm 15 years old", { env: {} })).toBe(false);
    expect(noteCallerWords('s3', "I'm 15 years old", { env: {} })).toBe(false);
    expect(minorCareNote('s3', "I'm 15 years old", { env: {} })).toBe('');
    expect(likelyMinor('s3')).toBe(false);
    expect(memoryHeld('s3', ON)).toBe(false);
    expect(logged).toEqual([]);
  });

  it('the note: on for a caller who sounds under 18, never with crisis guidance', () => {
    expect(minorCareNote('s4', 'hey', { env: ON })).toBe('');
    expect(minorCareNote('s4', "I'm in 9th grade", { env: ON })).toBe(MINOR_CARE_NOTE);
    expect(minorCareNote('s4', 'ok', { env: ON, careful: true })).toBe('');
    expect(MINOR_CARE_NOTE).toMatch(/gently ask if they're okay/);
    expect(MINOR_CARE_NOTE).toMatch(/friend-voice, not a partner/);
  });

  it('no care note for a verified account owner', () => {
    setVerifiedOwnerCheck((id) => id === 'owner-note');
    expect(minorCareNote('owner-note', "I'm in 9th grade", { env: ON })).toBe('');
    expect(minorCareNote('not-owner', "I'm in 9th grade", { env: ON })).toBe(MINOR_CARE_NOTE);
  });
});

describe('eviction: a held session stays held while its call may still run', () => {
  it('600 callers under 18 on at once: the first is still held', () => {
    for (let i = 0; i < 600; i++) noteCallerWords(`busy-${i}`, "I'm in 8th grade", { env: ON });
    expect(memoryHeld('busy-0', ON)).toBe(true);
    expect(memoryHeld('busy-599', ON)).toBe(true);
  });

  it('only sessions idle long past any call or after-call work go, least recently used first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T08:00:00Z'));
    noteCallerWords('old-active', "I'm in 8th grade", { env: ON });
    noteCallerWords('old-idle', "I'm in 8th grade", { env: ON });
    for (let i = 0; i < 498; i++) noteCallerWords(`fill-${i}`, "I'm in 8th grade", { env: ON });
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
    // Still being asked about (its after-call work is running): it is recently used.
    expect(memoryHeld('old-active', ON)).toBe(true);
    for (let i = 0; i < 10; i++) noteCallerWords(`new-${i}`, "I'm in 8th grade", { env: ON });
    expect(memoryHeld('old-active', ON)).toBe(true);
    expect(likelyMinor('old-idle')).toBe(false);
    expect(memoryHeld('new-9', ON)).toBe(true);
  });
});
