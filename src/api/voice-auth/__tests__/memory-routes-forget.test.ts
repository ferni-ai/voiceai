/**
 * The voice memory routes (/api/voice/memory, /memory/context, /memory/conversations) leave out
 * what is about a topic the caller asked Ferni to forget, with FORGET_EVERY_READER on; off, each
 * answers exactly as before. Runs the real routes and the real forget check; only the
 * realtime-memory reads and the forgotten list are faked. Names and places are fictional.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';

const AT = new Date('2026-11-10T18:00:00.000Z');
const MEMORY = {
  totalConversations: 2,
  totalDuration: 10,
  firstConversation: AT,
  lastConversation: AT,
  topics: [
    { topic: 'denver', count: 3, lastMentioned: AT },
    { topic: 'garden', count: 2, lastMentioned: AT },
  ],
  relationshipMilestones: [{ type: 'first_conversation', date: AT, description: 'First call' }],
};
const CONTEXT = {
  recentTopics: ['denver', 'garden'],
  unfinishedThreads: [
    { topic: 'should I take the Denver offer?', lastDiscussed: AT, summary: 'should I take it?' },
    { topic: 'when do tomatoes go in?', lastDiscussed: AT, summary: 'when do tomatoes go in?' },
  ],
  rememberedDetails: [
    {
      detail: 'The offer from the Denver office sounds like a big step',
      confidence: 0.7,
      source: 'conversation',
    },
    {
      detail: 'Tomatoes like a warm, sunny corner of the garden',
      confidence: 0.7,
      source: 'conversation',
    },
  ],
  suggestedFollowUps: ['Ask about the Denver office', 'Ask about the garden'],
};
const CONVERSATIONS = [
  {
    id: 'c1',
    startedAt: AT,
    endedAt: AT,
    summary: 'Theo weighed the offer from the Denver office',
    topics: ['weighed', 'offer', 'denver', 'office'],
    turns: [],
    turnCount: 12,
    voiceVerified: false,
  },
  {
    id: 'c2',
    startedAt: AT,
    endedAt: AT,
    summary: 'Theo planted the tomatoes',
    topics: ['planted', 'tomatoes'],
    turns: [],
    turnCount: 8,
    voiceVerified: false,
  },
];

vi.mock('../../../services/memory/realtime-memory.js', () => ({
  getUserMemoryForAPI: async () => structuredClone(MEMORY),
  getConversationContextForAPI: async () => structuredClone(CONTEXT),
  getConversationsWithTurnsForAPI: async () => structuredClone(CONVERSATIONS),
}));

const { handleMemoryRoutes } = await import('../memory-routes.js');

async function get(route: string): Promise<string> {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (b: string) => void (body = b),
  } as unknown as ServerResponse;
  const req = {
    method: 'GET',
    url: `/api/voice${route}`,
    headers: { 'x-firebase-uid': 'u-fiction' },
  } as unknown as IncomingMessage;
  expect(await handleMemoryRoutes(req, res, route)).toBe(true);
  return body;
}

/** What each route sent before the forget check (the code on main). */
const BEFORE = {
  '/memory': {
    hasMemory: true,
    totalConversations: 2,
    totalDuration: 10,
    firstConversation: AT,
    lastConversation: AT,
    topTopics: MEMORY.topics,
    recentMilestones: MEMORY.relationshipMilestones,
  },
  '/memory/context': CONTEXT,
  '/memory/conversations': {
    conversations: CONVERSATIONS.map(({ turns: _t, ...c }) => c),
  },
};

const forgotten = (topics: string[]) =>
  vi.spyOn(firestoreForgetStore, 'topics').mockImplementation(async () => topics);

beforeEach(() => {
  vi.stubEnv('FORGET_EVERY_READER', 'on');
  resetForgetTopicsSource();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('voice memory routes with FORGET_EVERY_READER on', () => {
  beforeEach(() => void forgotten(['Denver job']));

  it('/memory leaves the forgotten word out of the top topics', async () => {
    const body = await get('/memory');
    expect(body).not.toMatch(/denver/i);
    expect(JSON.parse(body).topTopics.map((t: { topic: string }) => t.topic)).toEqual(['garden']);
  });

  it('/memory/context leaves out every topic, thread, detail and follow-up about it', async () => {
    const body = await get('/memory/context');
    expect(body).not.toMatch(/denver/i);
    const data = JSON.parse(body);
    expect(data.recentTopics).toEqual(['garden']);
    expect(data.unfinishedThreads.map((t: { topic: string }) => t.topic)).toEqual([
      'when do tomatoes go in?',
    ]);
    expect(data.rememberedDetails).toHaveLength(1);
    expect(data.rememberedDetails[0].detail).toContain('Tomatoes');
    expect(data.suggestedFollowUps).toEqual(['Ask about the garden']);
  });

  it('/memory/conversations keeps the call but drops its summary and the words cut from it', async () => {
    const body = await get('/memory/conversations');
    expect(body).not.toMatch(/denver/i);
    const [c1, c2] = JSON.parse(body).conversations;
    expect(c1.id).toBe('c1');
    expect(c1.summary).toBeUndefined();
    expect(c1.topics).toEqual([]);
    expect(c2.summary).toBe('Theo planted the tomatoes');
    expect(c2.topics).toEqual(['planted', 'tomatoes']);
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([
    [undefined, '/memory'],
    ['off', '/memory'],
    [undefined, '/memory/context'],
    ['off', '/memory/context'],
    [undefined, '/memory/conversations'],
    ['off', '/memory/conversations'],
  ] as const)('FORGET_EVERY_READER=%s: %s answers as before', async (v, route) => {
    vi.stubEnv('FORGET_EVERY_READER', v);
    const read = forgotten(['Denver job']);
    const body = await get(route);
    expect(body).toBe(JSON.stringify(BEFORE[route]));
    expect(body).toMatch(/denver/i);
    expect(read).not.toHaveBeenCalled();
  });
});
