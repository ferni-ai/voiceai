/**
 * FORGET_EVERY_READER at the source: every registered context builder reads
 * the caller's memory through the filtered views promptInput builds
 * (core/prompt-input.ts, memory/recall/prompt-view.ts). A forgotten topic is
 * seeded in every profile field and every userData field a builder could
 * read; then every builder runs. With the flag off some builder repeats it
 * (the precondition: the walk can see a leak); with it on, none does.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => ['Biscuit'],
}));

import { createUserProfile } from '../../../types/user-profile.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';
import { ensureBuildersLoaded } from '../core/loader.js';
import { getRegisteredBuilders } from '../index.js';
import { promptInput } from '../core/prompt-input.js';
import type { ContextBuilderInput } from '../core/types.js';

const USER = 'member-every-builder';
const TOPIC = 'Biscuit';
const BUILDER_MS = 3000;

function seededInput(): ContextBuilderInput {
  const now = new Date();
  const profile = {
    ...createUserProfile(USER, 'Sam'),
    totalConversations: 12,
    relationshipStage: 'old_friend',
    lastContact: new Date(now.getTime() - 2 * 86_400_000),
    lastConversationSummary: 'Biscuit chewed the couch and the vet visit for Biscuit',
    lastCallerSummary: 'how Biscuit is doing after the vet',
    preferredTopics: ['Biscuit walks'],
    openQuestions: ['is Biscuit ok?'],
    keyMoments: [{ id: 'k1', summary: 'Biscuit learned sit', type: 'milestone', timestamp: now }],
    conversationSummaries: [
      { id: 's1', summary: 'Biscuit and the couch', topics: ['Biscuit'], timestamp: now },
    ],
    pendingFollowUps: [{ topic: 'Biscuit vet visit', targetDate: now, reason: 'check on Biscuit' }],
    goals: [{ id: 'g1', name: 'save for Biscuit surgery', type: 'other', status: 'active' }],
    lifeEvents: [{ id: 'l1', type: 'loss', title: 'Biscuit is sick', status: 'in_progress' }],
    familyMembers: [{ name: 'Biscuit', relationship: 'dog', notes: 'Biscuit the dog' }],
    sharedStories: [{ id: 'st1', title: 'Biscuit at the beach', summary: 'Biscuit swam' }],
    currentMood: 'worried about Biscuit',
  } as unknown as ReturnType<typeof createUserProfile>;
  const services = {
    sessionId: 'every-builder',
    userId: USER,
    sessionStartTime: Date.now(),
    userProfile: profile,
  };
  return {
    // A recap request: the conversation recap builder repeats the last summary verbatim.
    userText: 'remind me where we were',
    analysis: {
      emotion: { primary: 'neutral', intensity: 0.4, valence: 'neutral', distressLevel: 0 },
      intent: { primary: 'chat', confidence: 0.5 },
      topics: { detected: ['Biscuit'], current: 'Biscuit' },
      state: {},
    } as never,
    services,
    userData: {
      userName: 'Sam',
      isReturningUser: true,
      turnCount: 4,
      lastTopic: 'Biscuit',
      recentTopics: ['Biscuit', 'the vet'],
      keyMoments: [{ summary: 'Biscuit learned sit', timestamp: now }],
      storiesShared: ['Biscuit at the beach'],
      referencedMemories: ['Biscuit chewed the couch'],
      extractedDetails: [{ type: 'pet_name', value: 'Biscuit' }],
      services,
    } as never,
    userProfile: profile,
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as never,
  };
}

async function walk(): Promise<{ ran: number; leaks: string[] }> {
  resetForgetTopicsSource();
  const builders = getRegisteredBuilders();
  const leaks: string[] = [];
  let ran = 0;
  for (const builder of builders) {
    const input = await promptInput(seededInput());
    const out = await Promise.race([
      builder.build(input).catch(() => []),
      new Promise<[]>((resolve) => {
        setTimeout(() => resolve([]), BUILDER_MS);
      }),
    ]);
    ran++;
    for (const injection of out) {
      if (injection.content?.includes(TOPIC)) leaks.push(builder.name);
    }
  }
  return { ran, leaks: [...new Set(leaks)] };
}

describe('every registered context builder', () => {
  beforeAll(async () => {
    await ensureBuildersLoaded();
  }, 120_000);
  afterAll(() => vi.unstubAllEnvs());

  it('flag off: some builder repeats the topic (the walk sees a leak)', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const { ran, leaks } = await walk();
    expect(ran).toBeGreaterThan(50);
    expect(leaks).toContain('conversation_recap'); // deterministic: no randomness in it
  }, 600_000);

  it('flag on: no builder repeats the forgotten topic', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const { ran, leaks } = await walk();
    expect(ran).toBeGreaterThan(50);
    expect(leaks).toEqual([]);
  }, 600_000);
});

describe('promptInput', () => {
  it('hands builders filtered services, userData and userProfile', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    resetForgetTopicsSource();
    const raw = seededInput();
    const input = await promptInput(raw);
    const text = (v: unknown) => JSON.stringify(v ?? null);
    expect(text(raw.services.userProfile)).toContain(TOPIC); // the precondition
    expect(text(input.services.userProfile)).not.toContain(TOPIC);
    expect(text((input.userData as { keyMoments?: unknown }).keyMoments)).not.toContain(TOPIC);
    expect(text(input.userData.recentTopics)).not.toContain(TOPIC);
    expect(text(input.userProfile)).not.toContain(TOPIC);
    expect(input.services.sessionId).toBe('every-builder');
  });
});
