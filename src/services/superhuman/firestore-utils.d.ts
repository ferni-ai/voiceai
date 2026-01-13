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
export { cleanForFirestore, removeUndefined, deepRemoveUndefined, getFirestoreDb, recordDegradation, getFirestoreHealth, resetFirestoreInstance, } from '../../utils/firestore-utils.js';
export { getFirestoreHealth as getSuperhmanHealth } from '../../utils/firestore-utils.js';
/**
 * List of all superhuman services that depend on Firestore.
 * Used for health endpoint reporting.
 */
export declare const SUPERHUMAN_SERVICES: readonly ["anticipatory-planning", "calendar-prep-coaching", "capacity-guardian", "celebration-balance", "commitment-keeper", "conflict-resolution-memory", "dream-keeper", "life-narrative", "milestone-tracker", "planning-coordination", "predictive-coaching", "relationship-network", "seasonal-awareness", "values-alignment", "relationship-milestones", "emotional-first-aid", "relationship-network-graph", "social-graph", "cross-persona-insights"];
export type SuperhumanServiceName = (typeof SUPERHUMAN_SERVICES)[number];
//# sourceMappingURL=firestore-utils.d.ts.map