/**
 * Finance memory service: paths, bodies, and Result unwrapping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiDelete, apiGet, apiPatch } from '../../../src/utils/api.js';
import {
  deleteFinanceItem,
  editFinanceItem,
  getFinances,
} from '../../../src/services/finance-memory.service.js';

const okRes = <T>(data: T) => ({ ok: true, data, status: 200 });
const failRes = (status = 500) => ({ ok: false, error: 'boom', status });

beforeEach(() => vi.clearAllMocks());

describe('finance memory service', () => {
  it('lists money notes, defaulting items to an empty list', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(okRes({ enabled: true, updatedAt: null }) as never);
    const r = await getFinances();
    expect(apiGet).toHaveBeenCalledWith('/api/memory/me/finances');
    expect(r.ok && r.value.items).toEqual([]);

    vi.mocked(apiGet).mockResolvedValueOnce(failRes(503) as never);
    const bad = await getFinances();
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.status).toBe(503);
  });

  it('edits and forgets by id (encoded)', async () => {
    vi.mocked(apiPatch).mockResolvedValueOnce(okRes({ item: { id: 'fin_1', text: 'x' } }) as never);
    const edited = await editFinanceItem('fin_1', { amount: null });
    expect(apiPatch).toHaveBeenCalledWith('/api/memory/me/finances/fin_1', { amount: null });
    expect(edited.ok && edited.value.id).toBe('fin_1');

    vi.mocked(apiDelete).mockResolvedValueOnce(okRes({ deleted: true }) as never);
    const del = await deleteFinanceItem('a/b');
    expect(apiDelete).toHaveBeenCalledWith('/api/memory/me/finances/a%2Fb');
    expect(del.ok).toBe(true);
  });
});
