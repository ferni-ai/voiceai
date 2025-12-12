/**
 * Seed Fund Types
 *
 * The Ferni Seed Fund is a community-funded model where contributions
 * ("seeds") keep Ferni free for everyone. When enough seeds are planted,
 * everyone benefits.
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Gardener status based on total contribution
 */
export type GardenerStatus = 'seedling' | 'gardener' | 'grove-keeper';

/**
 * Garden health state based on funding percentage
 */
export type GardenHealth = 'thriving' | 'growing' | 'needs-water';

/**
 * Contribution frequency
 */
export type ContributionType = 'one-time' | 'monthly';

// =============================================================================
// GARDEN STATUS (Public Fund State)
// =============================================================================

/**
 * Current state of Ferni's Garden (the community fund)
 * This is public data shown to all users
 */
export interface GardenStatus {
  /** Monthly goal in dollars (e.g., 3500) */
  readonly monthlyGoal: number;

  /** Amount raised this month in dollars */
  readonly currentMonth: number;

  /** Percentage funded (0-100+) */
  readonly percentFunded: number;

  /** Health state based on percentage */
  readonly health: GardenHealth;

  /** Total unique contributors this month */
  readonly gardenersThisMonth: number;

  /** Total seeds planted this month */
  readonly seedsThisMonth: number;

  /** Number of active monthly supporters */
  readonly monthlyGardeners: number;

  /** ISO timestamp of last update */
  readonly lastUpdated: string;
}

// =============================================================================
// USER GARDEN (Personal Contribution State)
// =============================================================================

/**
 * A user's personal garden - their contribution history
 */
export interface UserGarden {
  /** User's Firebase UID */
  readonly userId: string;

  /** Total seeds planted (lifetime) */
  readonly totalSeeds: number;

  /** Current gardener status */
  readonly status: GardenerStatus;

  /** Whether they have an active monthly contribution */
  readonly isMonthlyGardener: boolean;

  /** Monthly amount if recurring (in dollars) */
  readonly monthlyAmount?: number;

  /** Stripe customer ID for billing */
  readonly stripeCustomerId?: string;

  /** When they planted their first seed */
  readonly firstSeedDate?: string;

  /** When they planted their most recent seed */
  readonly lastSeedDate?: string;

  /** Seeds planted this month */
  readonly seedsThisMonth: number;
}

// =============================================================================
// SEEDS (Individual Contributions)
// =============================================================================

/**
 * A single contribution record
 */
export interface Seed {
  /** Unique seed ID */
  readonly id: string;

  /** User who planted this seed */
  readonly userId: string;

  /** Dollar amount */
  readonly amount: number;

  /** Seed count (1 seed = $1) */
  readonly seedCount: number;

  /** Whether this is from a recurring subscription */
  readonly isRecurring: boolean;

  /** Stripe payment intent ID */
  readonly stripePaymentId: string;

  /** When the seed was planted */
  readonly plantedAt: string;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Request to plant a one-time seed
 */
export interface PlantSeedRequest {
  /** Dollar amount to contribute */
  amount: number;

  /** Optional: convert to monthly after this payment */
  makeMonthly?: boolean;
}

/**
 * Response after planting a seed
 */
export interface PlantSeedResponse {
  /** Success status */
  success: boolean;

  /** Stripe client secret for completing payment via Stripe.js */
  clientSecret?: string;

  /** Stripe payment intent ID */
  paymentIntentId?: string;

  /** Stripe checkout URL (for redirect flow) */
  checkoutUrl?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Request to start monthly contribution
 */
export interface StartMonthlyRequest {
  /** Monthly amount in dollars */
  amount: number;
}

/**
 * Request to update monthly amount
 */
export interface UpdateMonthlyRequest {
  /** New monthly amount */
  newAmount: number;
}

/**
 * Response for subscription operations
 */
export interface SubscriptionResponse {
  success: boolean;
  checkoutUrl?: string;
  portalUrl?: string;
  error?: string;
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * State for the Garden widget component
 */
export interface GardenWidgetState {
  /** Current garden status (public data) */
  garden: GardenStatus | null;

  /** User's personal garden (if authenticated) */
  userGarden: UserGarden | null;

  /** Loading state */
  isLoading: boolean;

  /** Error message if any */
  error: string | null;

  /** Whether expanded view is shown */
  isExpanded: boolean;
}

/**
 * State for the Plant a Seed flow
 */
export interface PlantSeedFlowState {
  /** Current step in the flow */
  step: 'amount' | 'payment' | 'confirmation';

  /** Selected amount (or custom) */
  selectedAmount: number | null;

  /** Whether "make monthly" is checked */
  makeMonthly: boolean;

  /** Processing payment */
  isProcessing: boolean;

  /** Error during payment */
  error: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Suggested one-time amounts
 */
export const SUGGESTED_AMOUNTS = [3, 5, 10, 25] as const;

/**
 * Thresholds for gardener status
 */
export const STATUS_THRESHOLDS = {
  seedling: { min: 1, max: 10 },
  gardener: { min: 11, max: 49 },
  groveKeeper: { min: 50, max: Infinity },
} as const;

/**
 * Monthly thresholds for instant status
 */
export const MONTHLY_STATUS_THRESHOLDS = {
  gardener: 5, // $5+/month = Gardener
  groveKeeper: 25, // $25+/month = Grove Keeper
} as const;

/**
 * Garden health thresholds (percentage)
 */
export const HEALTH_THRESHOLDS = {
  thriving: 100,
  growing: 50,
  needsWater: 0,
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate gardener status from total seeds and monthly amount
 */
export function calculateGardenerStatus(
  totalSeeds: number,
  monthlyAmount?: number
): GardenerStatus {
  // Monthly supporters get instant status
  if (monthlyAmount) {
    if (monthlyAmount >= MONTHLY_STATUS_THRESHOLDS.groveKeeper) {
      return 'grove-keeper';
    }
    if (monthlyAmount >= MONTHLY_STATUS_THRESHOLDS.gardener) {
      return 'gardener';
    }
  }

  // Otherwise based on total seeds
  if (totalSeeds >= STATUS_THRESHOLDS.groveKeeper.min) {
    return 'grove-keeper';
  }
  if (totalSeeds >= STATUS_THRESHOLDS.gardener.min) {
    return 'gardener';
  }
  if (totalSeeds >= STATUS_THRESHOLDS.seedling.min) {
    return 'seedling';
  }

  // No contributions yet - not a gardener
  return 'seedling';
}

/**
 * Calculate garden health from funding percentage
 */
export function calculateGardenHealth(percentFunded: number): GardenHealth {
  if (percentFunded >= HEALTH_THRESHOLDS.thriving) {
    return 'thriving';
  }
  if (percentFunded >= HEALTH_THRESHOLDS.growing) {
    return 'growing';
  }
  return 'needs-water';
}

/**
 * Get display text for gardener status
 */
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

/**
 * Get message based on garden health
 */
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
