/**
 * FORGET_EVERY_READER and the caller profile (forget-profile.ts): every field
 * is filtered but an explicit allowlist, so a free-text field added later is
 * filtered from the day it lands; the legacy recallFromMemory tool reads the
 * filtered profile and this call's key moments through the same check; and a
 * topic's first word is not taken for a name ("Divorce papers").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null }));
vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

import { createUserProfile } from '../../../types/user-profile.js';
import { rememberNames, resetForgetTopicsSource } from '../forget-topics-source.js';
import { PROFILE_PASS_THROUGH, profileForCaller } from '../forget-every-reader.js';
import { recallFromMemoryDef } from '../../../tools/domains/memory/tools.js';

let seq = 0;
let user = '';
beforeEach(() => {
  resetForgetTopicsSource();
  stored.topics = ['Biscuit'];
  user = `member-forget-profile-${++seq}`;
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

/** A full profile with the forgotten topic in every field that can hold words. */
function profileFullOfBiscuit(): Record<string, unknown> {
  return {
    ...createUserProfile(user, 'Sam'),
    lastConversationSummary: 'Biscuit chewed the couch',
    lastCallerSummary: 'how Biscuit is doing',
    currentMood: 'worried about Biscuit',
    preferredTopics: ['Biscuit walks', 'gardening'],
    avoidTopics: ['Biscuit vet bills'],
    openQuestions: ['is Biscuit ok?', 'what to plant'],
    financialAnxietyTriggers: ['vet bills for Biscuit'],
    keyMoments: [{ id: 'k1', summary: 'Biscuit learned sit', type: 'milestone' }],
    familyMembers: [{ name: 'Dana', relationship: 'sister', notes: 'walks Biscuit' }],
    conversationSummaries: [{ id: 's1', summary: 'Biscuit and the couch', topics: ['pets'] }],
    pendingFollowUps: [{ topic: 'Biscuit vet visit', targetDate: new Date(), reason: 'check' }],
    goals: [{ id: 'g1', name: 'save for Biscuit surgery', type: 'other' }],
    lifeEvents: [{ id: 'l1', type: 'loss', title: 'Biscuit is sick', status: 'in_progress' }],
    preferences: { favoriteThing: 'Biscuit', likesQuiet: true },
    customData: { note: 'Biscuit is the dog' },
    // A field nobody has written yet: it must be filtered without anyone listing it.
    brandNewNoteField: 'Biscuit chewed a shoe',
    brandNewList: ['Biscuit at the park', 'a quiet week'],
  };
}

describe('profileForCaller: an allowlist', () => {
  it('filters every field but the allowlist, including fields added later', async () => {
    const input = profileFullOfBiscuit();
    const about = Object.keys(input).filter((k) =>
      JSON.stringify(input[k] ?? null).includes('Biscuit')
    );
    expect(about.length).toBeGreaterThanOrEqual(17); // the precondition: it is everywhere
    const out = (await profileForCaller(user, input)) as Record<string, unknown>;
    for (const k of Object.keys(input)) {
      if (PROFILE_PASS_THROUGH.has(k)) continue;
      expect(JSON.stringify(out[k] ?? null), k).not.toContain('Biscuit');
    }
    // What isn't about it stays.
    expect(out.preferredTopics).toEqual(['gardening']);
    expect(out.openQuestions).toEqual(['what to plant']);
    expect(out.brandNewList).toEqual(['a quiet week']);
    expect(out.preferences).toEqual({ likesQuiet: true });
    expect(out.name).toBe('Sam');
    expect(input.lastConversationSummary).toContain('Biscuit'); // the stored profile is unchanged
  });

  it('the allowlist is exactly identity, contact, routing and fixed vocabularies', () => {
    expect([...PROFILE_PASS_THROUGH].sort()).toEqual(
      [
        'communicationStyle',
        'contactInfo',
        'currentEnergyLevel',
        'currentSessionId',
        'humorAppreciation',
        'id',
        'investmentExperience',
        'lifeStage',
        'linkedIdentifiers',
        'location',
        'name',
        'onboarding',
        'preferredName',
        'relationshipStage',
        'riskProfile',
        'speakingPace',
        'userId',
        'voiceSketch',
      ].sort()
    );
  });

  it('flag off: the profile comes back unchanged', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const input = profileFullOfBiscuit();
    expect(await profileForCaller(user, input)).toBe(input);
  });
});

describe('recallFromMemory (legacy tool)', () => {
  type Execute = (args: { topic: string }, opts: unknown) => Promise<string>;
  const recall = (userData: Record<string, unknown>) =>
    (
      recallFromMemoryDef.create({ agentId: 'ferni' } as never) as unknown as { execute: Execute }
    ).execute({ topic: 'anything' }, { ctx: { userData } });

  it('reads the filtered profile: the summary and topics about it are gone', async () => {
    const profile = {
      totalConversations: 4,
      relationshipStage: 'old_friend',
      goals: [],
      preferredTopics: ['Biscuit walks', 'gardening'],
      lastConversationSummary: 'Biscuit chewed the couch',
    };
    const reply = await recall({ userId: user, services: { userProfile: profile } });
    expect(reply).toBe("I recall you've been interested in: gardening");
  });

  it("filters this call's key moments too", async () => {
    const reply = await recall({ userId: user, keyMoments: ['Biscuit chewed it', 'went hiking'] });
    expect(reply).toBe('From our conversation today: went hiking');
  });
});

describe("a topic's first word is not a name", () => {
  it('forgetting "Divorce papers" redacts a later summary about them, inflected', async () => {
    stored.topics = ['Divorce papers'];
    for (const summary of [
      'the divorce papers came today',
      'they are divorcing and the papers came today',
    ]) {
      const out = await profileForCaller(user, { lastConversationSummary: summary });
      expect(out.lastConversationSummary, summary).toBeUndefined();
    }
  });

  it('a one-word known name still needs the whole word: forgetting Mark keeps "marked"', async () => {
    stored.topics = ['Mark'];
    rememberNames(user, ['Mark']);
    const out = await profileForCaller(user, {
      lastConversationSummary: 'the report was marked late',
      lastCallerSummary: 'Mark called',
    });
    expect(out.lastConversationSummary).toBe('the report was marked late');
    expect(out.lastCallerSummary).toBeUndefined();
  });
});
