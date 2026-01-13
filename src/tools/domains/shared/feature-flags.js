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
// Re-export life coach specific functions from central feature flags
export { isLifeCoachDomainEnabled, getEnabledLifeCoachDomains, isLifeCoachAnalyticsEnabled, emergencyDisableLifeCoachDomain, } from '../../../config/feature-flags.js';
// Re-export general feature flag functions for convenience
export { getFeatureFlags, isFeatureEnabled, reloadFeatureFlags, } from '../../../config/feature-flags.js';
//# sourceMappingURL=feature-flags.js.map