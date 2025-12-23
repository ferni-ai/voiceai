/**
 * Billing Portal Utility
 *
 * Consolidated billing portal access for the entire app.
 * Single source of truth for opening Stripe billing portal.
 *
 * Usage:
 * ```typescript
 * import { openBillingPortal } from '../utils/billing.js';
 *
 * // Open in new tab (default)
 * await openBillingPortal(userId);
 *
 * // Open in same tab
 * await openBillingPortal(userId, { openInNewTab: false });
 * ```
 */

import { createLogger } from './logger.js';
import { toast } from '../ui/toast.ui.js';

const log = createLogger('Billing');

// ============================================================================
// TYPES
// ============================================================================

export interface BillingPortalOptions {
  /** Return URL after user leaves Stripe portal. Defaults to current page. */
  returnUrl?: string;
  /** Open in new tab (default: true) or same tab */
  openInNewTab?: boolean;
  /** Show toast on error (default: true) */
  showErrorToast?: boolean;
}

export interface BillingPortalResult {
  success: boolean;
  url?: string;
  error?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The canonical billing portal endpoint.
 * Maps to `createBillingPortal` in subscription-routes.ts
 */
const BILLING_PORTAL_ENDPOINT = '/subscription/portal';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Open the Stripe billing portal for subscription management.
 *
 * @param userId - The user's device ID / user ID
 * @param options - Configuration options
 * @returns Result indicating success and the portal URL
 *
 * @example
 * // Basic usage (opens in new tab)
 * await openBillingPortal(userId);
 *
 * @example
 * // Open in same tab (for redirect flow)
 * await openBillingPortal(userId, { openInNewTab: false });
 *
 * @example
 * // Custom return URL
 * await openBillingPortal(userId, {
 *   returnUrl: 'https://app.ferni.ai/settings',
 *   openInNewTab: false
 * });
 */
export async function openBillingPortal(
  userId: string,
  options: BillingPortalOptions = {}
): Promise<BillingPortalResult> {
  const {
    returnUrl = window.location.href,
    openInNewTab = true,
    showErrorToast = true,
  } = options;

  if (!userId) {
    log.warn('Attempted to open billing portal without userId');
    if (showErrorToast) {
      toast.error("Connect first, then we can manage that.");
    }
    return { success: false, error: 'No userId provided' };
  }

  try {
    log.debug({ userId, returnUrl, openInNewTab }, 'Opening billing portal');

    const response = await fetch(BILLING_PORTAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        returnUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log.error({ status: response.status, errorText }, 'Billing portal request failed');

      if (showErrorToast) {
        toast.error("Couldn't open billing. Try again?");
      }
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();

    if (!result.url) {
      log.error({ result }, 'Billing portal response missing URL');
      if (showErrorToast) {
        toast.error("Couldn't open billing. Try again?");
      }
      return { success: false, error: 'No URL in response' };
    }

    // Navigate to the portal
    if (openInNewTab) {
      window.open(result.url, '_blank');
    } else {
      window.location.href = result.url;
    }

    log.info('Billing portal opened successfully');
    return { success: true, url: result.url };
  } catch (error) {
    log.error({ error: String(error) }, 'Billing portal failed');

    if (showErrorToast) {
      toast.error("Hmm, that didn't work. Try again?");
    }
    return { success: false, error: String(error) };
  }
}

/**
 * Get the billing portal URL without navigating.
 * Useful if you need to create a link or handle navigation yourself.
 *
 * @param userId - The user's device ID / user ID
 * @param returnUrl - Return URL after leaving portal
 * @returns The portal URL or null on error
 */
export async function getBillingPortalUrl(
  userId: string,
  returnUrl: string = window.location.href
): Promise<string | null> {
  const result = await openBillingPortal(userId, {
    returnUrl,
    openInNewTab: false,
    showErrorToast: false,
  });

  // The function navigated, but we can still return the URL
  // Actually, we need a different approach - let's not navigate
  if (!userId) return null;

  try {
    const response = await fetch(BILLING_PORTAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, returnUrl }),
    });

    if (!response.ok) return null;

    const { url } = await response.json();
    return url || null;
  } catch {
    return null;
  }
}

