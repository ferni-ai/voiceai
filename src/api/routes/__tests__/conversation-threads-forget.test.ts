/**
 * GET /api/conversations/threads leaves out a thread about something the caller asked Ferni to
 * forget, with FORGET_EVERY_READER on; off, every thread is sent as read. Runs the real route and
 * the real forget check; only Firestore, auth and the forgotten list are faked. Fictional data.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { resetForgetTopicsSource } from '../../../memory/recall/forget-topics-source.js';

const thread = (id: string, topic: string, lastMessage: string, updatedAt: string) => ({
  userId: 'u-fiction',
  topic,
  lastMessage,
  personaId: 'ferni',
  personaName: 'Ferni',
  status: 'open',
  priority: 'normal',
  createdAt: updatedAt,
  updatedAt,
  messageCount: 3,
  id,
});
const STORED = [
  thread('t1', 'the move', 'Theo got the offer from the Denver office', '2026-11-10T00:00:00.000Z'),
  thread('t2', 'the garden', 'Theo planted the tomatoes', '2026-11-09T00:00:00.000Z'),
];

vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => {
          const query = {
            orderBy: () => query,
            limit: () => query,
            get: async () => ({
              docs: STORED.map(({ id, ...data }) => ({ id, data: () => data })),
            }),
          };
          return query;
        },
      }),
    }),
  }),
}));
vi.mock('../../auth-middleware.js', () => ({
  requireAuth: async () => ({ userId: 'u-fiction', isAdmin: false }),
}));

const { handleGetThreads } = await import('../conversation-threads.js');

async function get(): Promise<{ body: string; ids: string[] }> {
  let body = '';
  const res = {
    writeHead: () => res,
    setHeader: () => undefined,
    end: (b: string) => void (body = b),
  } as unknown as ServerResponse;
  const req = { method: 'GET', headers: {} } as unknown as IncomingMessage;
  await handleGetThreads(req, res, new URL('http://localhost/api/conversations/threads?limit=10'));
  const threads = JSON.parse(body).threads as Array<{ id: string }>;
  return { body, ids: threads.map((t) => t.id) };
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

describe('GET /api/conversations/threads with FORGET_EVERY_READER on', () => {
  it('leaves out a thread whose last message is about a forgotten topic', async () => {
    forgotten(['Denver job']);
    const { body, ids } = await get();
    expect(ids).toEqual(['t2']);
    expect(body).not.toContain('Denver');
    expect(JSON.parse(body).count).toBe(1);
  });

  it('nothing forgotten: every thread', async () => {
    forgotten([]);
    expect((await get()).ids).toEqual(['t1', 't2']);
  });
});

describe('with FORGET_EVERY_READER off (prod today)', () => {
  it.each([[undefined], ['off']])('FORGET_EVERY_READER=%s sends every thread', async (v) => {
    vi.stubEnv('FORGET_EVERY_READER', v);
    const read = forgotten(['Denver job']);
    const { body, ids } = await get();
    expect(ids).toEqual(['t1', 't2']);
    expect(body).toContain('Denver office');
    expect(read).not.toHaveBeenCalled();
  });
});
