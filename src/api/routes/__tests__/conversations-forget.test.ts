/**
 * GET /api/conversations (the conversation history panel) leaves out each highlight, insight and
 * topic about something the caller asked Ferni to forget, with FORGET_EVERY_READER on; off, the
 * history is sent exactly as read. Runs the real route and the real forget check; only the history
 * store and the forgotten list are faked. Names and places are fictional.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';

const HISTORY = {
  sessions: [
    {
      id: 'a',
      date: '2026-11-10T18:00:00.000Z',
      personaId: 'ferni',
      personaName: 'Ferni',
      duration: 12,
      messageCount: 20,
      insights: ['Theo feels torn about the Denver office', 'Theo sleeps better after walks'],
      highlights: ['Theo got the offer from the Denver office and is unsure about moving'],
      topicsDiscussed: ['Denver office', 'sleep'],
    },
    {
      id: 'b',
      date: '2026-11-08T18:00:00.000Z',
      personaId: 'ferni',
      personaName: 'Ferni',
      duration: 8,
      messageCount: 10,
      insights: ['the garden calms Theo'],
      highlights: ['Theo planted the tomatoes this weekend'],
      topicsDiscussed: ['garden'],
    },
  ],
  totalSessions: 2,
  totalMinutes: 20,
  favoritePersona: 'ferni',
  insightCount: 3,
};

vi.mock('../../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({
    getHistory: async () => structuredClone(HISTORY),
  }),
}));

const { handleGetConversations } = await import('../conversations.js');

async function get(): Promise<string> {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (b: string) => void (body = b),
  } as unknown as ServerResponse;
  const req = {
    method: 'GET',
    headers: { 'x-firebase-uid': 'u-fiction' },
  } as unknown as IncomingMessage;
  await handleGetConversations(req, res, new URL('http://localhost/api/conversations'));
  return body;
}

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

describe('GET /api/conversations with FORGET_EVERY_READER on', () => {
  it('leaves out the highlight, insight and topic about a forgotten topic, keeps the rest', async () => {
    forgotten(['Denver job']);
    const body = await get();
    const data = JSON.parse(body);
    expect(body).not.toContain('Denver');
    expect(data.sessions.map((s: { id: string }) => s.id)).toEqual(['a', 'b']); // the call happened
    expect(data.sessions[0].highlights).toEqual([]);
    expect(data.sessions[0].insights).toEqual(['Theo sleeps better after walks']);
    expect(data.sessions[0].topicsDiscussed).toEqual(['sleep']);
    expect(data.sessions[1]).toEqual(HISTORY.sessions[1]);
    expect(data.insightCount).toBe(2);
  });

  it('nothing forgotten: the history as read', async () => {
    forgotten([]);
    expect(await get()).toBe(JSON.stringify(HISTORY));
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([[undefined], ['off']])(
    'FORGET_EVERY_READER=%s sends the history unchanged',
    async (v) => {
      vi.stubEnv('FORGET_EVERY_READER', v);
      const read = forgotten(['Denver job']);
      const body = await get();
      expect(body).toBe(JSON.stringify(HISTORY));
      expect(body).toContain('Denver office');
      expect(read).not.toHaveBeenCalled();
    }
  );
});
