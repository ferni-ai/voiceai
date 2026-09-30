import { afterEach, describe, expect, it } from 'vitest';

import { clearConversationalRepairEngine } from '../conversational-repair.js';
import { sessionRepairCue } from '../repair-cue.js';

const SESSION = 'repair-cue-test';
const cueFor = (text: string, userData: Record<string, unknown> = {}) =>
  sessionRepairCue(userData, SESSION, text, 'So you moved to Austin last spring?');

afterEach(() => clearConversationalRepairEngine(SESSION));

describe('sessionRepairCue', () => {
  it('asks Ferni to own a misunderstanding briefly', () => {
    const cue = cueFor('No, I meant Boston, you misunderstood');
    expect(cue).toContain('correcting you');
    expect(cue).toContain('No long apology');
  });

  it('hears that they want to be heard, not fixed', () => {
    expect(cueFor('I just want to vent right now')).toContain('heard, not fixed');
  });

  it('lets an unwanted topic go', () => {
    expect(cueFor("I don't want to talk about that")).toContain('Let it go lightly');
  });

  it('stays quiet for ordinary turns and weak signals about their day', () => {
    expect(cueFor('We had pizza and watched a movie')).toBeNull();
    expect(cueFor('ugh, work was awful today')).toBeNull();
    expect(cueFor('The thing is, I love my job')).toBeNull();
  });

  it('analyzes each message once, so preemptive and final generations agree', () => {
    const userData: Record<string, unknown> = {};
    const first = cueFor('No, I meant Boston, you misunderstood', userData);
    expect(cueFor('No, I meant Boston, you misunderstood', userData)).toBe(first);
  });

  it('needs session data and text', () => {
    expect(sessionRepairCue(undefined, SESSION, 'you misunderstood')).toBeNull();
    expect(sessionRepairCue({}, undefined, 'you misunderstood')).toBeNull();
    expect(sessionRepairCue({}, SESSION, '  ')).toBeNull();
  });
});
