/**
 * Sensitive memory service: paths, bodies, and Result unwrapping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiDelete, apiGet, apiPatch, apiPut } from '../../../src/utils/api.js';
import {
  answerConsent,
  deleteCategoryData,
  deleteHealthItem,
  deleteMoodEntry,
  editHealthItem,
  getConsent,
  getHealth,
  getMood,
  setCategory,
} from '../../../src/services/sensitive-memory.service.js';

const okRes = <T>(data: T) => ({ ok: true, data, status: 200 });
const failRes = (status = 500) => ({ ok: false, error: 'boom', status });

beforeEach(() => vi.clearAllMocks());

describe('sensitive memory service', () => {
  it('reads consent and turns failures into ApiErrors', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce(okRes({ consent: { answeredAt: null } }) as never);
    const r = await getConsent();
    expect(r.ok).toBe(true);
    expect(apiGet).toHaveBeenCalledWith('/api/memory/me/consent');

    vi.mocked(apiGet).mockResolvedValueOnce(failRes(503) as never);
    const bad = await getConsent();
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.status).toBe(503);
  });

  it('sends the upfront answer and per-category switches', async () => {
    vi.mocked(apiPut).mockResolvedValue(okRes({}) as never);
    await answerConsent(true);
    expect(apiPut).toHaveBeenLastCalledWith('/api/memory/me/consent', { agreeAll: true });
    await setCategory('finances', false);
    expect(apiPut).toHaveBeenLastCalledWith('/api/memory/me/consent', {
      categories: { finances: false },
    });
  });

  it('deletes a category, a health item and a mood entry with encoded ids', async () => {
    vi.mocked(apiDelete).mockResolvedValue(okRes({ deleted: 1 }) as never);
    await deleteCategoryData('health');
    expect(apiDelete).toHaveBeenLastCalledWith('/api/memory/me/consent/health/data');
    await deleteHealthItem('health_abc');
    expect(apiDelete).toHaveBeenLastCalledWith('/api/memory/me/health/health_abc');
    await deleteMoodEntry('sess/1');
    expect(apiDelete).toHaveBeenLastCalledWith('/api/memory/me/mood/sess%2F1');
  });

  it('unwraps the edited health item and normalizes lists', async () => {
    vi.mocked(apiPatch).mockResolvedValueOnce(okRes({ item: { id: 'h1', text: 'x' } }) as never);
    const edited = await editHealthItem('h1', { text: 'x' });
    expect(edited.ok && edited.value).toEqual({ id: 'h1', text: 'x' });

    vi.mocked(apiGet).mockResolvedValueOnce(okRes({ enabled: true, items: null }) as never);
    const health = await getHealth();
    expect(health.ok && health.value.items).toEqual([]);

    vi.mocked(apiGet).mockResolvedValueOnce(okRes({ enabled: false, insight: null }) as never);
    const mood = await getMood();
    expect(mood.ok && mood.value.timeline).toEqual([]);
  });
});
