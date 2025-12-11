/**
 * Ferni Monetization System
 *
 * "Ferni Free Forever" - with value-aligned revenue streams.
 *
 * Revenue Streams:
 * 1. Tip Jar - Gratitude-based contributions
 * 2. Value Capture - Share your wins when Ferni helps
 * 3. Ferni Fund - Pay-it-forward community pool
 * 4. B2B Licensing - Companies pay for employee wellness
 * 5. Contextual Partnerships - Warm introductions to helpful products
 *
 * Philosophy: We make money when we create value, not by gatekeeping.
 */

// Re-export all services
export { b2bLicensing, default as b2bLicensingService } from './b2b-licensing.js';
export {
  contextualPartnerships,
  default as contextualPartnershipsService,
} from './contextual-partnerships.js';
export { ferniFund, default as ferniFundService } from './ferni-fund.js';
export { tipJar, default as tipJarService } from './tip-jar.js';
export { valueCapture, default as valueCaptureService } from './value-capture.js';

// Re-export types
export type {
  FerniFund,
  FundContribution,
  Organization,
  OrganizationInvite,
  OrganizationPlan,
  OrganizationPlanConfig,
  Partner,
  PartnerCategory,
  PartnerReferral,
  SponsoredConversation,
  TipJarConfig,
  TipTransaction,
  UserMonetizationData,
  ValueEvent,
  ValueType,
} from '../../types/monetization.js';

// Export constants
export {
  createDefaultMonetizationData,
  DEFAULT_TIP_CONFIG,
  EXAMPLE_PARTNERS,
  ORGANIZATION_PLANS,
  SPONSORED_MESSAGES,
  THANK_YOU_MESSAGES,
  VALUE_CAPTURE_PROMPTS,
} from '../../types/monetization.js';

// ============================================================================
// UNIFIED MONETIZATION INTERFACE
// ============================================================================

import { b2bLicensing } from './b2b-licensing.js';
import { contextualPartnerships } from './contextual-partnerships.js';
import { ferniFund } from './ferni-fund.js';
import { tipJar } from './tip-jar.js';
import { valueCapture } from './value-capture.js';

/**
 * Unified monetization service
 * Provides access to all monetization features
 */
export const monetization = {
  // ======== TIP JAR ========
  tip: tipJar,

  // ======== VALUE CAPTURE ========
  value: valueCapture,

  // ======== FERNI FUND ========
  fund: ferniFund,

  // ======== B2B LICENSING ========
  b2b: b2bLicensing,

  // ======== CONTEXTUAL PARTNERSHIPS ========
  partners: contextualPartnerships,

  // ======== AGGREGATE STATS ========
  /**
   * Get combined monetization statistics
   */
  getOverallStats(): {
    tips: ReturnType<typeof tipJar.getStats>;
    valueCapture: ReturnType<typeof valueCapture.getStats>;
    fund: ReturnType<typeof ferniFund.getStatus>;
    partnerships: ReturnType<typeof contextualPartnerships.getStats>;
  } {
    return {
      tips: tipJar.getStats(),
      valueCapture: valueCapture.getStats(),
      fund: ferniFund.getStatus(),
      partnerships: contextualPartnerships.getStats(),
    };
  },

  /**
   * Get total revenue across all streams
   */
  getTotalRevenueCents(): number {
    const tips = tipJar.getStats().totalTipsCents;
    const value = valueCapture.getStats().totalValueCapturedCents;
    const fund = ferniFund.getStatus().totalContributedCents;
    const partnerships = contextualPartnerships.getStats().totalCommissionCents;

    return tips + value + fund + partnerships;
  },
};

export default monetization;
