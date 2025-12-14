/**
 * Marketplace UI Components
 *
 * Unified exports for all marketplace-related UI:
 * - Marketplace browser (user-facing catalog)
 * - Publisher portal (developer tools)
 * - Billing dashboard (usage & quotas)
 */

// Re-export from existing marketplace.ui.ts (user marketplace browser)
export { openMarketplace, closeMarketplace, isMarketplaceLoading } from '../marketplace.ui.js';

// Publisher portal for developers
import {
  initPublisherPortalUI as initPublisher,
  openPublisherPortal,
  closePublisherPortal,
  publisherPortalUI,
  type PublisherProfile,
  type PublisherItem,
  type PublisherAnalytics,
} from '../marketplace-publisher.ui.js';

export {
  openPublisherPortal,
  closePublisherPortal,
  publisherPortalUI,
  type PublisherProfile,
  type PublisherItem,
  type PublisherAnalytics,
};
export { initPublisher as initPublisherPortalUI };

// Billing dashboard
import {
  initBillingUI as initBilling,
  openBillingDashboard,
  closeBillingDashboard,
  createUsageIndicator,
  billingUI,
  type UsageSummary,
  type RevenueShare,
} from '../marketplace-billing.ui.js';

export {
  openBillingDashboard,
  closeBillingDashboard,
  createUsageIndicator,
  billingUI,
  type UsageSummary,
  type RevenueShare,
};
export { initBilling as initBillingUI };

/**
 * Initialize all marketplace UI components
 * Call this once at app startup to pre-inject styles
 */
export function initAllMarketplaceUI(): void {
  initPublisher();
  initBilling();
}
