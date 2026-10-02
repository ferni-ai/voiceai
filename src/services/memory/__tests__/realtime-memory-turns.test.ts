/**
 * Turn documents follow the shared schema: role, text, timestamp, turnNumber,
 * personaId — written under a deterministic id so retries never duplicate.
 * markSummarized only replaces lastConversationSummary when newer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Write {
  path: string;
  op: 'set' | 'update' | 'add';
  data: Record<string, unknown>;
}

const writes: Write[] = [];
const docs = new Map<string, Record<string, unknown>>();

function docRef(path: string): Record<string, unknown> {
  return {
    collection: (name: string) => collectionRef(`${path}/${name}`),
    set: vi.fn(async (data: Record<string, unknown>) => {
      writes.push({ path, op: 'set', data });
      docs.set(path, data);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      writes.push({ path, op: 'update', data });
      docs.set(path, { ...(docs.get(path) ?? {}), ...data });
    }),
    get: vi.fn(async () => ({ exists: docs.has(path), data: () => docs.get(path) })),
  };
}

function collectionRef(path: string): Record<string, unknown> {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    add: vi.fn(async (data: Record<string, unknown>) => {
      writes.push({ path, op: 'add', data });
      return { id: 'auto' };
    }),
  };
}

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection(name: string): Record<string, unknown> {
      return collectionRef(name);
    }
  },
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));

vi.mock('../../../config/environment.js', () => ({
  getGCPProjectId: () => 'test-project',
  getFirestoreDatabase: () => '(default)',
}));

import { markSummarized, persistTurn, turnDocId } from '../realtime-memory.js';

beforeEach(() => {
  writes.length = 0;
  docs.clear();
});

describe('persistTurn', () => {
  it('writes the contract fields under a turn-number document id', async () => {
    const ok = await persistTurn('u1', 'conv_1', {
      role: 'assistant',
      content: 'How did the interview go?',
      timestamp: new Date('2026-10-02T10:00:00Z'),
      turnNumber: 7,
      personaId: 'maya',
    });
    expect(ok).toBe(true);
    const turnWrite = writes.find((w) => w.path.endsWith('/turns/t000007'));
    expect(turnWrite?.op).toBe('set');
    expect(turnWrite?.data).toMatchObject({
      role: 'assistant',
      text: 'How did the interview go?',
      content: 'How did the interview go?',
      turnNumber: 7,
      personaId: 'maya',
    });
    expect(turnDocId(7)).toBe('t000007');
  });

  it('bumps turnCount and lastActivityAt on the conversation', async () => {
    await persistTurn('u1', 'conv_1', {
      role: 'user',
      content: 'Hi',
      timestamp: new Date('2026-10-02T10:01:00Z'),
      turnNumber: 1,
    });
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    const convUpdate = writes.find(
      (w) => w.op === 'update' && w.path === 'bogle_users/u1/conversations/conv_1'
    );
    expect(convUpdate?.data).toMatchObject({
      turnCount: { __increment: 1 },
      lastActivityAt: new Date('2026-10-02T10:01:00Z'),
    });
  });
});

describe('markSummarized', () => {
  it('updates lastConversationSummary for the newest conversation', async () => {
    docs.set('bogle_users/u1/conversations/conv_new', {
      startedAt: new Date('2026-10-02T09:00:00Z'),
      endedAt: new Date('2026-10-02T09:30:00Z'),
    });
    docs.set('bogle_users/u1', { lastConversationSummaryAt: new Date('2026-10-01T09:00:00Z') });
    expect(await markSummarized('u1', 'conv_new', 'Talked about the interview')).toBe(true);
    expect(docs.get('bogle_users/u1')).toMatchObject({
      lastConversationSummary: 'Talked about the interview',
      lastConversationId: 'conv_new',
    });
    expect(docs.get('bogle_users/u1/conversations/conv_new')).toMatchObject({ summarized: true });
  });

  it('marks an older conversation summarized without clobbering a newer summary', async () => {
    docs.set('bogle_users/u1/conversations/conv_old', {
      startedAt: new Date('2026-09-28T09:00:00Z'),
      lastActivityAt: new Date('2026-09-28T09:20:00Z'),
    });
    docs.set('bogle_users/u1', {
      lastConversationSummary: 'Newer summary',
      lastConversationSummaryAt: new Date('2026-10-01T09:00:00Z'),
    });
    expect(await markSummarized('u1', 'conv_old', 'Old call summary')).toBe(true);
    expect(docs.get('bogle_users/u1')?.lastConversationSummary).toBe('Newer summary');
    expect(docs.get('bogle_users/u1/conversations/conv_old')).toMatchObject({
      summarized: true,
      summary: 'Old call summary',
    });
  });
});
