/**
 * Apple In-App Purchase Service - Frontend
 *
 * Client-side service for iOS in-app purchases using Capacitor.
 * Handles:
 * - StoreKit 2 product fetching
 * - Purchase flow
 * - Receipt verification
 * - Subscription status sync
 *
 * Philosophy: Seamless experience for iOS users.
 * Same Ferni, just through Apple's payment system.
 */

import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

const log = createLogger('AppleIAP');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Apple product IDs - must match App Store Connect
 */
export const APPLE_PRODUCT_IDS = {
  friend_monthly: 'com.ferni.friend.monthly',
  friend_annual: 'com.ferni.friend.annual',
  partner_monthly: 'com.ferni.partner.monthly',
  partner_annual: 'com.ferni.partner.annual',
} as const;

export type AppleProductId = (typeof APPLE_PRODUCT_IDS)[keyof typeof APPLE_PRODUCT_IDS];

/**
 * Product info from StoreKit
 */
export interface AppleProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceValue: number;
  currency: string;
  subscriptionPeriod?: string;
}

/**
 * Purchase result
 */
export interface PurchaseResult {
  success: boolean;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  error?: string;
}

/**
 * Subscription status from backend verification
 */
export interface SubscriptionStatus {
  tier: 'free' | 'friend' | 'partner';
  status: 'active' | 'canceled' | 'past_due' | 'expired';
  expiresDate?: string;
  provider: 'apple' | 'stripe' | 'none';
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

/**
 * Check if running on iOS (Capacitor native or PWA)
 */
export function isIOS(): boolean {
  // Check for Capacitor native iOS
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Capacitor?.getPlatform?.() === 'ios') {
      return true;
    }

    // Check for iOS browser (Safari on iOS)
    const userAgent = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(userAgent);
  }
  return false;
}

/**
 * Check if StoreKit is available (native iOS only)
 */
export function isStoreKitAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor?.getPlatform?.() === 'ios';
}

// ============================================================================
// STOREKIT INTEGRATION
// ============================================================================

// StoreKit plugin interface (will be provided by Capacitor plugin)
// Note: Method names match the actual @ferni/capacitor-purchases plugin
interface StoreKitPlugin {
  initialize?(): Promise<{ success: boolean; error?: string }>;
  getProducts(options: { productIds: string[] }): Promise<{ products: AppleProduct[] }>;
  purchase(options: { productId: string }): Promise<PurchaseResult>;
  restorePurchases(): Promise<{
    transactions: Array<{ productId: string; transactionId: string }>;
  }>;
  getActiveSubscriptions(): Promise<{
    subscriptions: Array<{ productId: string; expiresDate: string }>;
  }>;
}

let storeKitPlugin: StoreKitPlugin | null = null;

/**
 * Initialize StoreKit plugin
 * Call this on app start if on iOS
 */
export async function initStoreKit(): Promise<boolean> {
  if (!isStoreKitAvailable()) {
    log.debug('StoreKit not available (not native iOS)');
    return false;
  }

  try {
    // Dynamic import of Capacitor plugin
    const { FerniPurchases } = await import('@ferni/capacitor-purchases');
    storeKitPlugin = FerniPurchases;

    log.info('StoreKit initialized');
    return true;
  } catch (error) {
    log.warn('StoreKit plugin not available:', error);
    return false;
  }
}

// ============================================================================
// PRODUCT FETCHING
// ============================================================================

/**
 * Fetch available products from App Store
 */
export async function getProducts(): Promise<AppleProduct[]> {
  if (!storeKitPlugin) {
    log.debug('StoreKit not initialized');
    return [];
  }

  try {
    const productIds = Object.values(APPLE_PRODUCT_IDS);
    const result = await storeKitPlugin.getProducts({ productIds });

    log.debug('Fetched products:', result.products.length);
    return result.products;
  } catch (error) {
    log.error('Failed to fetch products:', error);
    return [];
  }
}

/**
 * Get product info for a specific tier
 */
export async function getProductForTier(
  tier: 'friend' | 'partner',
  annual = false
): Promise<AppleProduct | null> {
  const products = await getProducts();

  const productId = annual
    ? APPLE_PRODUCT_IDS[`${tier}_annual`]
    : APPLE_PRODUCT_IDS[`${tier}_monthly`];

  return products.find((p) => p.productId === productId) || null;
}

// ============================================================================
// PURCHASE FLOW
// ============================================================================

/**
 * Purchase a subscription
 *
 * @param productId - Apple product ID to purchase
 * @param userId - Ferni user ID to associate
 */
export async function purchase(productId: AppleProductId, userId: string): Promise<PurchaseResult> {
  if (!storeKitPlugin) {
    return {
      success: false,
      error: 'StoreKit not available',
    };
  }

  try {
    log.info('Starting purchase:', productId);

    // 1. Start purchase with StoreKit
    const result = await storeKitPlugin.purchase({ productId });

    if (!result.success) {
      return result;
    }

    // 2. Verify receipt with backend
    const verification = await verifyWithBackend(userId, result.transactionId!);

    if (!verification.success) {
      return {
        success: false,
        error: verification.error || 'Verification failed',
      };
    }

    log.info('Purchase completed:', result.transactionId);
    return result;
  } catch (error) {
    log.error('Purchase failed:', error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Restore previous purchases
 */
export async function restorePurchases(userId: string): Promise<{
  success: boolean;
  restoredTier?: 'friend' | 'partner';
  error?: string;
}> {
  if (!storeKitPlugin) {
    return {
      success: false,
      error: 'StoreKit not available',
    };
  }

  try {
    log.info('Restoring purchases...');

    const result = await storeKitPlugin.restorePurchases();

    if (result.transactions.length === 0) {
      return {
        success: true,
        // No purchases to restore is still success
      };
    }

    // Verify each transaction with backend
    for (const tx of result.transactions) {
      await verifyWithBackend(userId, tx.transactionId);
    }

    // Get current status
    const status = await getSubscriptionStatus(userId);

    log.info('Restored tier:', status.tier);
    return {
      success: true,
      restoredTier: status.tier !== 'free' ? status.tier : undefined,
    };
  } catch (error) {
    log.error('Restore failed:', error);
    return {
      success: false,
      error: String(error),
    };
  }
}

// ============================================================================
// BACKEND COMMUNICATION
// ============================================================================

/**
 * Verify a transaction with our backend
 */
async function verifyWithBackend(
  userId: string,
  transactionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiPost<{ error?: string }>('/api/apple/verify', {
      userId,
      receiptData: transactionId, // In StoreKit 2, we send transaction ID
    });

    if (!response.ok) {
      return { success: false, error: response.error || 'Verification failed' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get subscription status from backend
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  try {
    // Try to get active subscription from StoreKit
    let transactionId: string | null = null;

    if (storeKitPlugin) {
      const subscriptions = await storeKitPlugin.getActiveSubscriptions();
      const firstSubscription = subscriptions.subscriptions[0];
      if (firstSubscription) {
        // Use the first active subscription
        transactionId = firstSubscription.productId;
      }
    }

    if (!transactionId) {
      // No Apple subscription, check Stripe
      return await checkStripeStatus(userId);
    }

    // Verify with backend
    const response = await apiGet<{ tier?: string; status?: string; expiresDate?: string }>(
      `/api/apple/status?userId=${userId}&transactionId=${transactionId}`
    );

    if (!response.ok || !response.data) {
      return await checkStripeStatus(userId);
    }

    return {
      tier: response.data.tier || 'free',
      status: response.data.status || 'active',
      expiresDate: response.data.expiresDate,
      provider: 'apple',
    };
  } catch (error) {
    log.error('Failed to get subscription status:', error);
    return {
      tier: 'free',
      status: 'expired',
      provider: 'none',
    };
  }
}

/**
 * Check Stripe subscription status
 */
async function checkStripeStatus(userId: string): Promise<SubscriptionStatus> {
  try {
    const response = await apiGet<{ tier?: string; status?: string; currentPeriodEnd?: string }>(
      `/api/subscription/status?userId=${userId}`
    );
    if (!response.ok || !response.data) {
      return { tier: 'free', status: 'expired', provider: 'none' };
    }

    return {
      tier: response.data.tier || 'free',
      status: response.data.status || 'active',
      expiresDate: response.data.currentPeriodEnd,
      provider: response.data.tier !== 'free' ? 'stripe' : 'none',
    };
  } catch {
    return { tier: 'free', status: 'expired', provider: 'none' };
  }
}

// ============================================================================
// CANCELLATION
// ============================================================================

/**
 * Get cancellation instructions
 * Apple doesn't allow in-app cancellation - must go through iOS Settings
 */
export async function getCancellationInstructions(): Promise<{
  title: string;
  steps: string[];
  note: string;
}> {
  try {
    const response = await apiGet<{ title: string; steps: string[]; note: string }>(
      '/api/apple/cancel-instructions'
    );
    if (!response.ok || !response.data) {
      throw new Error('Failed to fetch instructions');
    }
    return response.data;
  } catch {
    // Fallback instructions
    return {
      title: 'Cancel Your Subscription',
      steps: [
        'Open Settings on your iPhone or iPad',
        'Tap your name at the top',
        'Tap "Subscriptions"',
        'Find and tap "Ferni"',
        'Tap "Cancel Subscription"',
      ],
      note: "You'll keep access until your current period ends.",
    };
  }
}

/**
 * Open iOS subscription management
 * This opens the native iOS subscription manager
 */
export async function openSubscriptionManagement(): Promise<void> {
  if (isStoreKitAvailable()) {
    // On native iOS, open the subscription management URL
    const url = 'https://apps.apple.com/account/subscriptions';

    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else if (isIOS()) {
    // On iOS Safari, still try to open the URL
    window.open('https://apps.apple.com/account/subscriptions', '_blank');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const appleIAPService = {
  // Platform detection
  isIOS,
  isStoreKitAvailable,

  // Initialization
  initStoreKit,

  // Products
  getProducts,
  getProductForTier,
  productIds: APPLE_PRODUCT_IDS,

  // Purchases
  purchase,
  restorePurchases,

  // Status
  getSubscriptionStatus,

  // Cancellation
  getCancellationInstructions,
  openSubscriptionManagement,
};

export default appleIAPService;
