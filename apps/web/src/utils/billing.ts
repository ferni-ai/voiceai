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
 * await openBillingPortal();
 *
 * // Open in same tab
 * await openBillingPortal({ openInNewTab: false });
 * ```
 */

import { getApiHeadersAsync } from './api.js';
import { createLogger } from './logger.js';
import { toast } from '../ui/whisper.ui.js';

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

/**
 * Human text for a failed billing request. 503 means payments aren't set up on
 * the server (Stripe not configured), so retrying won't help and nothing was charged.
 */
export function billingErrorMessage(status?: number): string {
  if (status === 503) return "Payments aren't set up yet, so nothing was charged.";
  return "Couldn't reach billing. Try again?";
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Open the Stripe billing portal for subscription management.
 *
 * The portal is for the signed-in user: the request carries the Firebase Bearer
 * token and no userId (the server refuses a body naming another user, and the
 * local deviceId is not the account id).
 *
 * @param options - Configuration options
 * @returns Result indicating success and the portal URL
 *
 * @example
 * // Basic usage (opens in new tab)
 * await openBillingPortal();
 *
 * @example
 * // Open in same tab (for redirect flow)
 * await openBillingPortal({ openInNewTab: false });
 *
 * @example
 * // Custom return URL
 * await openBillingPortal({
 *   returnUrl: 'https://app.ferni.ai/settings',
 *   openInNewTab: false
 * });
 */
export async function openBillingPortal(
  options: BillingPortalOptions = {}
): Promise<BillingPortalResult> {
  const { returnUrl = window.location.href, openInNewTab = true, showErrorToast = true } = options;

  try {
    log.debug({ returnUrl, openInNewTab }, 'Opening billing portal');

    // Not under /api/, so the global fetch hook adds no token: attach it here.
    const response = await fetch(BILLING_PORTAL_ENDPOINT, {
      method: 'POST',
      headers: await getApiHeadersAsync(),
      body: JSON.stringify({ returnUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log.error({ status: response.status, errorText }, 'Billing portal request failed');

      if (showErrorToast) {
        toast.error(billingErrorMessage(response.status));
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
