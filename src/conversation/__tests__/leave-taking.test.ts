import { describe, expect, it } from 'vitest';
import { isLeaving, leaveTakingCue } from '../leave-taking.js';

describe('isLeaving', () => {
  it('hears the caller wrapping up', () => {
    for (const text of [
      'Okay I gotta run, talk soon',
      "Alright, I've got to go pick up the kids",
      "Well, I'll let you go",
      'Goodnight Ferni',
      'bye!',
      "That's all for today, thanks",
      'I better get going',
    ]) {
      expect(isLeaving(text), text).toBe(true);
    }
  });

  it('does not mistake everyday sentences for a goodbye', () => {
    for (const text of [
      'Do I have to go to the party?',
      'I have to go to the dentist on Friday and I am dreading it',
      'We talked about it later that night',
      'My kid said bye to the dog and cried',
      undefined,
    ]) {
      expect(isLeaving(text), String(text)).toBe(false);
    }
  });
});

describe('leaveTakingCue', () => {
  it('asks for a warm, short goodbye that carries one thing and holds no one', () => {
    const cue = leaveTakingCue('ok bye');
    expect(cue).toContain('[THEY ARE HEADING OFF]');
    expect(cue).toMatch(/one specific thing/);
    expect(cue).toMatch(/no new question/);
    expect(leaveTakingCue('How are you?')).toBeNull();
  });
});
