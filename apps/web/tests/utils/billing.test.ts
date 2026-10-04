/**
 * Stripe isn't configured in production: /subscription/portal and
 * /subscription/checkout answer 503 { error: 'Stripe is not configured' }.
 * The UI must say payments aren't set up, not invite a pointless retry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

import { billingErrorMessage, openBillingPortal } from '../../src/utils/billing.js';

describe('billing errors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tells the user payments are not set up when Stripe is unconfigured', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'Stripe is not configured' }), { status: 503 })
    ) as typeof fetch;

    const result = await openBillingPortal('uid-1');

    expect(result.success).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Payments aren't set up yet, so nothing was charged.");
  });

  it('keeps the retry wording for transient failures', () => {
    expect(billingErrorMessage(500)).toBe("Couldn't reach billing. Try again?");
    expect(billingErrorMessage(undefined)).toBe("Couldn't reach billing. Try again?");
  });
});
