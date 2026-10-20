/** Number abuse reaches ops the way other abuse does: an ops alert and a security event. */
import { describe, expect, it, vi } from 'vitest';

const opsAlert = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../platform/ops-alert.js', () => ({ opsAlert }));
vi.mock('../../platform/security-events.js', () => ({ recordSecurityEvent }));

const { alertNumberContention } = await import('../verification-text.js');

describe('alertNumberContention', () => {
  it('raises the ops alert and records a suspicious-activity security event', async () => {
    const a = { phoneLast4: '0100', distinctAccounts: 3, windowMs: 3_600_000 };
    alertNumberContention(a);
    await vi.waitFor(() => expect(recordSecurityEvent).toHaveBeenCalled());
    expect(opsAlert).toHaveBeenCalledWith(
      'abuse:verify_phone_number_contention',
      'verify_phone_number_contention',
      a
    );
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'suspicious_activity',
        action: 'verify_phone_number_contention',
        outcome: 'warning',
        details: a,
      })
    );
  });
});
