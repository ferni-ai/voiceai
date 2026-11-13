/**
 * Talk to a teammate is not the caller's life; talk about someone they know who shares
 * a teammate's name is. Synthetic lines in the prod shape of 2026-10-13.
 */
import { describe, expect, it, vi } from 'vitest';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';
import { TEAM_MEMBERS } from '../../services/team-unlocks.js';
import { HEARD_AS as HANDOFF_SPELLINGS } from '../../tools/handoff/teammate-names.js';
import {
  HEARD_AS,
  TEAM_FIRST_NAMES,
  isTeammateTalk,
  lifeMoments,
  teammatesOnCall,
} from '../teammate-talk.js';

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
      'Ask how Jordan, their brother, is doing',
    ]) {
      expect(isTeammateTalk(text), text).toBe(false);
    }
  });

  it('is never teammate talk when life news is anywhere in it', () => {
    for (const news of [
      'my mom had a stroke',
      'my wife left me',
      'my brother relapsed',
      'she was abused as a kid',
      'we lost an embryo in IVF',
      'she had a miscarriage',
      'the breakup is hard',
      'I lost my job',
      'I had a panic attack',
      "I've been depressed",
      "I'm struggling",
      'my dad is losing his job',
      'my sister is losing her job',
    ]) {
      const text = `Decided to talk to Jordan. ${news}`;
      expect(isTeammateTalk(text), text).toBe(false);
    }
  });

  it('filters moments only when read: the stored list is left as it was', () => {
    const stored = [{ summary: 'Made a decision to talk to Jordan' }, { summary: 'Quit the job' }];
    expect(lifeMoments(stored), 'flag off: as on main').toEqual(stored);
    vi.stubEnv('TEAMMATE_TALK_FILTER', 'on');
    expect(lifeMoments(stored)).toEqual([{ summary: 'Quit the job' }]);
    vi.unstubAllEnvs();
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
