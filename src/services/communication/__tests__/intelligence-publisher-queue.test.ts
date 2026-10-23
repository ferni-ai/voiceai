/**
 * intelligence_queue had a producer and no consumer (~31K pending docs, 2026-10-18).
 * Nothing is published unless INTELLIGENCE_QUEUE=on, and queued docs carry a
 * Timestamp expireAt that a TTL policy can delete them by.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const add = vi.hoisted(() => vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'q1' })));
vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({ collection: () => ({ add }) }),
}));
vi.mock('../../../memory/profile-store.js', () => ({ getProfileStore: async () => ({}) }));

const { publishIntelligenceEvent, QUEUE_RETENTION_MS } =
  await import('../intelligence-publisher.js');

const event = { type: 'key_moment' as const, userId: 'u1', sessionId: 's1', payload: {} };

afterEach(() => {
  vi.unstubAllEnvs();
  add.mockClear();
});

describe('intelligence publisher', () => {
  it('publishes nothing by default', async () => {
    await publishIntelligenceEvent(event);
    vi.stubEnv('INTELLIGENCE_QUEUE', 'off');
    await publishIntelligenceEvent(event);
    expect(add).not.toHaveBeenCalled();
  });

  it('with INTELLIGENCE_QUEUE=on, queues a pending doc that expires after the retention', async () => {
    vi.stubEnv('INTELLIGENCE_QUEUE', 'on');
    const before = Date.now();
    await publishIntelligenceEvent(event);
    expect(add).toHaveBeenCalledTimes(1);
    const doc = add.mock.calls[0]?.[0] as unknown as Record<string, unknown> & {
      expireAt: { toMillis(): number };
    };
    expect(doc).toMatchObject({ status: 'pending', type: 'key_moment', userId: 'u1' });
    expect(typeof doc.expireAt).not.toBe('string');
    const ms = doc.expireAt.toMillis();
    expect(ms).toBeGreaterThanOrEqual(before + QUEUE_RETENTION_MS);
    expect(ms).toBeLessThanOrEqual(Date.now() + QUEUE_RETENTION_MS);
  });
});
