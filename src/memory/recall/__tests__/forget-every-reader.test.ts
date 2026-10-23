/**
 * FORGET_EVERY_READER: a topic the caller asked to forget stays out of every
 * reader that reaches the prompt. Each reader is read twice: with the topic
 * only in the store (forgotten in an earlier call or another process), and
 * only in this process (forgotten mid-call, the store not read yet). With the
 * flag on the forgotten item is gone and an unrelated one stays; with it off
 * both come back (main today).
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
  findEntityByAlias: async () => null,
  searchEntities: async () => [
    // Only an alias names the dog: two levels down (data.metadata.aliases).
    { id: 'e1', canonicalName: 'the pup', type: 'pet', aliases: ['Biscuit'], salience: 0.7 },
    { id: 'e2', canonicalName: 'Dana', type: 'person', aliases: [], salience: 0.6 },
  ],
}));

import { forgetTopic, type ForgetStore } from '../forget.js';
import { resetForgetTopicsSource } from '../forget-topics-source.js';
import { profileForPrompt } from '../forget-every-reader.js';
import { hybridSearch } from '../../retrieval/hybrid-search.js';
import { UnifiedMemoryStoreFacade } from '../../unified-store/facade.js';
import { callerHistory, greetingFacts } from '../../../agents/multi-agent/greeting-direction.js';
import { sendRecall } from '../../../agents/personas/context-packet/turn-packet.js';
import { dropForgottenNotes } from '../../../agents/multi-agent/recall-note.js';
import { injectUserAwareness } from '../../../agents/voice-agent-entry/user-awareness-injection.js';
import { getRelationshipSummaryDef } from '../../../tools/domains/memory/tools.js';

type Source = 'store' | 'process';
let userSeq = 0;
let user = '';

/** Forget "Biscuit": recorded in the store only, or noted in this process only. */
async function forgetBiscuit(source: Source): Promise<void> {
  if (source === 'store') {
    stored.topics = ['Biscuit'];
    return;
  }
  const processOnly: ForgetStore = {
    facts: async () => [],
    markForgotten: async () => undefined,
    addTopic: async () => undefined, // the store never gets it
    topics: async () => [],
  };
  expect((await forgetTopic(user, 'Biscuit', processOnly)).kind).toBe('forgotten');
  expect(stored.topics).toEqual([]);
}

beforeEach(() => {
  stored.topics = [];
  resetForgetTopicsSource();
  user = `member-fer-${++userSeq}`; // in-process forgets are per caller and never cleared
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['store', true],
  ['store', false],
  ['process', true],
  ['process', false],
] as Array<[Source, boolean]>)('topic only in the %s, FORGET_EVERY_READER %s', (source, on) => {
  beforeEach(async () => {
    vi.stubEnv('FORGET_EVERY_READER', on ? 'on' : 'off');
    await forgetBiscuit(source);
  });

  it('profile → system prompt summary and greeting', async () => {
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
    const seen = await profileForPrompt({ userId: user, userProfile: profile });
    const facts = greetingFacts('morning', 'Sam', callerHistory(seen!));
    const events = (seen?.lifeEvents ?? []).map((e) => e.title);
    if (on) {
      expect(facts['what you talked about last time']).toBeUndefined();
      expect(events).toEqual(['moving to Denver']);
    } else {
      expect(facts['what you talked about last time']).toContain('Biscuit');
      expect(events).toEqual(['Biscuit is sick', 'moving to Denver']);
    }
    expect(profile.lastCallerSummary).toContain('Biscuit'); // the stored profile is unchanged
  });

  it('single-agent awareness block (voice-agent-entry)', async () => {
    const profile = {
      totalConversations: 4,
      lastConversationSummary: 'Biscuit chewed the couch again',
      goals: [],
      primaryConcerns: [],
    } as unknown as UserProfile;
    const { instructionsBlock } = await injectUserAwareness({
      sessionId: `s-${user}`,
      userProfile: profile,
      userData: { userId: user }, // the caller the injection filters for
      isReturningUser: true,
      sessionStartTime: new Date(),
    });
    if (on) expect(instructionsBlock).not.toContain('Biscuit');
    else expect(instructionsBlock).toContain('Last time you talked about: Biscuit');
  });

  it('relationship-summary tool', async () => {
    const userData = {
      userId: user,
      services: {
        userProfile: {
          name: 'Sam',
          totalConversations: 4,
          relationshipStage: 'old_friend',
          preferredTopics: [],
          goals: [],
          lastConversationSummary: 'Biscuit chewed the couch again',
        },
      },
    };
    type Execute = (args: object, opts: unknown) => Promise<string>;
    const tool = getRelationshipSummaryDef.create({ agentId: 'ferni' } as never) as unknown as {
      execute: Execute;
    };
    const reply = await tool.execute({}, { ctx: { userData } });
    expect(reply).toContain('4 conversations');
    if (on) expect(reply).not.toContain('Biscuit');
    else expect(reply).toContain('Last time: Biscuit');
  });

  it('hybrid search: the BM25 leg and an entity known only by an alias', async () => {
    const { results } = await hybridSearch(user, 'Biscuit', { topK: 10, minScore: 0 });
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
    const { memories } = await store.recall({ userId: user, query: 'couch' });
    const ids = memories.map((m) => m.memory.id).sort();
    if (on) expect(ids).toEqual(['m2']);
    else expect(ids).toEqual(['m1', 'm2']);
  });

  it('recall notes already in the chat are checked again each turn', async () => {
    // The store's topics reach the transcript tick once read (agent setup prefetches them).
    const { agent, ids } = chat([
      { id: 'recall_1', textContent: '[WHAT YOU REMEMBER] their dog Biscuit chews things' },
      { id: 'recall_2', textContent: '[WHAT YOU REMEMBER] training for Boston' },
      { id: 'user_1', textContent: 'Biscuit did it again' }, // the caller's words, never touched
    ]);
    await primeStore(user);
    sendRecall(agent as never, {}, { lastPick: () => null } as never, null, 'again', user);
    if (on) expect(ids()).toEqual(['recall_2', 'user_1']);
    else expect(ids()).toEqual(['recall_1', 'recall_2', 'user_1']);
  });
});

describe('dropForgottenNotes and PREEMPT_STABLE_CONTEXT', () => {
  const SAID = 'tell me about it';
  /** A chat with a preemptive reply in flight for SAID (LiveKit's AgentActivity, as read). */
  function inFlight() {
    const { agent, ids } = chat([
      { id: 'recall_1', textContent: '[WHAT YOU REMEMBER] their dog Biscuit chews things' },
      { id: 'user_1', textContent: SAID },
    ]);
    const activity = {
      _preemptiveGeneration: { info: { newTranscript: SAID }, createdAt: Date.now() } as object,
      _preemptiveGenerationCount: 1,
      onPreemptiveGeneration: vi.fn((info: object) => {
        activity._preemptiveGeneration = { info, createdAt: Date.now() };
      }),
    };
    Object.assign(agent, { _agentActivity: activity });
    return { agent, ids, restart: activity.onPreemptiveGeneration };
  }
  const aboutBiscuit = (text: string) => /biscuit/i.test(text);

  it('on: the note comes out at once and the preemptive reply starts again without it', () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    const { agent, ids, restart } = inFlight();
    expect(dropForgottenNotes(agent as never, aboutBiscuit, SAID)).toBe(1);
    expect(ids()).toEqual(['user_1']);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('defer: never held for the reply that read the note; out at once', () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'defer');
    const { agent, ids, restart } = inFlight();
    dropForgottenNotes(agent as never, aboutBiscuit, SAID);
    expect(ids()).toEqual(['user_1']); // the commit sees a changed context and drops that reply
    expect(restart).not.toHaveBeenCalled();
  });

  it("sendRecall hands the turn's words on, so the re-check can restart the reply", async () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    resetForgetTopicsSource();
    stored.topics = ['Biscuit'];
    user = `member-preempt-drop-${++userSeq}`;
    await primeStore(user);
    const { agent, ids, restart } = inFlight();
    sendRecall(agent as never, {}, { lastPick: () => null } as never, null, SAID, user);
    expect(ids()).toEqual(['user_1']);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('nothing forgotten in the chat: no write and no restart', () => {
    vi.stubEnv('PREEMPT_STABLE_CONTEXT', 'on');
    const { agent, ids, restart } = inFlight();
    expect(dropForgottenNotes(agent as never, () => false, SAID)).toBe(0);
    expect(ids()).toEqual(['recall_1', 'user_1']);
    expect(restart).not.toHaveBeenCalled();
  });
});

/** The first read for a caller (agent setup's prefetch): the transcript tick then has a source. */
async function primeStore(userId: string): Promise<void> {
  const { readTopics } = await import('../forget-topics-source.js');
  await readTopics(userId);
}

function chat(items: Array<{ id: string; textContent: string }>) {
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
  return { agent, ids: () => current.map((i) => i.id) };
}
