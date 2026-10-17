/**
 * Talk to a teammate is not the caller's life; talk about someone they know who shares
 * a teammate's name is. Synthetic lines in the prod shape of 2026-10-13.
 */
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';
import { TEAM_MEMBERS } from '../../services/team-unlocks.js';
import { HEARD_AS as HANDOFF_SPELLINGS } from '../../tools/handoff/teammate-names.js';
import {
  HEARD_AS,
  TEAM_FIRST_NAMES,
  isTeammateTalk,
  lifeMoments,
  withoutTeammateTalk,
  teammatesOnCall,
} from '../teammate-talk.js';

describe('withoutTeammateTalk', () => {
  it('drops asking for a teammate, or planning to go to one, whatever it is about', () => {
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
      'I need to talk to Jordan about the trip',
      "I'm going to talk to Jordan about my birthday party",
      "I'm going to talk to Peter about my budget",
      "I'm going to ask Jordan to help with my sister's wedding",
      'can you switch me to jordan i need help with the party',
      'put me through to Jordan',
      'Patch me to Jordan',
      'Send in Jordan',
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

  it('cuts the name said to a teammate, or the request, and keeps their own news', () => {
    expect(withoutTeammateTalk('Hey Jordan, can you help me do some planning')).toBe(
      'can you help me do some planning'
    );
    // speech-to-text often drops the comma after a greeting
    expect(withoutTeammateTalk('hey jordan can you help me do some planning')).toBe(
      'can you help me do some planning'
    );
    expect(withoutTeammateTalk('Hey Jordan, my mom is in the hospital.')).toBe(
      'my mom is in the hospital.'
    );
    expect(withoutTeammateTalk('That helps a lot, thanks Maya.')).toBe('That helps a lot');
    expect(withoutTeammateTalk("I'm going to talk to Jordan, I'm overwhelmed with this move")).toBe(
      "I'm overwhelmed with this move"
    );
  });

  it('cuts only the teammate from an ask that carries life news', () => {
    expect(withoutTeammateTalk('I got laid off today, can I talk to Peter about my budget?')).toBe(
      'I got laid off today, can I talk about my budget?'
    );
    expect(withoutTeammateTalk("I want to talk to Jordan about my dad's funeral")).toBe(
      "I want to talk about my dad's funeral"
    );
    expect(isTeammateTalk("Decided to talk to Jordan about my dad's funeral")).toBe(false);
  });

  it('keeps someone in their life who shares a teammate name', () => {
    for (const line of [
      'My friend Jordan is moving to Denver.',
      "Jordan's wedding is next month.",
      'Jordan said she might quit.',
      'My sister Maya got the job!',
      'I had a fight with my brother Peter.',
      'I asked Alex to marry me!',
      'I asked Alex out.',
      'I want Peter back.',
      'I talked to Maya, she is pregnant.',
      'I spoke with Peter and he wants a divorce.',
      "We're trying to get Jordan into rehab.",
      'I need to ask Maya for forgiveness.',
      'I finally talked to Peter about the loan.',
      'Maya is pregnant!',
    ]) {
      expect(withoutTeammateTalk(line), line).toBe(line);
    }
  });

  it('the cost: a friend named without any sign of who they are reads as the teammate', () => {
    expect(withoutTeammateTalk("I'm going to talk to Alex tonight.")).toBe('');
    expect(withoutTeammateTalk('I need to talk to Peter about money, he has been distant.')).toBe(
      'he has been distant.'
    );
  });
});

describe('isTeammateTalk', () => {
  it("knows a stored moment or thread about going to a teammate, the model's wording too", () => {
    for (const text of [
      'Made a decision to "I\'m going to talk to Jordan"',
      'Made a decision to talk to Jordan',
      'Did you ever talk to Jordan about those plans?',
      'Ask if they talked to Jordan about the plans',
      'Expressed concern about "Hey Jordan, can you help me do some planning"',
      'expressed concern about "hey jordan can you help me do some planning"',
      'Made a decision to "I\'m going to talk to Jordan about planning this weekend"',
      'User decided to talk to Jordan about their plans',
      'Made a decision to talk to Jordan about the trip',
      'Wants Jordan to help plan the party',
      'Ask how the planning with Jordan went',
      'Follow up on their conversation with Jordan',
    ]) {
      expect(isTeammateTalk(text), text).toBe(true);
    }
  });

  it('keeps a moment about their life, or about someone they know with that name', () => {
    for (const text of [
      'Made a decision to "I\'m going to quit my job"',
      'Opened up about "My friend Jordan is moving away and I feel lost"',
      'Ask how the talk with their sister Maya went',
      'Expressed concern about "Hey Jordan, my mom is in the hospital"',
      'Celebrated "I asked Alex out and she said yes"',
      "Follow up on Jordan's wedding",
    ]) {
      expect(isTeammateTalk(text), text).toBe(false);
    }
  });

  it('filters moments only when read: the stored list is left as it was', () => {
    const stored = [{ summary: 'Made a decision to talk to Jordan' }, { summary: 'Quit the job' }];
    expect(lifeMoments(stored)).toEqual([{ summary: 'Quit the job' }]);
    expect(stored).toHaveLength(2);
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
    expect(HANDOFF_SPELLINGS).toEqual(HEARD_AS);
    const ids = new Set(TEAM_MEMBERS.map((m) => m.memberId as string));
    for (const id of Object.values(HEARD_AS)) expect(ids.has(id), id).toBe(true);
  });
});

describe('teammatesOnCall', () => {
  const on = (role: string, content: string) => [...teammatesOnCall([{ role, content }])];

  it('hears a teammate speaking as themself', () => {
    expect(on('assistant', "Hi, I'm Jordan. What are we planning?")).toEqual(['jordan']);
    expect(on('assistant', 'Peter here, what can I do?')).toEqual(['peter']);
  });

  it("never takes presence from the caller's own line, a name and a comma included", () => {
    expect(on('user', 'Maya, my sister, had a baby girl yesterday')).toEqual([]);
    expect(on('user', 'hey jorden can you help')).toEqual([]);
    expect(on('user', "I'm Jordan")).toEqual([]);
  });

  it('does not take a name said about someone for a teammate on the call', () => {
    expect(on('assistant', "It's Maya's birthday soon, right?")).toEqual([]);
    expect(on('user', 'Jordan got a new job')).toEqual([]);
    expect(on('assistant', 'Jordan would know more about that.')).toEqual([]);
  });
});
