/**
 * A saved wellbeing snapshot reaches the semantic index only with real scores.
 * persistSnapshot used to index a missing mood or energy as 0, so memory held
 * a made-up "Mood 0/10, Energy 0/10" for a call that never mentioned either.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WellbeingSnapshot } from '../index.js';

const indexed = vi.fn();
vi.mock('../../data-layer/hooks/index.js', () => ({
  onWellnessCheckinChange: (...a: unknown[]) => indexed(...a),
}));
const written = vi.fn(async () => undefined);
function ref(): Record<string, unknown> {
  const r: Record<string, unknown> = { set: written };
  for (const m of ['collection', 'doc']) r[m] = () => r;
  return r;
}
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => ref() }));

const { persistSnapshot, wellnessCheckinFor } = await import('../persistence.js');

function snap(dimensions: WellbeingSnapshot['dimensions']): WellbeingSnapshot {
  return {
    id: 'wb_call_s1',
    userId: 'u1',
    timestamp: new Date('2026-10-18T14:00:00Z'),
    source: 'inferred',
    dimensions,
    confidence: {},
  };
}

describe('wellbeing snapshot → semantic index', () => {
  beforeEach(() => {
    indexed.mockReset();
    written.mockClear();
  });

  it.each([
    ['only sleep', { sleepQuality: 0.2 }],
    ['mood without energy', { mood: 0.7 }],
    ['energy without mood', { energy: 0.3, worry: 0.8 }],
  ])('is saved but not indexed with %s', async (_label, dimensions) => {
    expect(await persistSnapshot('u1', snap(dimensions))).toBe(true);
    expect(written).toHaveBeenCalledTimes(1);
    expect(indexed).not.toHaveBeenCalled();
    expect(wellnessCheckinFor(snap(dimensions))).toBeNull();
  });

  it('is indexed with both scores on the 0-10 scale, and stress only when given', async () => {
    await persistSnapshot('u1', snap({ mood: 0.7, energy: 0.2 }));
    expect(indexed).toHaveBeenCalledTimes(1);
    const [, , checkin] = indexed.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(checkin).toMatchObject({ mood: 7, energy: 2, stressLevel: undefined });
  });
});
