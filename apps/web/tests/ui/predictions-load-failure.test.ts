/**
 * Predictions: a failed load says it failed, and the badge counts the
 * predictions still waiting for an outcome.
 *
 * Before: loadPredictions turned a failed /api/predictions into an empty list,
 * so the panel showed the "no predictions yet" state, and the badge counted
 * resolved predictions as "ready".
 */

import { describe, expect, it, vi } from 'vitest';
import type { PredictionData } from '../../src/types/predictions.js';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/ui/better-than-human.ui.js', () => ({ playMicroExpression: vi.fn() }));

const { getPredictionsUI } = await import('../../src/ui/predictions.ui.js');
const { pendingPredictionCount } = await import('../../src/services/prediction-data.js');
const { t } = await import('../../src/i18n/index.js');

describe('Predictions load failure', () => {
  it('says the load failed instead of showing the empty state', async () => {
    localStorage.setItem('ferni_user_id', 'u1');
    apiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });

    getPredictionsUI().show();
    await new Promise((r) => setTimeout(r, 0));

    const text = document.getElementById('predictions-content')?.textContent ?? '';
    expect(apiGet).toHaveBeenCalledWith('/api/predictions', { userId: 'u1' });
    expect(text).toContain(t('predictions.loadFailed'));
    expect(text).not.toContain(t('predictions.ctaText'));
    localStorage.clear();
  });
});

describe('Predictions badge', () => {
  const at = '2026-10-05T12:00:00.000Z';
  const make = (id: string, status: PredictionData['status']): PredictionData => ({
    id,
    category: 'mood',
    question: 'Mood average (1-10)',
    userPrediction: 7,
    status,
    createdAt: at,
  });

  it('counts pending predictions, not resolved ones', () => {
    const predictions = [make('a', 'pending'), make('b', 'resolved'), make('c', 'resolved')];

    expect(pendingPredictionCount(predictions)).toBe(1);
  });
});
