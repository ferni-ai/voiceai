/**
 * Trust Journey UI - Re-export from modular implementation
 *
 * This file maintains backwards compatibility while the implementation
 * has been split into modular files in ./trust-journey/
 *
 * @deprecated Import from './trust-journey/index.js' instead
 */

export {
  initTrustJourneyUI,
  showTrustJourney,
  hideTrustJourney,
  toggleTrustJourney,
  dispose,
  trustJourneyUI,
} from './trust-journey/index.js';

export type { TrustJourneyData, TrustJourneyState } from './trust-journey/index.js';
