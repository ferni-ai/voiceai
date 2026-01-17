/**
 * Semantic Router Persistence Layer
 *
 * Provides Firestore persistence for semantic router state.
 *
 * @module tools/semantic-router/persistence
 */

// Re-export everything from firestore-persistence
export {
  // Initialization
  initializeFirestorePersistence,
  getFirestore,
  isPersistenceAvailable,

  // Collections
  COLLECTIONS,

  // Correction persistence
  saveCorrection,
  loadCorrections,
  type PersistedCorrection,

  // User profile persistence
  saveUserProfile,
  loadUserProfile,
  type PersistedUserProfile,

  // Routing event persistence
  saveRoutingEvent,
  loadRoutingEvents,
  type PersistedRoutingEvent,

  // A/B test persistence
  saveABTest,
  loadABTests,
  type PersistedABTest,

  // Tool embedding persistence
  saveToolEmbedding,
  loadToolEmbedding,
  loadAllToolEmbeddings,
  deleteToolEmbeddingVersion,
  type PersistedToolEmbeddingIndex,

  // Learning state persistence
  saveLearningState,
  loadLearningState,
  type PersistedLearningState,

  // Utilities
  cleanupOldData,

  // Class wrapper
  FirestorePersistence,
  getFirestorePersistence,
} from './firestore-persistence.js';

// Re-export tool embedding index
export {
  getToolEmbeddingIndex,
  initializeToolEmbeddingIndex,
  type ToolEmbeddingIndex,
  type IndexStats,
} from './tool-embedding-index.js';
