/**
 * Work & places service: paths, Result unwrapping, defensive defaults.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiDelete, apiGet, apiPatch, apiPost } from '../../../src/utils/api.js';
import {
  addLifeItem,
  deleteLifeItem,
  editLifeItem,
  listLifeArea,
} from '../../../src/services/work-places.service.js';

const ITEM = { id: 'work_1', area: 'work', kind: 'job', title: 'Acme', status: 'current' };

describe('work-places service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists an area and defaults missing arrays', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { items: [ITEM] },
    } as never);
    const r = await listLifeArea('work');
    expect(apiGet).toHaveBeenCalledWith('/api/memory/me/work');
    expect(r.ok && r.value).toEqual({ items: [ITEM], colleagues: [], updatedAt: undefined });
  });

  it('turns failures into ApiErrors with a human message', async () => {
    vi.mocked(apiGet).mockResolvedValue({ ok: false, status: 503 } as never);
    const r = await listLifeArea('places');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe("Couldn't load your places");
      expect(r.error.status).toBe(503);
    }
  });

  it('adds, edits and deletes against the right paths', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true, status: 201, data: { item: ITEM } } as never);
    vi.mocked(apiPatch).mockResolvedValue({ ok: true, status: 200, data: { item: ITEM } } as never);
    vi.mocked(apiDelete).mockResolvedValue({
      ok: true,
      status: 200,
      data: { deleted: true },
    } as never);
    expect((await addLifeItem('work', { kind: 'job', title: 'Acme' })).ok).toBe(true);
    expect(apiPost).toHaveBeenCalledWith('/api/memory/me/work', { kind: 'job', title: 'Acme' });
    await editLifeItem('places', 'place_1', { notes: null });
    expect(apiPatch).toHaveBeenCalledWith('/api/memory/me/places/place_1', { notes: null });
    await deleteLifeItem('places', 'a/b');
    expect(apiDelete).toHaveBeenCalledWith('/api/memory/me/places/a%2Fb');
  });
});
