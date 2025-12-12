/**
 * Apple In-App Purchase Service
 *
 * Handles Apple App Store subscriptions and in-app purchases:
 * - Receipt verification with App Store Server API
 * - Subscription status sync
 * - App Store Server Notifications v2
 * - Grace period handling
 *
 * Philosophy: Apple users get the same Ferni experience.
 * We just verify through a different payment provider.
 */

import * as crypto from 'crypto';
import { getStore } from '../memory/store-factory.js';
import {
  createDefaultSubscription,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '../types/subscription.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'AppleIAP' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Apple product IDs mapped to our subscription tiers
 */
export const APPLE_PRODUCT_IDS = {
  friend_monthly: 'com.ferni.friend.monthly',
  friend_annual: 'com.ferni.friend.annual',
  partner_monthly: 'com.ferni.partner.monthly',
  partner_annual: 'com.ferni.partner.annual',
} as const;

/**
 * Reverse mapping: product ID → tier
 */
export const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [APPLE_PRODUCT_IDS.friend_monthly]: 'friend',
  [APPLE_PRODUCT_IDS.friend_annual]: 'friend',
  [APPLE_PRODUCT_IDS.partner_monthly]: 'partner',
  [APPLE_PRODUCT_IDS.partner_annual]: 'partner',
};

/**
 * Apple subscription status from App Store
 */
export type AppleSubscriptionStatus =
  | 'active'
  | 'expired'
  | 'in_billing_retry'
  | 'in_grace_period'
  | 'revoked';

/**
 * Apple notification type (App Store Server Notifications v2)
 */
export type AppleNotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_FAIL_TO_RENEW'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_CHANGE_RENEWAL_PREF'
  | 'OFFER_REDEEMED'
  | 'EXPIRED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'REFUND'
  | 'CONSUMPTION_REQUEST'
  | 'RENEWAL_EXTENDED'
  | 'REVOKE'
  | 'PRICE_INCREASE'
  | 'TEST';

/**
 * Decoded Apple transaction info
 */
export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: Date;
  expiresDate: Date;
  environment: 'Production' | 'Sandbox';
  isUpgraded: boolean;
  offerType?: number;
  offerIdentifier?: string;
}

/**
 * Decoded Apple renewal info
 */
export interface AppleRenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: 0 | 1;
  expirationIntent?: number;
  gracePeriodExpiresDate?: Date;
  isInBillingRetryPeriod?: boolean;
  priceIncreaseStatus?: number;
}

/**
 * App Store Server Notification payload
 */
export interface AppleNotificationPayload {
  notificationType: AppleNotificationType;
  subtype?: string;
  notificationUUID: string;
  data: {
    appAppleId?: number;
    bundleId: string;
    bundleVersion?: string;
    environment: 'Production' | 'Sandbox';
    signedTransactionInfo: string;
    signedRenewalInfo?: string;
  };
}

/**
 * Result of receipt verification
 */
export interface ReceiptVerificationResult {
  isValid: boolean;
  tier: SubscriptionTier;
  status: AppleSubscriptionStatus;
  expiresDate?: Date;
  originalTransactionId?: string;
  productId?: string;
  environment: 'Production' | 'Sandbox';
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const APPLE_CONFIG = {
  // App Store Connect credentials
  issuerId: process.env.APPLE_ISSUER_ID || '',
  keyId: process.env.APPLE_KEY_ID || '',
  bundleId: process.env.APPLE_BUNDLE_ID || 'com.ferni.app',

  // API endpoints
  productionUrl: 'https://api.storekit.itunes.apple.com',
  sandboxUrl: 'https://api.storekit-sandbox.itunes.apple.com',

  // Use sandbox for development
  useSandbox: process.env.NODE_ENV !== 'production',
};

/**
 * Check if Apple IAP is configured
 */
export function isAppleConfigured(): boolean {
  return Boolean(APPLE_CONFIG.issuerId && APPLE_CONFIG.keyId && process.env.APPLE_PRIVATE_KEY);
}

// ============================================================================
// JWT GENERATION (for App Store Server API)
// ============================================================================

/**
 * Base64URL encode (no padding)
 */
function base64urlEncode(data: Buffer | string): string {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buffer.toString('base64url');
}

/**
 * Generate JWT for App Store Server API authentication
 * Uses ES256 algorithm with Apple's private key
 */
async function generateAppleJWT(): Promise<string> {
  const privateKeyPem = process.env.APPLE_PRIVATE_KEY;
  if (!privateKeyPem) {
    throw new Error('APPLE_PRIVATE_KEY not configured');
  }

  // JWT header
  const header = {
    alg: 'ES256',
    kid: APPLE_CONFIG.keyId,
    typ: 'JWT',
  };

  // JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: APPLE_CONFIG.issuerId,
    iat: now,
    exp: now + 3600, // 1 hour
    aud: 'appstoreconnect-v1',
    bid: APPLE_CONFIG.bundleId,
  };

  // Encode header and payload
  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  // Sign with ES256 (ECDSA P-256 with SHA-256)
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();

  // Apple's private key is in PEM format
  const signature = sign.sign(
    {
      key: privateKeyPem.replace(/\\n/g, '\n'), // Handle escaped newlines from env
      dsaEncoding: 'ieee-p1363', // Required for JWT ES256 format
    },
    'base64url'
  );

  const jwt = `${signingInput}.${signature}`;

  log.debug('Generated Apple JWT for API authentication');
  return jwt;
}

// ============================================================================
// RECEIPT VERIFICATION
// ============================================================================

/**
 * Verify a receipt from the iOS app
 *
 * @param receiptData - Base64 encoded receipt from StoreKit
 * @param userId - Ferni user ID to associate with subscription
 */
export async function verifyReceipt(
  receiptData: string,
  userId: string
): Promise<ReceiptVerificationResult> {
  if (!isAppleConfigured()) {
    log.warn('Apple IAP not configured');
    return {
      isValid: false,
      tier: 'free',
      status: 'expired',
      environment: 'Sandbox',
      error: 'Apple IAP not configured',
    };
  }

  try {
    // For App Store Server API v2, we don't send the receipt directly
    // Instead, we use the transaction ID from StoreKit 2
    // The receipt contains the transaction info we need

    const jwt = await generateAppleJWT();
    const baseUrl = APPLE_CONFIG.useSandbox ? APPLE_CONFIG.sandboxUrl : APPLE_CONFIG.productionUrl;

    // This is a simplified flow - in production, use StoreKit 2's
    // transaction verification flow
    const response = await fetch(`${baseUrl}/inApps/v1/subscriptions/${APPLE_CONFIG.bundleId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Apple API error');
      return {
        isValid: false,
        tier: 'free',
        status: 'expired',
        environment: APPLE_CONFIG.useSandbox ? 'Sandbox' : 'Production',
        error: `Apple API error: ${response.status}`,
      };
    }

    const data = await response.json();
    return parseSubscriptionResponse(data);
  } catch (error) {
    log.error({ error: String(error) }, 'Receipt verification failed');
    return {
      isValid: false,
      tier: 'free',
      status: 'expired',
      environment: 'Sandbox',
      error: String(error),
    };
  }
}

/**
 * Get subscription status for a specific transaction
 */
export async function getSubscriptionStatus(
  originalTransactionId: string
): Promise<ReceiptVerificationResult> {
  if (!isAppleConfigured()) {
    return {
      isValid: false,
      tier: 'free',
      status: 'expired',
      environment: 'Sandbox',
      error: 'Apple IAP not configured',
    };
  }

  try {
    const jwt = await generateAppleJWT();
    const baseUrl = APPLE_CONFIG.useSandbox ? APPLE_CONFIG.sandboxUrl : APPLE_CONFIG.productionUrl;

    const response = await fetch(`${baseUrl}/inApps/v1/subscriptions/${originalTransactionId}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Apple API returned ${response.status}`);
    }

    const data = await response.json();
    return parseSubscriptionResponse(data);
  } catch (error) {
    log.error({ error: String(error), originalTransactionId }, 'Failed to get subscription status');
    return {
      isValid: false,
      tier: 'free',
      status: 'expired',
      environment: 'Sandbox',
      error: String(error),
    };
  }
}

/**
 * Parse Apple's subscription response into our format
 */
function parseSubscriptionResponse(data: unknown): ReceiptVerificationResult {
  // Type guard - in production, use proper validation
  const response = data as {
    environment?: string;
    data?: Array<{
      lastTransactions?: Array<{
        signedTransactionInfo?: string;
        signedRenewalInfo?: string;
        status?: number;
      }>;
    }>;
  };

  const environment = (response.environment === 'Production' ? 'Production' : 'Sandbox') as
    | 'Production'
    | 'Sandbox';

  // Find the most recent active subscription
  const subscriptionGroups = response.data || [];
  let bestSubscription: {
    productId: string;
    expiresDate: Date;
    originalTransactionId: string;
    status: AppleSubscriptionStatus;
  } | null = null;

  for (const group of subscriptionGroups) {
    for (const transaction of group.lastTransactions || []) {
      // In production, decode the signed transaction JWT
      // For now, use the status field
      const status = mapAppleStatus(transaction.status || 0);

      if (status === 'active' || status === 'in_grace_period') {
        // This is a valid subscription
        // TODO: Decode signedTransactionInfo to get product details
        bestSubscription = {
          productId: APPLE_PRODUCT_IDS.friend_monthly, // Placeholder
          expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Placeholder
          originalTransactionId: 'decoded-from-jwt', // Placeholder
          status,
        };
        break;
      }
    }
  }

  if (!bestSubscription) {
    return {
      isValid: false,
      tier: 'free',
      status: 'expired',
      environment,
    };
  }

  return {
    isValid: true,
    tier: PRODUCT_TO_TIER[bestSubscription.productId] || 'free',
    status: bestSubscription.status,
    expiresDate: bestSubscription.expiresDate,
    originalTransactionId: bestSubscription.originalTransactionId,
    productId: bestSubscription.productId,
    environment,
  };
}

/**
 * Map Apple's status code to our status type
 */
function mapAppleStatus(statusCode: number): AppleSubscriptionStatus {
  switch (statusCode) {
    case 1:
      return 'active';
    case 2:
      return 'expired';
    case 3:
      return 'in_billing_retry';
    case 4:
      return 'in_grace_period';
    case 5:
      return 'revoked';
    default:
      return 'expired';
  }
}

/**
 * Map Apple status to our subscription status
 */
function mapToSubscriptionStatus(appleStatus: AppleSubscriptionStatus): SubscriptionStatus {
  switch (appleStatus) {
    case 'active':
      return 'active';
    case 'in_grace_period':
      return 'past_due';
    case 'in_billing_retry':
      return 'past_due';
    case 'expired':
      return 'canceled';
    case 'revoked':
      return 'canceled';
    default:
      return 'canceled';
  }
}

// ============================================================================
// APP STORE SERVER NOTIFICATIONS
// ============================================================================

/**
 * Handle incoming App Store Server Notification v2
 *
 * Apple sends these when subscription status changes:
 * - New subscription
 * - Renewal
 * - Cancellation
 * - Refund
 * - Grace period
 */
export async function handleNotification(signedPayload: string): Promise<{
  success: boolean;
  notificationType?: AppleNotificationType;
  userId?: string;
  error?: string;
}> {
  try {
    // 1. Decode and verify the signed payload (JWS)
    const payload = await decodeSignedPayload(signedPayload);

    log.info(
      { notificationType: payload.notificationType, uuid: payload.notificationUUID },
      'Received Apple notification'
    );

    // 2. Decode transaction and renewal info
    const transactionInfo = await decodeSignedTransaction(payload.data.signedTransactionInfo);
    const renewalInfo = payload.data.signedRenewalInfo
      ? await decodeSignedRenewal(payload.data.signedRenewalInfo)
      : null;

    // 3. Find the user associated with this transaction
    const userId = await findUserByTransaction(transactionInfo.originalTransactionId);

    if (!userId) {
      log.warn(
        { originalTransactionId: transactionInfo.originalTransactionId },
        'No user found for Apple transaction'
      );
      return {
        success: false,
        notificationType: payload.notificationType,
        error: 'User not found',
      };
    }

    // 4. Handle based on notification type
    switch (payload.notificationType) {
      case 'SUBSCRIBED':
        await handleNewSubscription(userId, transactionInfo);
        break;

      case 'DID_RENEW':
        await handleRenewal(userId, transactionInfo);
        break;

      case 'DID_FAIL_TO_RENEW':
        await handleFailedRenewal(userId, transactionInfo, renewalInfo);
        break;

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        await handleExpiration(userId, transactionInfo);
        break;

      case 'REFUND':
      case 'REVOKE':
        await handleRefund(userId, transactionInfo);
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        await handleRenewalStatusChange(userId, renewalInfo);
        break;

      case 'TEST':
        log.info('Received Apple test notification');
        break;

      default:
        log.info({ type: payload.notificationType }, 'Unhandled Apple notification type');
    }

    return {
      success: true,
      notificationType: payload.notificationType,
      userId,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to process Apple notification');
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Decode the signed notification payload (JWS)
 */
async function decodeSignedPayload(signedPayload: string): Promise<AppleNotificationPayload> {
  // In production, verify the signature using Apple's public key
  // For now, just decode the payload
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }

  const payloadBase64 = parts[1];
  const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  return JSON.parse(payloadJson);
}

/**
 * Decode signed transaction info
 */
async function decodeSignedTransaction(signedTransaction: string): Promise<AppleTransactionInfo> {
  const parts = signedTransaction.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid transaction JWS format');
  }

  const payloadBase64 = parts[1];
  const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  const data = JSON.parse(payloadJson);

  return {
    transactionId: data.transactionId,
    originalTransactionId: data.originalTransactionId,
    productId: data.productId,
    purchaseDate: new Date(data.purchaseDate),
    expiresDate: new Date(data.expiresDate),
    environment: data.environment,
    isUpgraded: data.isUpgraded || false,
    offerType: data.offerType,
    offerIdentifier: data.offerIdentifier,
  };
}

/**
 * Decode signed renewal info
 */
async function decodeSignedRenewal(signedRenewal: string): Promise<AppleRenewalInfo> {
  const parts = signedRenewal.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid renewal JWS format');
  }

  const payloadBase64 = parts[1];
  const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  const data = JSON.parse(payloadJson);

  return {
    autoRenewProductId: data.autoRenewProductId,
    autoRenewStatus: data.autoRenewStatus,
    expirationIntent: data.expirationIntent,
    gracePeriodExpiresDate: data.gracePeriodExpiresDate
      ? new Date(data.gracePeriodExpiresDate)
      : undefined,
    isInBillingRetryPeriod: data.isInBillingRetryPeriod,
    priceIncreaseStatus: data.priceIncreaseStatus,
  };
}

// ============================================================================
// SUBSCRIPTION HANDLERS
// ============================================================================

/**
 * Find user by Apple transaction ID
 * Looks up in our database for the associated Ferni user
 */
async function findUserByTransaction(originalTransactionId: string): Promise<string | null> {
  try {
    const store = await getStore();
    // Query all profiles and find the one with matching Apple transaction ID
    // Note: In production, you'd want an index for this. For now, we scan.
    const profiles = await store.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      if (profile.subscription?.appleOriginalTransactionId === originalTransactionId) {
        log.debug({ originalTransactionId, userId: profile.id }, 'Found user by Apple transaction');
        return profile.id;
      }
    }

    log.debug({ originalTransactionId }, 'No user found for Apple transaction');
    return null;
  } catch (error) {
    log.error(
      { error: String(error), originalTransactionId },
      'Error looking up user by transaction'
    );
    return null;
  }
}

/**
 * Handle new subscription purchase
 */
async function handleNewSubscription(
  userId: string,
  transaction: AppleTransactionInfo
): Promise<void> {
  const tier = PRODUCT_TO_TIER[transaction.productId] || 'free';

  log.info({ userId, productId: transaction.productId, tier }, 'Processing new Apple subscription');

  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot update subscription - profile not found');
    return;
  }

  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  const updatedSubscription = {
    ...existingSubscription,
    tier,
    status: 'active' as const,
    provider: 'apple' as const,
    appleOriginalTransactionId: transaction.originalTransactionId,
    appleProductId: transaction.productId,
    subscribedAt: existingSubscription.subscribedAt ?? transaction.purchaseDate,
    currentPeriodEnd: transaction.expiresDate,
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.info({ userId, tier }, '✅ Apple subscription activated');
}

/**
 * Handle subscription renewal
 */
async function handleRenewal(userId: string, transaction: AppleTransactionInfo): Promise<void> {
  log.info({ userId, productId: transaction.productId }, 'Processing Apple renewal');

  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot update subscription - profile not found');
    return;
  }

  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  const updatedSubscription = {
    ...existingSubscription,
    status: 'active' as const,
    currentPeriodEnd: transaction.expiresDate,
    gracePeriodEnd: undefined, // Clear any grace period
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.info({ userId }, '✅ Apple subscription renewed');
}

/**
 * Handle failed renewal (billing retry / grace period)
 */
async function handleFailedRenewal(
  userId: string,
  transaction: AppleTransactionInfo,
  renewalInfo: AppleRenewalInfo | null
): Promise<void> {
  log.warn({ userId, productId: transaction.productId }, 'Apple renewal failed');

  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot update subscription - profile not found');
    return;
  }

  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  // Keep access during grace period but mark as past_due
  const updatedSubscription = {
    ...existingSubscription,
    status: 'past_due' as const,
    gracePeriodEnd: renewalInfo?.gracePeriodExpiresDate,
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.warn(
    { userId, gracePeriodEnd: renewalInfo?.gracePeriodExpiresDate },
    '⚠️ Apple subscription in grace period'
  );
}

/**
 * Handle subscription expiration
 */
async function handleExpiration(userId: string, transaction: AppleTransactionInfo): Promise<void> {
  log.info({ userId, productId: transaction.productId }, 'Apple subscription expired');

  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot update subscription - profile not found');
    return;
  }

  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  // Downgrade to free tier
  const updatedSubscription = {
    ...existingSubscription,
    tier: 'free' as const,
    status: 'canceled' as const,
    gracePeriodEnd: undefined,
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.info({ userId }, '📉 Apple subscription expired - downgraded to free');
}

/**
 * Handle refund or revocation
 */
async function handleRefund(userId: string, transaction: AppleTransactionInfo): Promise<void> {
  log.info({ userId, transactionId: transaction.transactionId }, 'Apple refund/revoke');

  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot update subscription - profile not found');
    return;
  }

  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  // Immediately revoke access and downgrade to free
  const updatedSubscription = {
    ...existingSubscription,
    tier: 'free' as const,
    status: 'canceled' as const,
    revokedAt: new Date(),
    gracePeriodEnd: undefined,
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.warn({ userId }, '🚫 Apple subscription refunded/revoked - access removed');
}

/**
 * Handle auto-renew status change (user toggled in Settings)
 */
async function handleRenewalStatusChange(
  userId: string,
  renewalInfo: AppleRenewalInfo | null
): Promise<void> {
  const willRenew = renewalInfo?.autoRenewStatus === 1;

  log.info({ userId, willRenew }, 'Apple auto-renew status changed');

  // This doesn't change access, just tracks intent
  // We log it for analytics but don't modify the subscription
  // If user turns off auto-renew, they keep access until period ends
  // The EXPIRED notification will handle the actual downgrade
}

// ============================================================================
// SUBSCRIPTION SYNC
// ============================================================================

/**
 * Sync a user's Apple subscription status
 * Call this on app launch or when verifying access
 */
export async function syncSubscription(
  userId: string,
  originalTransactionId: string
): Promise<{
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresDate?: Date;
}> {
  const result = await getSubscriptionStatus(originalTransactionId);

  if (!result.isValid) {
    return {
      tier: 'free',
      status: 'canceled',
    };
  }

  return {
    tier: result.tier,
    status: mapToSubscriptionStatus(result.status),
    expiresDate: result.expiresDate,
  };
}

// ============================================================================
// CANCELLATION INFO
// ============================================================================

/**
 * Get cancellation instructions for Apple subscriptions
 * Apple doesn't allow developers to cancel - users must go through iOS Settings
 */
export function getCancellationInstructions(): {
  title: string;
  steps: string[];
  note: string;
} {
  return {
    title: 'Cancel Apple Subscription',
    steps: [
      'Open the Settings app on your iPhone or iPad',
      'Tap your name at the top',
      'Tap "Subscriptions"',
      'Find and tap "Ferni"',
      'Tap "Cancel Subscription"',
      'Confirm cancellation',
    ],
    note: "You'll keep access until the end of your current billing period. We'd love to have you back anytime.",
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const appleIAP = {
  // Configuration
  isConfigured: isAppleConfigured,
  productIds: APPLE_PRODUCT_IDS,
  productToTier: PRODUCT_TO_TIER,

  // Verification
  verifyReceipt,
  getSubscriptionStatus,

  // Notifications
  handleNotification,

  // Sync
  syncSubscription,

  // Cancellation
  getCancellationInstructions,
};

export default appleIAP;
