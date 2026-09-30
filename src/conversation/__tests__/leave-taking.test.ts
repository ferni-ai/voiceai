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
      'Gotta go!',
      'I have to go to work now, bye',
      'Thanks so much, bye bye',
      'Ok thanks, see ya',
      "I'm heading to bed, night night",
      'I have to go now, is that ok?',
      'Alright, take care',
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
      'I have to go back to school next week',
      'I have to go through all these emails',
      'I have to run the numbers first',
      "I've got to run a marathon in May",
      'Night shift is killing me',
      "I'll let you go ahead and pick",
      'My mom said goodnight and left',
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
