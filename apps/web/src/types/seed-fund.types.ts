/**
 * Seed Fund Types (Frontend)
 *
 * Types for the Ferni Seed Fund community contribution system.
 * Mirrored from src/types/seed-fund.types.ts for frontend use.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type GardenerStatus = 'seedling' | 'gardener' | 'grove-keeper';
export type GardenHealth = 'thriving' | 'growing' | 'needs-water';

// =============================================================================
// SEED PAYMENT
// =============================================================================

export type SeedPaymentOutcome =
  /** Stripe accepted the payment and is navigating to the return URL. */
  | { status: 'confirmed' }
  /** Sent to Stripe Checkout (monthly gift). */
  | { status: 'redirected' }
  /** Payments aren't set up (server 503 or no Stripe key in this build); nothing was charged. */
  | { status: 'not-configured' }
  /** The user closed the card form; nothing was charged. */
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/** The parts of Stripe.js the seed card form uses. */
export interface StripePaymentElement {
  mount(target: HTMLElement): void;
  destroy(): void;
}
export interface StripeElements {
  create(type: 'payment'): StripePaymentElement;
}
export interface StripeForCard {
  elements(options: { clientSecret: string }): StripeElements;
  confirmPayment(options: {
    elements: StripeElements;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { message?: string } }>;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface GardenStatus {
  readonly monthlyGoal: number;
  readonly currentMonth: number;
  readonly percentFunded: number;
  readonly health: GardenHealth;
  readonly gardenersThisMonth: number;
  readonly seedsThisMonth: number;
  readonly monthlyGardeners: number;
  readonly lastUpdated: string;
}

export interface UserGarden {
  readonly userId: string;
  readonly totalSeeds: number;
  readonly status: GardenerStatus;
  readonly isMonthlyGardener: boolean;
  readonly monthlyAmount?: number;
  readonly stripeCustomerId?: string;
  readonly firstSeedDate?: string;
  readonly lastSeedDate?: string;
  readonly seedsThisMonth: number;
}

export interface PlantSeedResponse {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  checkoutUrl?: string;
  error?: string;
}

export interface SubscriptionResponse {
  success: boolean;
  checkoutUrl?: string;
  portalUrl?: string;
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getStatusDisplayName(status: GardenerStatus): string {
  switch (status) {
    case 'grove-keeper':
      return 'Grove Keeper';
    case 'gardener':
      return 'Gardener';
    case 'seedling':
      return 'Seedling';
  }
}

export function getHealthMessage(
  health: GardenHealth,
  gardenersCount: number,
  percentFunded: number
): string {
  switch (health) {
    case 'thriving':
      return `The garden is flourishing! Thanks to ${gardenersCount}+ gardeners, Ferni is free for everyone this month.`;
    case 'growing':
      return `We're ${Math.round(percentFunded)}% of the way there. Every seed helps keep Ferni free.`;
    case 'needs-water':
      return `The garden needs some love. Can you help keep Ferni free for everyone?`;
  }
}

