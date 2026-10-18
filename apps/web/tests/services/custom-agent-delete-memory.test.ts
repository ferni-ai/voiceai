/**
 * Deleting a journal entry from the Voice Journal panel names its type.
 *
 * deleteMemory used to send DELETE /memories/:id with no ?type=, which the
 * server refused with a 400, so a panel delete never deleted anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  getUserId: () => 'uid-1',
  getApiHeadersAsync: async () => ({ Authorization: 'Bearer t' }),
}));

const { deleteMemory } = await import('../../src/services/custom-agent.service.js');

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('deleteMemory', () => {
  it('sends the memory type when given', async () => {
    await deleteMemory('twin-1', 'mem_1', 'journalEntry');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/custom-agents/twin-1/memories/mem_1?type=journalEntry',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('leaves the type to the server when not given', async () => {
    await deleteMemory('twin-1', 'mem_1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/custom-agents/twin-1/memories/mem_1');
  });
});
