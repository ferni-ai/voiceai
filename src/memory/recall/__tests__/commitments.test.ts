import { describe, expect, it } from 'vitest';
import { commitmentFollowUp, commitmentIn } from '../commitments.js';
import { followUpId, raisedIn } from '../follow-ups.js';

describe('commitmentIn', () => {
  it('hears a plan with a when, in their own words', () => {
    expect(commitmentIn("Honestly? I'm going to call my mom this weekend.")).toBe(
      "I'm going to call my mom this weekend."
    );
    expect(commitmentIn('I need to talk to my boss on Monday about the raise')).toBe(
      'I need to talk to my boss on Monday about the raise'
    );
    expect(commitmentIn("I'll start running tomorrow morning")).toBe(
      "I'll start running tomorrow morning"
    );
  });

  it('does not treat reassurance, leaving, or a plan with no when as a commitment', () => {
    expect(commitmentIn("I'll be fine tomorrow, don't worry")).toBeNull();
    expect(commitmentIn('I have to go now, talk to you tomorrow')).toBeNull();
    expect(commitmentIn("I'm going to try to be better")).toBeNull();
    expect(commitmentIn('My sister is flying in on Friday')).toBeNull();
  });
});

describe('commitmentFollowUp', () => {
  it('reads as theirs, and closes when a reply asks about it', () => {
    const f = commitmentFollowUp("I'm going to call my mom this weekend.", 1);
    expect(f.text).toBe('They said: "I\'m going to call my mom this weekend."');
    expect(f.id).toBe(followUpId("I'm going to call my mom this weekend."));
    expect(raisedIn('Did you get to call your mom?', [f])).toEqual([f]);
    expect(raisedIn('You said you need a break this weekend?', [f])).toEqual([]);
  });
});
