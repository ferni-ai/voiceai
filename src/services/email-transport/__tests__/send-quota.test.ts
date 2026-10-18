import { describe, expect, it } from 'vitest';
import { createDailySendQuota } from '../send-quota.js';

const T0 = Date.parse('2026-10-18T22:00:00Z');

function quota(limit: number) {
  let clock = T0;
  return { q: createDailySendQuota(limit, () => clock), advance: (ms: number) => (clock += ms) };
}

describe('createDailySendQuota', () => {
  it('allows sends until the limit, then names the limit', () => {
    const { q } = quota(2);
    expect(q.blockedReason()).toBeNull();
    q.record();
    expect(q.blockedReason()).toBeNull();
    q.record();
    expect(q.blockedReason()).toBe('daily send limit reached (2/2 today)');
    expect(q.sentToday()).toBe(2);
  });

  it('starts counting again on the next UTC day', () => {
    const { q, advance } = quota(1);
    q.record();
    expect(q.blockedReason()).not.toBeNull();
    advance(2 * 3600_000); // 00:00 UTC passes
    expect(q.blockedReason()).toBeNull();
    expect(q.sentToday()).toBe(0);
  });

  it('holds sends until the time Gmail gave, then lets them go', () => {
    const { q, advance } = quota(100);
    q.blockUntil(T0 + 3600_000);
    expect(q.blockedReason()).toBe('gmail asked us to wait until 2026-10-18T23:00:00.000Z');
    advance(3600_000);
    expect(q.blockedReason()).toBeNull();
  });

  it('keeps the later of two holds', () => {
    const { q, advance } = quota(100);
    q.blockUntil(T0 + 7200_000);
    q.blockUntil(T0 + 60_000);
    advance(120_000);
    expect(q.blockedReason()).toMatch(/wait until/);
  });
});
