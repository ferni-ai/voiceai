/**
 * Life Coach Domain Feature Flags
 *
 * Re-exports feature flag functions from the central feature flags system.
 * This provides a convenient import path for domain tools.
 *
 * USAGE:
 *   import { isLifeCoachDomainEnabled, isLifeCoachAnalyticsEnabled } from '../shared/feature-flags.js';
 *
 *   if (isLifeCoachDomainEnabled('health')) {
 *     // Load health tools
 *   }
 *
 * NOTE: Crisis domain is ALWAYS enabled for safety, regardless of feature flags.
 */
export { isLifeCoachDomainEnabled, getEnabledLifeCoachDomains, isLifeCoachAnalyticsEnabled, emergencyDisableLifeCoachDomain, type LifeCoachDomain, } from '../../../config/feature-flags.js';
export { getFeatureFlags, isFeatureEnabled, reloadFeatureFlags, } from '../../../config/feature-flags.js';
//# sourceMappingURL=feature-flags.d.ts.map