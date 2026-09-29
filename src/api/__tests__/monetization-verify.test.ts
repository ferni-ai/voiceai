/**
 * Monetization payment verification route tests
 *
 * GET /api/monetization/{tip|fund|value}/verify?payment_intent=pi_...
 * Used by the web payment-complete page after a Stripe redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyPayment = vi.fn();
const mockIsStripeConfigured = vi.fn(() => true);

vi.mock('../../services/stripe-payments.js', () => ({
  createPaymentIntent: vi.fn(),
  getUserMonetizationData: vi.fn(),
  handlePaymentSucceeded: vi.fn(),
  isStripeConfigured: () => mockIsStripeConfigured(),
  verifyPayment: (...args: unknown[]) => mockVerifyPayment(...args),
}));

vi.mock('../../services/monetization/persistence.js', () => ({
  celebrateJourneyMilestone: vi.fn(),
  createUserJourney: vi.fn(),
  getUserJourney: vi.fn(),
  initMonetizationPersistence: vi.fn(),
  recordJourneyConversation: vi.fn(),
  recordJourneyGoal: vi.fn(),
}));

vi.mock('../../services/monetization/b2b-licensing.js', () => ({ b2bLicensing: {} }));
vi.mock('../../services/monetization/contextual-partnerships.js', () => ({
  contextualPartnerships: {},
}));
vi.mock('../../services/monetization/ferni-fund.js', () => ({ ferniFund: {} }));
vi.mock('../../services/monetization/tip-jar.js', () => ({ tipJar: {} }));
vi.mock('../../services/monetization/value-capture.js', () => ({ valueCapture: {} }));
vi.mock('../../services/monetization/journey.js', () => ({
  checkNewMilestones: vi.fn(),
  getCurrentSeason: vi.fn(),
  JOURNEY_MILESTONES: [],
}));

import { handleMonetizationRequest } from '../monetization-routes.js';

function verify(
  type: string,
  query: Record<string, string>,
  auth: { authUserId?: string; isAdmin?: boolean } = {}
) {
  return handleMonetizationRequest({
    method: 'GET',
    pathname: `/api/monetization/${type}/verify`,
    query,
    headers: {},
    ...auth,
  });
}

describe('GET /api/monetization/:type/verify', () => {
  beforeEach(() => {
    mockVerifyPayment.mockReset();
    mockIsStripeConfigured.mockReturnValue(true);
  });

  it.each(['tip', 'fund', 'value'])('is routed for %s', async (type) => {
    mockVerifyPayment.mockResolvedValue({
      succeeded: true,
      amountCents: 500,
      type,
      userId: 'alice',
    });
    const res = await verify(type, { payment_intent: 'pi_123' }, { authUserId: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type, amountCents: 500 });
    expect(mockVerifyPayment).toHaveBeenCalledWith('pi_123');
  });

  it('requires authentication', async () => {
    const res = await verify('tip', { payment_intent: 'pi_123' });
    expect(res.status).toBe(401);
    expect(mockVerifyPayment).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed payment_intent', async () => {
    expect((await verify('tip', {}, { authUserId: 'alice' })).status).toBe(400);
    expect(
      (await verify('tip', { payment_intent: '../secret' }, { authUserId: 'alice' })).status
    ).toBe(400);
    expect(mockVerifyPayment).not.toHaveBeenCalled();
  });

  it("does not reveal another user's payment", async () => {
    mockVerifyPayment.mockResolvedValue({
      succeeded: true,
      amountCents: 500,
      type: 'tip',
      userId: 'bob',
    });
    const res = await verify('tip', { payment_intent: 'pi_123' }, { authUserId: 'alice' });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });

  it('lets an admin verify any payment', async () => {
    mockVerifyPayment.mockResolvedValue({
      succeeded: true,
      amountCents: 500,
      type: 'tip',
      userId: 'bob',
    });
    const res = await verify(
      'tip',
      { payment_intent: 'pi_123' },
      { authUserId: 'admin', isAdmin: true }
    );
    expect(res.status).toBe(200);
  });

  it('returns a friendly message when the payment is not complete', async () => {
    mockVerifyPayment.mockResolvedValue({
      succeeded: false,
      amountCents: 500,
      type: 'tip',
      userId: 'alice',
    });
    const res = await verify('tip', { payment_intent: 'pi_123' }, { authUserId: 'alice' });
    expect(res.status).toBe(200);
    const body = res.body as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('returns 503 with a message when Stripe is not configured', async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    const res = await verify('tip', { payment_intent: 'pi_123' }, { authUserId: 'alice' });
    expect(res.status).toBe(503);
    expect((res.body as { message: string }).message).toBeTruthy();
  });

  it('returns 500 with a message when Stripe errors', async () => {
    mockVerifyPayment.mockRejectedValue(new Error('No such payment_intent'));
    const res = await verify('tip', { payment_intent: 'pi_123' }, { authUserId: 'alice' });
    expect(res.status).toBe(500);
    expect((res.body as { message: string }).message).toBeTruthy();
  });
});
