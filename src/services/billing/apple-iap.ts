/**
 * Apple In-App Purchase Service
 *
 * Handles Apple App Store subscriptions and in-app purchases:
 * - Subscription status sync (App Store Server API)
 * - App Store Server Notifications v2 (apple-notifications.ts)
 * - Purchases applied to the buyer's profile (apple-entitlement.ts)
 *
 * Philosophy: Apple users get the same Ferni experience.
 * We just verify through a different payment provider.
 */

import * as crypto from 'crypto';
import type { SubscriptionStatus, SubscriptionTier } from '../../types/subscription.js';
import { createLogger } from '../../utils/safe-logger.js';
import { APPLE_PRODUCT_IDS, PRODUCT_TO_TIER } from './apple-entitlement.js';
import { handleNotification } from './apple-notifications.js';
import { DEFAULT_APPLE_BUNDLE_ID } from './apple-signed-data.js';

export { APPLE_PRODUCT_IDS, PRODUCT_TO_TIER } from './apple-entitlement.js';
export { handleNotification } from './apple-notifications.js';

const log = createLogger({ module: 'AppleIAP' });

// ============================================================================
// TYPES
// ============================================================================

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
  bundleId: process.env.APPLE_BUNDLE_ID || DEFAULT_APPLE_BUNDLE_ID,

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
// SUBSCRIPTION STATUS
// ============================================================================

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
    return await parseSubscriptionResponse(data);
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
async function parseSubscriptionResponse(data: unknown): Promise<ReceiptVerificationResult> {
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
      const status = mapAppleStatus(transaction.status || 0);

      if (status === 'active' || status === 'in_grace_period') {
        // Decode signedTransactionInfo to get actual product details
        if (transaction.signedTransactionInfo) {
          try {
            const transactionInfo = decodeSignedTransactionSync(transaction.signedTransactionInfo);
            bestSubscription = {
              productId: transactionInfo.productId,
              expiresDate: transactionInfo.expiresDate,
              originalTransactionId: transactionInfo.originalTransactionId,
              status,
            };

            log.debug(
              {
                productId: transactionInfo.productId,
                expiresDate: transactionInfo.expiresDate,
                originalTransactionId: transactionInfo.originalTransactionId,
              },
              'Decoded Apple transaction info'
            );
            break;
          } catch (error) {
            log.warn({ error: String(error) }, 'Failed to decode signedTransactionInfo');
            // Fall back to status-only approach
            bestSubscription = {
              productId: APPLE_PRODUCT_IDS.friend_monthly, // Default fallback
              expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
              originalTransactionId: `unknown-${Date.now()}`,
              status,
            };
            break;
          }
        } else {
          // No signedTransactionInfo available, use fallback
          bestSubscription = {
            productId: APPLE_PRODUCT_IDS.friend_monthly,
            expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            originalTransactionId: `unknown-${Date.now()}`,
            status,
          };
          break;
        }
      }
    }
    if (bestSubscription) break;
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
 * Decode signed transaction info (synchronous version for internal use)
 * This decodes the JWS without async verification for use in parseSubscriptionResponse
 */
function decodeSignedTransactionSync(signedTransaction: string): AppleTransactionInfo {
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

  // Status
  getSubscriptionStatus,

  // Notifications
  handleNotification,

  // Sync
  syncSubscription,

  // Cancellation
  getCancellationInstructions,
};

export default appleIAP;
