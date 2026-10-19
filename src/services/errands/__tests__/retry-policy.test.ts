import { describe, expect, it } from 'vitest';
import { isRetryable, RETRY_POLICY, retryDelayMs } from '../retry-policy.js';

describe('errand retry policy', () => {
  it('backs off by the factor and stops at maxAttempts', () => {
    const p = RETRY_POLICY.text;
    expect([1, 2, 3, 4].map((n) => retryDelayMs(p, n))).toEqual([null, 30_000, 60_000, null]);
  });

  it('never retries a dial on a timeout: the call may have gone out', () => {
    expect(isRetryable(RETRY_POLICY.call, 'timeout')).toBe(false);
    expect(isRetryable(RETRY_POLICY.call, 'rate_limited')).toBe(true);
    expect(isRetryable(RETRY_POLICY.calendar, 'timeout')).toBe(true);
    expect(isRetryable(RETRY_POLICY.text, 'invalid_number')).toBe(false);
  });

  it('every effect kind has a policy with at least one attempt', () => {
    for (const p of Object.values(RETRY_POLICY)) expect(p.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(Object.keys(RETRY_POLICY).sort()).toEqual(
      [
        'ask_owner',
        'calendar',
        'call',
        'cancel_call',
        'lookup_line_type',
        'notify_owner',
        'offer_text_instead',
        'release_hold',
        'reminder',
        'text',
      ].sort()
    );
  });
});
