/**
 * Stripe Subscription Types
 *
 * Minimal Stripe SDK shapes used by stripe-subscription.ts (stripe is an
 * optional dependency, so we don't import its types).
 */

// ============================================================================
// STRIPE TYPES (Minimal types for optional dependency)
// ============================================================================

/**
 * Minimal Stripe types for when the stripe package isn't installed.
 * These mirror the shapes we actually use from the Stripe SDK.
 */
export interface StripeCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  metadata: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  created: number;
  current_period_end: number;
  trial_end: number | null;
  metadata: Record<string, string>;
}

export interface StripeSubscriptionWithItems extends StripeSubscription {
  items: {
    data: Array<{
      price: {
        unit_amount: number | null;
        recurring?: { interval: string };
      };
    }>;
  };
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  subscription?: string;
  metadata?: Record<string, string>;
}

export interface StripeBillingPortalSession {
  url: string;
}

export interface StripeInvoice {
  id: string;
  customer: string;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice;
  };
}

export interface StripeClient {
  customers: {
    create: (params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }) => Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create: (params: Record<string, unknown>) => Promise<StripeCheckoutSession>;
    };
  };
  billingPortal: {
    sessions: {
      create: (params: {
        customer: string;
        return_url: string;
      }) => Promise<StripeBillingPortalSession>;
    };
  };
  subscriptions: {
    retrieve: (id: string) => Promise<StripeSubscription>;
    list: (params: {
      status?: string;
      limit?: number;
      expand?: string[];
    }) => AsyncIterable<StripeSubscriptionWithItems>;
  };
  webhooks: {
    constructEvent: (payload: string | Buffer, signature: string, secret: string) => StripeEvent;
  };
}

// Factory function type for dynamic loading
export type StripeFactory = (secretKey: string, options: Record<string, unknown>) => StripeClient;
