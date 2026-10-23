/**
 * FORGET_EVERY_READER: a topic the caller asked to forget stays out of every
 * reader that reaches the prompt. Each case forgets a topic through forgetTopic
 * first, then reads through the production reader: with the flag on the
 * forgotten item is gone and an unrelated one stays; with it off both come back
 * (what main does today).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../types/user-profile.js';

const stored = vi.hoisted(() => ({ topics: [] as string[] | null }));

vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));
vi.mock('../../retrieval/bm25-search.js', () => ({
  searchEntitiesBM25: async () => [
    { id: 'b1', score: 2, text: 'Biscuit the dog chewed the couch', metadata: {} },
    { id: 'b2', score: 1.5, text: 'training for the Boston marathon', metadata: {} },
  ],
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  searchMemories: async () => ({ results: [] }),
  removeIndexedMemory: async () => undefined,
}));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => ({
    id: 'e1',
    canonicalName: 'Biscuit',
    type: 'pet',
    aliases: ['Biscuit'],
  }),
  searchEntities: async () => [
    { id: 'e2', canonicalName: 'Dana', type: 'person', aliases: [], salience: 0.6 },
  ],
}));

import { forgetTopic, type ForgetStore } from '../forget.js';
import { clearLastRead, keepRemembered, profileForPrompt } from '../forget-every-reader.js';
import { hybridSearch } from '../../retrieval/hybrid-search.js';
import { UnifiedMemoryStoreFacade } from '../../unified-store/facade.js';
import { callerHistory, greetingFacts } from '../../../agents/multi-agent/greeting-direction.js';
import { lastTalkedAbout } from '../../../agents/multi-agent/teammate-relationship.js';
import { buildConversationRecap } from '../../../intelligence/context-builders/session/conversation-recap.js';
import { sendRecall } from '../../../agents/personas/context-packet/turn-packet.js';

const USER = 'member-forget-every-reader';

/** A store with no facts that records topics, so forgetTopic runs as in a call. */
function topicStore(): ForgetStore {
  return {
    facts: async () => [],
    markForgotten: async () => undefined,
    addTopic: async (_u, topic) => {
      stored.topics = [...(stored.topics ?? []), topic];
    },
    topics: async () => stored.topics,
  };
}

async function forget(topic: string): Promise<void> {
  const result = await forgetTopic(USER, topic, topicStore());
  expect(result.kind).toBe('forgotten');
}

function setFlag(on: boolean): void {
  if (on) process.env.FORGET_EVERY_READER = 'on';
  else delete process.env.FORGET_EVERY_READER;
}

beforeEach(() => {
  stored.topics = [];
  clearLastRead();
});
afterEach(() => setFlag(false));

describe.each([true, false])('FORGET_EVERY_READER %s', (on) => {
  beforeEach(async () => {
    setFlag(on);
    // Before the forget, every reader returns the item (the precondition).
    await forget('Biscuit');
  });

  it('the system prompt and the greeting: the last call summary and life events', async () => {
    const profile = {
      totalConversations: 4,
      lastCallerSummary: 'how Biscuit keeps chewing the couch',
      lifeEvents: [
        { id: 'l1', type: 'loss', title: 'Biscuit is sick', status: 'in_progress' },
        { id: 'l2', type: 'relocation', title: 'moving to Denver', status: 'upcoming' },
      ],
      goals: [],
      primaryConcerns: [],
    } as unknown as UserProfile;
    const seen = await profileForPrompt({ userId: USER, userProfile: profile });
    const facts = greetingFacts('morning', 'Sam', callerHistory(seen!));
    const prompt = seen?.lastCallerSummary ? lastTalkedAbout(false, seen.lastCallerSummary) : '';
    const events = (seen?.lifeEvents ?? []).map((e) => e.title);
    if (on) {
      expect(facts['what you talked about last time']).toBeUndefined();
      expect(prompt).toBe('');
      expect(events).toEqual(['moving to Denver']);
    } else {
      expect(facts['what you talked about last time']).toContain('Biscuit');
      expect(prompt).toContain('Biscuit');
      expect(events).toEqual(['Biscuit is sick', 'moving to Denver']);
    }
    expect(profile.lastCallerSummary).toContain('Biscuit'); // the stored profile is unchanged
  });

  it('the conversation recap: the last summary', async () => {
    const [recap] = await buildConversationRecap({
      userText: 'remind me what we said',
      userData: {},
      services: {
        userId: USER,
        userProfile: { lastConversationSummary: 'Biscuit chewed the couch again' },
      },
    } as never);
    if (on) expect(recap?.content).not.toContain('Biscuit');
    else expect(recap?.content).toContain('Biscuit');
  });

  it('hybrid search: the BM25 and entity legs', async () => {
    const { results } = await hybridSearch(USER, 'Biscuit', { topK: 10, minScore: 0 });
    const ids = results.map((r) => r.id).sort();
    if (on) expect(ids).toEqual(['b2', 'e2']);
    else expect(ids).toEqual(['b1', 'b2', 'e1', 'e2']);
  });

  it('UnifiedStore.recall (memory intelligence)', async () => {
    const store = new UnifiedMemoryStoreFacade({
      features: { useVectorSearch: false, useRedisCache: false },
    } as never);
    const memory = (id: string, content: string, people: string[] = []) => ({
      memory: { id, content, topics: [], peopleMentioned: people, metadata: {} },
      score: 0.9,
      scoreBreakdown: {},
    });
    Object.assign(store as object, {
      initialized: true,
      firestoreAdapter: {
        search: async () => [
          memory('m1', 'he chewed the couch', ['Biscuit']),
          memory('m2', 'Dana called'),
        ],
      },
      memoryAdapter: { search: async () => [] },
    });
    const { memories } = await store.recall({ userId: USER, query: 'couch' });
    const ids = memories.map((m) => m.memory.id).sort();
    if (on) expect(ids).toEqual(['m2']);
    else expect(ids).toEqual(['m1', 'm2']);
  });

  it('recall notes already in the chat are checked again each turn', async () => {
    const items = [
      { id: 'recall_1', textContent: '[WHAT YOU REMEMBER] their dog Biscuit chews things' },
      { id: 'recall_2', textContent: '[WHAT YOU REMEMBER] training for Boston' },
      { id: 'user_1', textContent: 'Biscuit did it again' }, // the caller's words, never touched
    ];
    let current = items;
    const agent = {
      chatCtx: {
        copy: () => ({
          items: [...current],
          addMessage: (m: { content: string; id?: string }) => {
            current = [...current, { id: m.id ?? '', textContent: m.content }];
          },
        }),
      },
      updateChatCtx: async (ctx: unknown) => {
        current = (ctx as { items: typeof items }).items;
      },
    };
    sendRecall(agent as never, {}, { lastPick: () => null } as never, null, USER);
    const ids = current.map((i) => i.id);
    if (on) expect(ids).toEqual(['recall_2', 'user_1']);
    else expect(ids).toEqual(['recall_1', 'recall_2', 'user_1']);
  });
});

describe('fails closed', () => {
  it('drops every item when the stored topics cannot be read (flag on)', async () => {
    setFlag(true);
    stored.topics = null;
    expect(await keepRemembered(USER, [{ text: 'anything' }])).toEqual([]);
  });

  it('reads nothing for a caller with no account', async () => {
    setFlag(true);
    stored.topics = null;
    expect(await keepRemembered('anonymous', [{ text: 'anything' }])).toHaveLength(1);
  });
});
