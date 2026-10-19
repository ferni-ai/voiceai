/**
 * Recording an outreach that reached the person holds further outreach for 2 hours.
 *
 * recordOutreachAttempt suppressed re-contact only on status 'sent', which no
 * writer records: deliver-and-record.ts writes 'delivered' or 'failed'. So the
 * hold never applied. It now applies to 'sent' and 'delivered', and never to a
 * send that failed (nothing reached them).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const suppressOutreach = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../memory/redis-cache.js', () => ({ getRedisCache: () => ({ suppressOutreach }) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ add: async () => ({ id: 'attempt-1' }) }) }),
  Timestamp: { now: () => ({}) },
}));
vi.mock('../../data-layer/hooks/outreach-history-hooks.js', () => ({
  onOutreachAttemptChange: async () => undefined,
  onOutreachResponseChange: async () => undefined,
  onOutreachPreferenceChange: async () => undefined,
}));

const { recordOutreachAttempt } = await import('../outreach-history.js');

const attempt = (status: 'sent' | 'delivered' | 'failed' | 'pending') => ({
  type: 'thinking_of_you' as const,
  reason: 'r',
  channel: 'sms' as const,
  personaId: 'ferni',
  message: 'hey',
  status,
});

beforeEach(() => suppressOutreach.mockClear());

describe('recordOutreachAttempt re-contact hold', () => {
  it.each(['delivered', 'sent'] as const)(
    'holds outreach for 2 hours after a %s attempt',
    async (status) => {
      await recordOutreachAttempt('u1', attempt(status));
      expect(suppressOutreach).toHaveBeenCalledWith('u1', 'recent_outreach', 7200);
    }
  );

  it.each(['failed', 'pending'] as const)('does not hold after a %s attempt', async (status) => {
    await recordOutreachAttempt('u1', attempt(status));
    expect(suppressOutreach).not.toHaveBeenCalled();
  });
});
