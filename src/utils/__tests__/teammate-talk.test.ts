/**
 * Talk to a teammate is not the caller's life; talk about someone who shares a
 * teammate's name is. Synthetic lines in the prod shape of 2026-10-13.
 */
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';
import { HEARD_AS as HANDOFF_SPELLINGS } from '../../tools/handoff/teammate-names.js';
import {
  HEARD_AS,
  TEAM_FIRST_NAMES,
  isTeammateTalk,
  withoutTeammateTalk,
} from '../teammate-talk.js';

describe('withoutTeammateTalk', () => {
  it('drops asking for a teammate, and saying they will go to one', () => {
    for (const line of [
      'Can I talk to Jordan?',
      "I'm going to talk to Jordan.",
      'Let me speak with Maya',
      'Switch me over to Peter please',
      'Can you get Nayan?',
      'Bring in Alex.',
      'Is Jordan around?',
      'Jordan please',
      'Can I talk to Naya?', // speech-to-text for Nayan
    ]) {
      expect(withoutTeammateTalk(line), line).toBe('');
    }
  });

  it('cuts the name said to a teammate and keeps what they said', () => {
    expect(withoutTeammateTalk('Hey Jordan, can you help me do some planning')).toBe(
      'can you help me do some planning'
    );
    expect(withoutTeammateTalk('Hey Jordan, my mom is in the hospital.')).toBe(
      'my mom is in the hospital.'
    );
    expect(withoutTeammateTalk('That helps a lot, thanks Maya.')).toBe('That helps a lot');
  });

  it('leaves alone a person in their life who shares a teammate name', () => {
    for (const line of [
      'My friend Jordan is moving to Denver.',
      "Jordan's wedding is next month.",
      'Jordan said she might quit.',
      'I need to talk to Jordan tomorrow about the rent.',
      'My sister Maya got the job!',
      'I had a fight with my brother Peter.',
    ]) {
      expect(withoutTeammateTalk(line), line).toBe(line);
    }
  });
});

describe('isTeammateTalk', () => {
  it('knows a stored moment or thread that is only about switching to a teammate', () => {
    for (const text of [
      'Made a decision to "I\'m going to talk to Jordan"',
      'Made a decision to talk to Jordan',
      'Did you ever talk to Jordan about those plans?',
      'Ask if they talked to Jordan about the plans',
      'Expressed concern about "Hey Jordan, can you help me do some planning"',
    ]) {
      expect(isTeammateTalk(text), text).toBe(true);
    }
  });

  it('keeps a moment about their life, or about a real person with that name', () => {
    for (const text of [
      'Made a decision to "I\'m going to quit my job"',
      'Opened up about "My friend Jordan is moving away and I feel lost"',
      'Ask how the talk with their sister Maya went',
      'Expressed concern about "Hey Jordan, my mom is in the hospital"',
    ]) {
      expect(isTeammateTalk(text), text).toBe(false);
    }
  });
});

describe('the roster', () => {
  it('is the team in persona-ids, with the spellings the handoff tools use', () => {
    const team = [
      'ferni',
      'peter-john',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
      'nayan-patel',
    ];
    expect([...TEAM_FIRST_NAMES]).toEqual(
      team.map((id) => DISPLAY_NAMES[id as keyof typeof DISPLAY_NAMES].toLowerCase())
    );
    expect(HANDOFF_SPELLINGS).toBe(HEARD_AS);
  });
});
