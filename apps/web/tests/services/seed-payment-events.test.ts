/**
 * Seed Fund payments reach the seeds economy.
 *
 * seeds-economy.service awards supporter bonuses on ferni:contribution-success and
 * ferni:subscription-paid, but nothing dispatched them, so paying never earned the bonus.
 * The real seed-payment service runs against a mocked /api/garden and card collector; the
 * real seeds economy (with the real cosmetics balance) is the listener.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeStub = vi.hoisted(() => ({ instance: { elements: vi.fn(), confirmPayment: vi.fn() } }));
vi.mock('../../src/services/monetization.service.js', () => ({
  loadStripe: vi.fn(async () => stripeStub.instance),
}));

const { payForSeed, startMonthlyGift, announceMonthlyGiftPaid } = await import(
  '../../src/services/seed-payment.js'
);
const { initSeedsEconomy, getBalance } = await import(
  '../../src/services/seeds-economy.service.js'
);

function mockGarden(status: number, body: unknown): void {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(body), { status })
  ) as typeof fetch;
}

const PLANT_OK = { success: true, clientSecret: 'cs_test' };

// The seeds economy has no teardown, so listen once per file and diff the balance per test.
initSeedsEconomy();

describe('Seed Fund payments -> seeds economy', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('a confirmed one-time gift awards the supporter bonus for its amount', async () => {
    mockGarden(200, PLANT_OK);
    const before = getBalance();

    const outcome = await payForSeed(10, async () => ({ status: 'confirmed' }));

    expect(outcome.status).toBe('confirmed');
    expect(getBalance()).toBeGreaterThan(before);
  });

  it('announces the gift in cents', async () => {
    mockGarden(200, PLANT_OK);
    const heard = vi.fn();
    document.addEventListener('ferni:contribution-success', heard);

    await payForSeed(25, async () => ({ status: 'confirmed' }));

    document.removeEventListener('ferni:contribution-success', heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0]![0] as CustomEvent).detail).toEqual({ amountCents: 2500 });
  });

  it('awards nothing when the person cancels or the card fails', async () => {
    mockGarden(200, PLANT_OK);
    const before = getBalance();

    await payForSeed(10, async () => ({ status: 'cancelled' }));
    await payForSeed(10, async () => ({ status: 'failed', reason: 'declined' }));

    expect(getBalance()).toBe(before);
  });

  it('awards nothing when the server could not create the payment', async () => {
    mockGarden(503, {});
    const before = getBalance();

    const outcome = await payForSeed(10, async () => ({ status: 'confirmed' }));

    expect(outcome.status).toBe('not-configured');
    expect(getBalance()).toBe(before);
  });
});

describe('monthly gift return from Stripe Checkout', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // jsdom: assigning location.href to the checkout url must not navigate
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://localhost/' },
      writable: true,
    });
  });

  async function startGift(dollars: number): Promise<void> {
    mockGarden(200, { success: true, checkoutUrl: 'https://checkout.stripe.test/s' });
    expect((await startMonthlyGift(dollars)).status).toBe('redirected');
  }

  it('a $10 gift pays the founding-member bonus when the person lands on /garden/success', async () => {
    await startGift(10);
    const before = getBalance();

    expect(announceMonthlyGiftPaid()).toBe('founding-member');

    expect(getBalance()).toBeGreaterThan(before);
  });

  it('a $20 gift is the founding-patron tier and pays more', async () => {
    await startGift(10);
    const beforeMember = getBalance();
    announceMonthlyGiftPaid();
    const member = getBalance() - beforeMember;

    await startGift(20);
    const beforePatron = getBalance();
    expect(announceMonthlyGiftPaid()).toBe('founding-patron');

    expect(getBalance() - beforePatron).toBeGreaterThan(member);
  });

  it('pays once: a reload of /garden/success does not pay again', async () => {
    await startGift(10);
    announceMonthlyGiftPaid();
    const after = getBalance();

    expect(announceMonthlyGiftPaid()).toBeNull();

    expect(getBalance()).toBe(after);
  });

  it('opening /garden/success without having started a gift pays nothing', () => {
    const before = getBalance();

    expect(announceMonthlyGiftPaid()).toBeNull();

    expect(getBalance()).toBe(before);
  });

  it('gifts under $10 have no founding tier', async () => {
    await startGift(5);
    const before = getBalance();

    expect(announceMonthlyGiftPaid()).toBeNull();

    expect(getBalance()).toBe(before);
  });

  it('a stored amount that is not a real number pays nothing', () => {
    sessionStorage.setItem('ferni_monthly_gift_dollars', 'Infinity');
    const before = getBalance();

    expect(announceMonthlyGiftPaid()).toBeNull();

    expect(getBalance()).toBe(before);
  });
});
