/**
 * Memory control service: unwraps the api.ts response wrapper into Results,
 * builds the right paths, and turns failures into ApiErrors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  getApiHeadersAsync: vi.fn(async () => ({ 'X-User-Id': 'u1' })),
}));

import { apiDelete, apiGet, apiPatch } from '../../../src/utils/api.js';
import { ApiError } from '../../../src/types/result.js';
import {
  deleteAllMemories,
  deleteConversation,
  deleteFact,
  deletePerson,
  editFact,
  exportFilename,
  exportMemories,
  getConversation,
  listConversations,
  listMemories,
} from '../../../src/services/memory-control.service.js';

const mockGet = vi.mocked(apiGet);
const mockPatch = vi.mocked(apiPatch);
const mockDelete = vi.mocked(apiDelete);

const FACT = {
  id: 'f1',
  text: 'Loves hiking',
  category: 'interests',
  confidence: 0.9,
  sourceConversationIds: ['c1', 'c2'],
  userEdited: false,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('memory-control service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listMemories', () => {
    it('returns the unwrapped snapshot', async () => {
      mockGet.mockResolvedValue({
        ok: true,
        status: 200,
        data: { facts: [FACT], people: [], updatedAt: 'x' },
      });
      const result = await listMemories();
      expect(mockGet).toHaveBeenCalledWith('/api/memory/me');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.facts).toEqual([FACT]);
    });

    it('defaults missing arrays to empty', async () => {
      mockGet.mockResolvedValue({ ok: true, status: 200, data: {} });
      const result = await listMemories();
      expect(result.ok && result.value).toEqual({ facts: [], people: [], updatedAt: undefined });
    });

    it('turns a failed response into an ApiError with the status', async () => {
      mockGet.mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });
      const result = await listMemories();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ApiError);
        expect(result.error.message).toBe('Unauthorized');
        expect(result.error.status).toBe(401);
      }
    });

    it('treats an ok response without data as a failure', async () => {
      mockGet.mockResolvedValue({ ok: true, status: 204 });
      const result = await listMemories();
      expect(result.ok).toBe(false);
    });
  });

  it('editFact PATCHes the encoded fact id with the new text', async () => {
    mockPatch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...FACT, text: 'Loves trail running', userEdited: true },
    });
    const result = await editFact('f/1', { text: 'Loves trail running', category: 'interests' });
    expect(mockPatch).toHaveBeenCalledWith('/api/memory/me/facts/f%2F1', {
      text: 'Loves trail running',
      category: 'interests',
    });
    expect(result.ok && result.value.userEdited).toBe(true);
  });

  it('deleteFact and deletePerson DELETE their resources', async () => {
    mockDelete.mockResolvedValue({ ok: true, status: 200, data: { deleted: true } });
    expect((await deleteFact('f1')).ok).toBe(true);
    expect((await deletePerson('p1')).ok).toBe(true);
    expect(mockDelete).toHaveBeenNthCalledWith(1, '/api/memory/me/facts/f1');
    expect(mockDelete).toHaveBeenNthCalledWith(2, '/api/memory/me/people/p1');
  });

  it('deleteFact reports server errors', async () => {
    mockDelete.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const result = await deleteFact('f1');
    expect(!result.ok && result.error.status).toBe(500);
  });

  it('listConversations passes cursor and limit and normalizes the page', async () => {
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { conversations: [{ id: 'c1', startedAt: 'x', turnCount: 3 }], nextCursor: '' },
    });
    const result = await listConversations('abc', 10);
    expect(mockGet).toHaveBeenCalledWith('/api/memory/me/conversations', {
      limit: '10',
      cursor: 'abc',
    });
    expect(result.ok && result.value).toEqual({
      conversations: [{ id: 'c1', startedAt: 'x', turnCount: 3 }],
      nextCursor: undefined,
    });
  });

  it('getConversation returns turns of both roles', async () => {
    const turns = [
      { role: 'user', text: 'hi', timestamp: 't1' },
      { role: 'assistant', text: 'hello', timestamp: 't2' },
    ];
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { conversation: { id: 'c1', startedAt: 'x', turnCount: 2 }, turns },
    });
    const result = await getConversation('c1');
    expect(mockGet).toHaveBeenCalledWith('/api/memory/me/conversations/c1');
    expect(result.ok && result.value.turns).toEqual(turns);
  });

  it('deleteConversation returns the cascade counts', async () => {
    mockDelete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { deleted: { turns: 4, facts: 1, embeddings: 1 } },
    });
    const result = await deleteConversation('c1');
    expect(result.ok && result.value.deleted.facts).toBe(1);
  });

  describe('exportMemories', () => {
    it('downloads the file with the server filename', async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response('{"facts":[]}', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'content-disposition': 'attachment; filename="ferni-memories.json"',
            },
          })
      );
      vi.stubGlobal('fetch', fetchMock);
      const result = await exportMemories('json');
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/memory/me/export?format=json');
      expect(result.ok && result.value.filename).toBe('ferni-memories.json');
      if (result.ok) expect(await result.value.blob.text()).toBe('{"facts":[]}');
    });

    it('returns the JSON error message on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 }))
      );
      const result = await exportMemories('csv');
      expect(!result.ok && result.error.message).toBe('Not signed in');
    });

    it('returns an ApiError when the network fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(new Error('offline')))
      );
      const result = await exportMemories('csv');
      expect(!result.ok && result.error.status).toBe(0);
    });
  });

  it('exportFilename falls back to a dated name and respects zip archives', () => {
    expect(exportFilename(null, 'text/csv', 'csv')).toMatch(
      /^ferni-memories-\d{4}-\d{2}-\d{2}\.csv$/
    );
    expect(exportFilename(null, 'application/zip', 'csv')).toMatch(/\.zip$/);
    expect(exportFilename("attachment; filename*=UTF-8''my%20data.csv", null, 'csv')).toBe(
      'my data.csv'
    );
    expect(exportFilename('attachment; filename="../../evil.json"', null, 'json')).toBe(
      'evil.json'
    );
  });

  it('deleteAllMemories sends the typed confirmation in the body', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('{"deleted":true}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await deleteAllMemories();
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBe(JSON.stringify({ confirm: 'DELETE' }));
  });
});
