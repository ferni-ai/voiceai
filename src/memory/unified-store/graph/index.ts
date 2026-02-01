/**
 * Memory Graph Module
 *
 * Manages connections between memories for associative recall.
 *
 * @module memory/unified-store/graph
 */

// Link types and detection
export {
  LINK_TYPE_CONFIGS,
  LINK_DETECTION_RULES,
  detectLinks,
  applyLinkDecay,
  calculateReinforcementBoost,
  cosineSimilarity,
  type LinkTypeConfig,
  type LinkDetectionRule,
} from './link-types.js';

// Firestore persistence
export {
  FirestoreLinkStore,
  getFirestoreLinkStore,
  resetFirestoreLinkStore,
} from './firestore-links.js';

// Link manager
export {
  LinkManager,
  getLinkManager,
  resetLinkManager,
  type LinkManagerConfig,
  type GraphTraversalResult,
  type MaintenanceReport,
} from './link-manager.js';
