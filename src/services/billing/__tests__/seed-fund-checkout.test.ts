/**
 * A monthly Seed Fund gift bills the amount the person chose, and stays a gift.
 *
 * Gifts went through the Friend plan's checkout: billed at the plan price whatever was
 * chosen, and with ferni_user_id + tier on the subscription, so the plan webhooks made the
 * giver a Friend subscriber and cancelling the gift downgraded their plan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = vi.hoisted(() => ({
  create: vi.fn(async (_params: Record<string, any>) => ({
    id: 'cs_1',
    url: 'https://checkout.stripe.test/cs_1',
  })),
}));
vi.mock('../stripe-subscription.js', () => ({
  getStripe: async () => ({ checkout: { sessions: { create: stripe.create } } }),
  getOrCreateCustomer: async () => 'cus_1',
}));

const { createSeedFundCheckout, monthlyGiftCents } = await import('../seed-fund-checkout.js');

beforeEach(() => stripe.create.mockClear());

describe('monthlyGiftCents', () => {
  it('accepts $5 to $1000 as whole cents and refuses the rest', () => {
    expect(monthlyGiftCents(5)).toBe(500);
    expect(monthlyGiftCents(20)).toBe(2000);
    expect(monthlyGiftCents(12.5)).toBe(1250);
    expect(monthlyGiftCents(1000)).toBe(100000);
    for (const bad of [4.99, 0, -5, 1000.01, Number.NaN, Infinity, '20', null, undefined]) {
      expect(monthlyGiftCents(bad)).toBeNull();
    }
  });
});

describe('createSeedFundCheckout', () => {
  it('bills the chosen amount monthly, marked as a gift and not as a plan', async () => {
    await createSeedFundCheckout({
      userId: 'u1',
      seedsUid: 'u1',
      amountCents: 2000,
      successUrl: 'https://ferni.ai/garden/success',
      cancelUrl: 'https://ferni.ai/garden/cancel',
    });

    const params = stripe.create.mock.calls[0]![0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([
      expect.objectContaining({
        quantity: 1,
        price_data: expect.objectContaining({
          currency: 'usd',
          unit_amount: 2000,
          recurring: { interval: 'month' },
        }),
      }),
    ]);
    expect(params.line_items[0]).not.toHaveProperty('price');
    for (const metadata of [params.metadata, params.subscription_data.metadata]) {
      expect(metadata).toEqual({ garden_type: 'monthly', seeds_uid: 'u1' });
    }
    expect(params.success_url).toBe(
      'https://ferni.ai/garden/success?session_id={CHECKOUT_SESSION_ID}'
    );
  });

  it('an unverified caller gets no seeds_uid (no founding bonus)', async () => {
    await createSeedFundCheckout({
      userId: 'device-1',
      amountCents: 500,
      successUrl: 's',
      cancelUrl: 'c',
    });
    const params = stripe.create.mock.calls[0]![0];
    expect(params.subscription_data.metadata).toEqual({ garden_type: 'monthly' });
  });
});
