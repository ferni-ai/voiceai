/**
 * Firestore utilities for Superhuman services
 *
 * ARCHITECTURE NOTE:
 * This file re-exports from the canonical utils/firestore-utils.ts location.
 * All Firestore utilities should be imported from there directly.
 * This re-export exists for backward compatibility.
 *
 * @deprecated Import from '../../utils/firestore-utils.js' instead
 */

// Re-export everything from the canonical location
export {
  // Data cleaning
  cleanForFirestore,
  removeUndefined,
  deepRemoveUndefined,
  // DB instance management
  getFirestoreDb,
  recordDegradation,
  getFirestoreHealth,
  resetFirestoreInstance,
} from '../../utils/firestore-utils.js';

// Alias for backward compatibility
export { getFirestoreHealth as getSuperhmanHealth } from '../../utils/firestore-utils.js';

/**
 * List of all superhuman services that depend on Firestore.
 * Used for health endpoint reporting.
 */
export const SUPERHUMAN_SERVICES = [
  'anticipatory-planning',
  'calendar-prep-coaching',
  'capacity-guardian',
  'celebration-balance',
  'commitment-keeper',
  'conflict-resolution-memory',
  'dream-keeper',
  'life-narrative',
  'milestone-tracker',
  'planning-coordination',
  'predictive-coaching',
  'relationship-network',
  'seasonal-awareness',
  'values-alignment',
  'relationship-milestones',
  'emotional-first-aid',
  'relationship-network-graph',
  'social-graph',
  'cross-persona-insights',
] as const;

export type SuperhumanServiceName = (typeof SUPERHUMAN_SERVICES)[number];
