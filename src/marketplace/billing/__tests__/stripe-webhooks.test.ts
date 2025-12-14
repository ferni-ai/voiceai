/**
 * Stripe Webhook Integration Tests
 *
 * Tests the Stripe webhook handlers for marketplace purchases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock Firestore
const mockFirestoreSet = vi.fn().mockResolvedValue(undefined);
const mockFirestoreGet = vi.fn();
const mockFirestoreDoc = vi.fn(() => ({
  set: mockFirestoreSet,
  get: mockFirestoreGet,
}));
const mockFirestoreWhere = vi.fn(() => ({
  limit: vi.fn(() => ({
    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  })),
}));
const mockFirestoreCollection = vi.fn(() => ({
  doc: mockFirestoreDoc,
  where: mockFirestoreWhere,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: mockFirestoreCollection,
  }),
}));

// Mock marketplace billing
vi.mock('../index.js', () => ({
  recordUsage: vi.fn(),
  calculateRevenueShare: vi.fn(),
  markPayoutComplete: vi.fn(),
}));

// Mock marketplace registry
vi.mock('../../index.js', () => ({
  installItem: vi.fn().mockResolvedValue({ id: 'inst_123' }),
  uninstallItem: vi.fn().mockResolvedValue(undefined),
  listInstallations: vi.fn().mockReturnValue([]),
}));

// Mock Stripe - must be a class constructor
const mockStripeInstance = {
  webhooks: {
    constructEvent: vi.fn((payload: string) => {
      return JSON.parse(payload);
    }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      }),
    },
  },
  transfers: {
    create: vi.fn().mockResolvedValue({
      id: 'tr_test_123',
    }),
  },
};

vi.mock('stripe', () => {
  // Create a class that returns the mock instance
  const MockStripe = function () {
    return mockStripeInstance;
  };
  return { default: MockStripe };
});

// Set up environment before importing module
process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
process.env.STRIPE_WEBHOOK_SECRET_MARKETPLACE = 'whsec_test_xxx';

import {
  handleWebhookEvent,
  verifyWebhookSignature,
  isStripeConfigured,
  createMarketplaceCheckout,
  createPublisherPayout,
} from '../stripe-webhooks.js';
import { recordUsage, calculateRevenueShare, markPayoutComplete } from '../index.js';
import { installItem } from '../../index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockCheckoutSession(overrides = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    object: 'checkout.session',
    amount_total: 999,
    currency: 'usd',
    created: Math.floor(Date.now() / 1000),
    payment_intent: 'pi_test_123',
    subscription: null,
    metadata: {
      marketplace_item_id: 'tool_weather',
      marketplace_item_type: 'tool',
      marketplace_purchase_type: 'one-time',
      ferni_user_id: 'user_123',
      publisher_id: 'pub_test',
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function createMockInvoice(overrides = {}): Stripe.Invoice {
  return {
    id: 'in_test_123',
    object: 'invoice',
    amount_paid: 499,
    metadata: {
      marketplace_item_id: 'tool_weather',
      ferni_user_id: 'user_123',
      publisher_id: 'pub_test',
      billing_type: 'subscription',
    },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

function createMockPayout(overrides = {}): Stripe.Payout {
  return {
    id: 'po_test_123',
    object: 'payout',
    amount: 5000,
    created: Math.floor(Date.now() / 1000),
    metadata: {
      publisher_id: 'pub_test',
      period: '2025-12',
    },
    ...overrides,
  } as unknown as Stripe.Payout;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Stripe Webhook Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should report Stripe as configured when env vars are set', () => {
      expect(isStripeConfigured()).toBe(true);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify and parse webhook payload', () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: { object: createMockCheckoutSession() },
      };
      const payload = JSON.stringify(mockEvent);
      const signature = 'test_signature';

      const event = verifyWebhookSignature(payload, signature);

      expect(event.type).toBe('checkout.session.completed');
    });
  });

  describe('checkout.session.completed Handler', () => {
    it('should process completed checkout and save purchase', async () => {
      const session = createMockCheckoutSession();
      const event: Stripe.Event = {
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: { object: session },
      } as unknown as Stripe.Event;

      await handleWebhookEvent(event);

      // Verify purchase was saved to Firestore
      expect(mockFirestoreCollection).toHaveBeenCalledWith('marketplace_purchases');
      expect(mockFirestoreSet).toHaveBeenCalled();

      // Verify revenue share was calculated
      expect(calculateRevenueShare).toHaveBeenCalledWith(
        'tool_weather',
        'pub_test',
        expect.any(String),
        999
      );

      // Verify item access was granted
      expect(installItem).toHaveBeenCalledWith({
        itemType: 'tool',
        itemId: 'tool_weather',
        userId: 'user_123',
        permissions: [],
      });
    });

    it('should skip if metadata is missing', async () => {
      const session = createMockCheckoutSession({ metadata: {} });
      const event: Stripe.Event = {
        id: 'evt_test_124',
        type: 'checkout.session.completed',
        data: { object: session },
      } as unknown as Stripe.Event;

      await handleWebhookEvent(event);

      // No purchase should be saved
      expect(mockFirestoreSet).not.toHaveBeenCalled();
    });
  });

  describe('invoice.paid Handler', () => {
    it('should process paid invoice and calculate revenue share', async () => {
      const invoice = createMockInvoice();
      const event: Stripe.Event = {
        id: 'evt_test_125',
        type: 'invoice.paid',
        data: { object: invoice },
      } as unknown as Stripe.Event;

      await handleWebhookEvent(event);

      // Verify revenue share was calculated
      expect(calculateRevenueShare).toHaveBeenCalledWith(
        'tool_weather',
        'pub_test',
        expect.any(String),
        499
      );
    });

    it('should record usage for usage-based billing', async () => {
      const invoice = createMockInvoice({
        metadata: {
          marketplace_item_id: 'tool_api',
          ferni_user_id: 'user_456',
          publisher_id: 'pub_api',
          billing_type: 'usage',
        },
      });
      const event: Stripe.Event = {
        id: 'evt_test_126',
        type: 'invoice.paid',
        data: { object: invoice },
      } as unknown as Stripe.Event;

      await handleWebhookEvent(event);

      expect(recordUsage).toHaveBeenCalled();
    });
  });

  describe('payout.paid Handler', () => {
    it('should process completed payout and save record', async () => {
      const payout = createMockPayout();
      const event: Stripe.Event = {
        id: 'evt_test_127',
        type: 'payout.paid',
        data: { object: payout },
      } as unknown as Stripe.Event;

      await handleWebhookEvent(event);

      // Verify payout was marked complete
      expect(markPayoutComplete).toHaveBeenCalledWith('pub_test:2025-12');

      // Verify payout record was saved
      expect(mockFirestoreCollection).toHaveBeenCalledWith('marketplace_payouts');
      expect(mockFirestoreSet).toHaveBeenCalled();
    });
  });

  describe('Checkout Session Creation', () => {
    it('should create a checkout session for one-time purchase', async () => {
      const result = await createMarketplaceCheckout({
        userId: 'user_123' as any,
        itemId: 'tool_weather' as any,
        itemType: 'tool',
        itemName: 'Weather Tool',
        publisherId: 'pub_test',
        priceInCents: 999,
        purchaseType: 'one-time',
        successUrl: 'https://app.ferni.ai/success',
        cancelUrl: 'https://app.ferni.ai/cancel',
      });

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.url).toBe('https://checkout.stripe.com/test');
    });
  });

  describe('Publisher Payout', () => {
    it('should create a transfer to publisher', async () => {
      const result = await createPublisherPayout({
        publisherId: 'pub_test',
        stripeConnectAccountId: 'acct_test_123',
        amountCents: 5000,
        period: '2025-12',
      });

      expect(result.transferId).toBe('tr_test_123');
    });
  });
});
