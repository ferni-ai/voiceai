/**
 * MINOR_CARE: who reads as under 18 (only their own stated age or grade), and
 * the per-session hold every memory writer asks.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
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

afterEach(() => resetMinorCare());

describe('statesUnder18: their own stated age or grade, nothing else', () => {
  it.each([
    "I'm 16",
    'im 16.',
    "I'm sixteen",
    'I am fifteen years old',
    'I’m 14, so my mom drives me',
    "I'm only 13 and kind of bored",
    'I just turned 15.',
    "I'm turning 18 next month",
    "I'll be 16 in March",
    "I'm in 10th grade",
    "I'm in the tenth grade",
    "I'm a sophomore in high school",
    "I'm in high school",
    "I'm still in middle school",
    'I go to middle school over on Pine',
    "I'm a high schooler",
  ])('flags %j', (said) => {
    expect(statesUnder18(said)).toBe(true);
  });

  it.each([
    'my son is 16',
    '16 years ago I moved here',
    "I'm 61",
    "I'm 18",
    "I'm 25 and tired",
    'I teach high school',
    'I was 16 when I learned to drive',
    "I'm 16 minutes away",
    "I'm 16 weeks pregnant",
    "I'm 16 percent sure",
    "I'm a senior",
    'I was in high school then',
    'my daughter is in high school',
    "I'll be 40 next week",
    "I'm in 16th place",
    "she's 15 and I'm her dad",
    'I skipped school today',
  ])('does not flag %j', (said) => {
    expect(statesUnder18(said)).toBe(false);
  });
});

describe('the per-session hold', () => {
  it('holds memory once the caller sounds under 18, flag on, not a verified owner', () => {
    expect(memoryHeld('s1', ON)).toBe(false);
    expect(noteCallerWords('s1', 'What should I watch tonight?')).toBe(false);
    expect(memoryHeld('s1', ON)).toBe(false);
    expect(noteCallerWords('s1', "I'm 16 and I'm bored")).toBe(true);
    expect(likelyMinor('s1')).toBe(true);
    expect(memoryHeld('s1', ON)).toBe(true);
    // Sticks for the session, later words don't clear it.
    noteCallerWords('s1', 'anyway');
    expect(memoryHeld('s1', ON)).toBe(true);
    expect(memoryHeld('s2', ON)).toBe(false);
  });

  it('a verified account owner is never held', () => {
    setVerifiedOwnerCheck((id) => id === 'owner');
    noteCallerWords('owner', "I'm 16");
    expect(memoryHeld('owner', ON)).toBe(false);
  });

  it('flag off: nothing held, no note', () => {
    noteCallerWords('s3', "I'm 15");
    expect(memoryHeld('s3', {})).toBe(false);
    expect(minorCareNote('s3', "I'm 15", { env: {} })).toBe('');
  });

  it('the note: on for a caller who sounds under 18, never with crisis guidance', () => {
    expect(minorCareNote('s4', 'hey', { env: ON })).toBe('');
    expect(minorCareNote('s4', "I'm in 9th grade", { env: ON })).toBe(MINOR_CARE_NOTE);
    expect(minorCareNote('s4', 'ok', { env: ON, careful: true })).toBe('');
    expect(MINOR_CARE_NOTE).toMatch(/gently ask if they're okay/);
    expect(MINOR_CARE_NOTE).toMatch(/friend-voice, not a partner/);
  });
});
