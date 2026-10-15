/**
 * Talk to a teammate is not the caller's life; talk about someone who shares a
 * teammate's name is. Synthetic lines in the prod shape of 2026-10-13.
 */
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';
import { TEAM_MEMBERS } from '../../services/team-unlocks.js';
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
      "I'm going to talk to Jordan about planning this weekend",
      'put me through to Jordan',
      'lemme chat w/ Jordan',
      'talk 2 jordan',
      'can I have Jordan',
      'I need Jordan',
      'go back to Ferni',
      "I'm going to have Jordan help me plan",
      "I'm going to go with Jordan",
      'Jordan, you there?',
      "I'll go ask Jordan",
      'hand me to Nayan',
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
    // speech-to-text often drops the comma after a greeting
    expect(withoutTeammateTalk('hey jordan can you help me do some planning')).toBe(
      'can you help me do some planning'
    );
  });

  it('leaves alone a person in their life who shares a teammate name', () => {
    for (const line of [
      'My friend Jordan is moving to Denver.',
      "Jordan's wedding is next month.",
      'Jordan said she might quit.',
      'I need to talk to Jordan tomorrow about the rent.',
      'My sister Maya got the job!',
      'I had a fight with my brother Peter.',
      'I asked Alex to marry me!',
      'I talked to Maya, she is pregnant.',
      'I spoke with Peter and he wants a divorce.',
      "We're trying to get Jordan into rehab.",
      "I'm going to talk to Jordan about the divorce.",
      'I need to talk to Peter about money, he has been distant.',
      'I have to talk to Alex about our son.',
      'I need to ask Maya for forgiveness.',
      'I finally talked to Peter about the loan.',
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
      'expressed concern about "hey jordan can you help me do some planning"',
      'Made a decision to "I\'m going to talk to Jordan about planning this weekend"',
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
    const ids = new Set(TEAM_MEMBERS.map((m) => m.memberId as string));
    for (const id of Object.values(HEARD_AS)) expect(ids.has(id), id).toBe(true);
  });
});
