/**
 * Monetization Service - Frontend
 *
 * Client-side service for Ferni's value-aligned monetization:
 * - Tip Jar - "Buy me a coffee"
 * - Value Capture - Share your wins
 * - Ferni Fund - Pay it forward
 *
 * Philosophy: These are invitations, not obligations.
 * Users contribute because they want to, not because they have to.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('Monetization');

// ============================================================================
// TYPES
// ============================================================================

export interface TipConfig {
  suggestedAmounts: number[];
  minimumAmount: number;
  maximumAmount: number;
  allowCustom: boolean;
}

export interface ValueEvent {
  id: string;
  type: string;
  estimatedValueCents?: number;
  suggestedContributionCents?: number;
}

export interface FundStatus {
  balanceCents: number;
  totalContributedCents: number;
  conversationsSponsored: number;
  totalContributors: number;
  conversationsRemaining: number;
}

export interface UserMonetizationData {
  totalTipsCents: number;
  tipCount: number;
  totalValueContributionsCents: number;
  valueEventCount: number;
  totalFundContributionsCents: number;
  fundContributionCount: number;
  totalContributionsCents: number;
}

// ============================================================================
// API CLIENT
// ============================================================================

const API_BASE = '/api/monetization';

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// TIP JAR
// ============================================================================

/**
 * Get tip jar configuration
 */
export async function getTipConfig(userId?: string): Promise<{
  config: TipConfig;
  stripeEnabled: boolean;
}> {
  const query = userId ? `?userId=${userId}` : '';
  return apiCall(`/tip/config${query}`);
}

/**
 * Create a tip payment
 */
export async function createTip(params: {
  userId: string;
  amountCents: number;
  message?: string;
}): Promise<{
  tipId: string;
  clientSecret: string;
  paymentIntentId: string;
}> {
  return apiCall('/tip', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Complete a tip payment
 */
export async function completeTip(paymentIntentId: string): Promise<{
  success: boolean;
  thankYouMessage?: string;
}> {
  return apiCall('/tip/complete', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId }),
  });
}

// ============================================================================
// VALUE CAPTURE
// ============================================================================

/**
 * Detect if a message indicates a value event
 */
export async function detectValue(params: {
  userId: string;
  message: string;
  conversationId?: string;
}): Promise<{
  detected: boolean;
  event?: ValueEvent;
  prompt?: string;
}> {
  return apiCall('/value/detect', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Create a value contribution payment
 */
export async function contributeValue(params: {
  userId: string;
  eventId: string;
  amountCents: number;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  return apiCall('/value/contribute', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============================================================================
// FERNI FUND
// ============================================================================

/**
 * Get Ferni Fund status
 */
export async function getFundStatus(): Promise<FundStatus> {
  return apiCall('/fund/status');
}

/**
 * Contribute to Ferni Fund
 */
export async function contributeFund(params: {
  userId: string;
  amountCents: number;
  message?: string;
  isRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'monthly';
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  impact: {
    conversationsSponsored: number;
    message: string;
  };
}> {
  return apiCall('/fund/contribute', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get contributor impact
 */
export async function getContributorImpact(userId: string): Promise<{
  totalContributedCents: number;
  conversationsSponsored: number;
  contributionCount: number;
}> {
  return apiCall(`/fund/impact?userId=${userId}`);
}

// ============================================================================
// USER DATA
// ============================================================================

/**
 * Get user's monetization summary
 */
export async function getUserMonetization(userId: string): Promise<UserMonetizationData> {
  return apiCall(`/user?userId=${userId}`);
}

// ============================================================================
// PARTNER RECOMMENDATIONS
// ============================================================================

/**
 * Get a contextual partner recommendation
 */
export async function getPartnerRecommendation(params: {
  message: string;
  conversationContext?: string;
  excludePartnerIds?: string[];
}): Promise<{
  hasRecommendation: boolean;
  partner?: {
    id: string;
    name: string;
    description: string;
    category: string;
  };
  introduction?: string;
  disclosure?: string;
}> {
  return apiCall('/partners/recommend', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Record a partner click
 */
export async function recordPartnerClick(params: {
  userId: string;
  partnerId: string;
  conversationId?: string;
  triggerContext?: string;
}): Promise<{
  referralId: string;
  affiliateUrl: string | null;
}> {
  return apiCall('/partners/click', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Record partner feedback
 */
export async function recordPartnerFeedback(
  partnerId: string,
  feedback: 'helpful' | 'not_helpful'
): Promise<void> {
  await apiCall('/partners/feedback', {
    method: 'POST',
    body: JSON.stringify({ partnerId, feedback }),
  });
}

// ============================================================================
// STRIPE INTEGRATION
// ============================================================================

let stripePromise: Promise<unknown> | null = null;

/**
 * Load Stripe.js
 */
export async function loadStripe(): Promise<unknown> {
  if (stripePromise) return stripePromise;

  stripePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => {
      const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!stripeKey) {
        log.warn('Stripe publishable key not configured');
        resolve(null);
        return;
      }
      // @ts-expect-error - Stripe is loaded globally
      resolve(window.Stripe(stripeKey));
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return stripePromise;
}

/**
 * Process a payment with Stripe Elements
 */
export async function processPayment(params: {
  clientSecret: string;
  paymentElement: unknown;
}): Promise<{ success: boolean; error?: string }> {
  const stripe = await loadStripe();
  if (!stripe) {
    return { success: false, error: 'Stripe not loaded' };
  }

  try {
    // @ts-expect-error - Stripe types
    const { error } = await stripe.confirmPayment({
      clientSecret: params.clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/payment/complete`,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ============================================================================
// PROMPTS & MESSAGING
// ============================================================================

/**
 * Get tip opportunity prompt (if appropriate)
 */
export function getTipPrompt(params: {
  conversationCount: number;
  lastTipOfferedConversation: number;
  conversationWasMeaningful: boolean;
}): string | null {
  const { conversationCount, lastTipOfferedConversation, conversationWasMeaningful } = params;

  // Only offer every 20+ conversations
  if (conversationCount - lastTipOfferedConversation < 20) return null;

  // Milestone prompt
  if (conversationCount > 0 && conversationCount % 50 === 0) {
    return `We've had ${conversationCount} conversations together. If any of them mattered, you can tip what they're worth. Or just keep talking - that's the real gift.`;
  }

  // Meaningful conversation (10% chance)
  if (conversationWasMeaningful && Math.random() < 0.1) {
    return 'That was a real conversation. If it meant something to you, you can support Ferni - but no pressure at all.';
  }

  return null;
}

/**
 * Format amount for display
 */
export function formatAmount(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const monetizationService = {
  // Tip Jar
  getTipConfig,
  createTip,
  completeTip,

  // Value Capture
  detectValue,
  contributeValue,

  // Ferni Fund
  getFundStatus,
  contributeFund,
  getContributorImpact,

  // User Data
  getUserMonetization,

  // Partners
  getPartnerRecommendation,
  recordPartnerClick,
  recordPartnerFeedback,

  // Stripe
  loadStripe,
  processPayment,

  // Utilities
  getTipPrompt,
  formatAmount,
};

export default monetizationService;
