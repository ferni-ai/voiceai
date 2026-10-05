/**
 * App Store Server Notifications v2 → the buyer's entitlement.
 *
 * The notification, its transaction and its renewal info are each verified by
 * Apple's library (signature chain to Apple's root, our bundle id, app and
 * environment) before anything is read. The buyer comes from the purchase's
 * ownership record (resolveAppleBuyer), never from the payload.
 *
 * What each notification does (Apple's documented meaning):
 * - SUBSCRIBED, DID_RENEW, RENEWAL_EXTENDED, REFUND_REVERSED, OFFER_REDEEMED,
 *   DID_CHANGE_RENEWAL_PREF/UPGRADE (upgrades take effect at once): apply the
 *   transaction — grant or extend its tier, or end it if it expired/was revoked.
 * - DID_CHANGE_RENEWAL_PREF/DOWNGRADE: nothing now; the next DID_RENEW carries
 *   the lower product.
 * - DID_FAIL_TO_RENEW/GRACE_PERIOD: keep the tier until the grace period ends.
 *   Without a grace period, and GRACE_PERIOD_EXPIRED: back to free.
 * - EXPIRED: back to free. REFUND, REVOKE: back to free immediately.
 *
 * @module services/billing/apple-notifications
 */
import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { createLogger } from '../../utils/safe-logger.js';
import {
  applyAppleChange,
  changeFromTransaction,
  resolveAppleBuyer,
  type AppleEntitlementChange,
} from './apple-entitlement.js';
import { requireAppleVerifier } from './apple-signed-data.js';

const log = createLogger({ module: 'AppleNotifications' });

const APPLIES_TRANSACTION = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'RENEWAL_EXTENDED',
  'REFUND_REVERSED',
  'OFFER_REDEEMED',
]);

/** The entitlement change a verified notification stands for, or null for none. */
export function changeForNotification(
  notificationType: string | undefined,
  subtype: string | undefined,
  tx: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload | null
): AppleEntitlementChange | null {
  const { originalTransactionId } = tx;
  if (!originalTransactionId) return null;
  if (notificationType && APPLIES_TRANSACTION.has(notificationType)) {
    return changeFromTransaction(tx);
  }
  switch (notificationType) {
    case 'DID_CHANGE_RENEWAL_PREF':
      return subtype === 'UPGRADE' ? changeFromTransaction(tx) : null;
    case 'DID_FAIL_TO_RENEW':
      if (subtype === 'GRACE_PERIOD') {
        const until = renewal?.gracePeriodExpiresDate;
        return {
          kind: 'grace',
          originalTransactionId,
          until: until !== undefined ? new Date(until) : undefined,
        };
      }
      return { kind: 'end', originalTransactionId, reason: 'billing' };
    case 'GRACE_PERIOD_EXPIRED':
      return { kind: 'end', originalTransactionId, reason: 'billing' };
    case 'EXPIRED':
      return { kind: 'end', originalTransactionId, reason: 'expired' };
    case 'REFUND':
    case 'REVOKE':
      return { kind: 'end', originalTransactionId, reason: 'refund' };
    default:
      return null;
  }
}

export interface AppleNotificationResult {
  success: boolean;
  notificationType?: string;
  userId?: string;
  error?: string;
  /** A transient failure: answer non-2xx so Apple retries (handling is idempotent). */
  retry?: boolean;
}

/**
 * Handle one App Store Server Notification. Throws only when the payload
 * fails verification (the route answers 401 before calling this).
 */
export async function handleNotification(signedPayload: string): Promise<AppleNotificationResult> {
  const verifier = requireAppleVerifier();
  const payload = await verifier.verifyAndDecodeNotification(signedPayload);
  const notificationType = payload.notificationType as string | undefined;
  const subtype = payload.subtype as string | undefined;
  log.info(
    { notificationType, subtype, uuid: payload.notificationUUID },
    'Received Apple notification'
  );

  const signedTransaction = payload.data?.signedTransactionInfo;
  if (!signedTransaction) return { success: true, notificationType };
  const tx = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const signedRenewal = payload.data?.signedRenewalInfo;
  const renewal = signedRenewal ? await verifier.verifyAndDecodeRenewalInfo(signedRenewal) : null;

  const change = changeForNotification(notificationType, subtype, tx, renewal);
  if (!change) return { success: true, notificationType };

  const userId = await resolveAppleBuyer(change.originalTransactionId);
  if (userId === 'unavailable') {
    return { success: false, notificationType, retry: true, error: 'Ownership unavailable' };
  }
  if (!userId) {
    log.warn(
      { originalTransactionId: change.originalTransactionId, notificationType },
      'No owner for an App Store notification'
    );
    return { success: false, notificationType, error: 'User not found' };
  }
  try {
    await applyAppleChange(userId, change);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not apply an App Store notification');
    return { success: false, notificationType, userId, retry: true, error: 'Profile not saved' };
  }
  return { success: true, notificationType, userId };
}
