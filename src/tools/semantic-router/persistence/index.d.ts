/**
 * Semantic Router Persistence Layer
 *
 * Provides Firestore persistence for semantic router state.
 *
 * @module tools/semantic-router/persistence
 */
export { initializeFirestorePersistence, getFirestore, isPersistenceAvailable, COLLECTIONS, saveCorrection, loadCorrections, type PersistedCorrection, saveUserProfile, loadUserProfile, type PersistedUserProfile, saveRoutingEvent, loadRoutingEvents, type PersistedRoutingEvent, saveABTest, loadABTests, type PersistedABTest, saveToolEmbedding, loadToolEmbedding, loadAllToolEmbeddings, deleteToolEmbeddingVersion, type PersistedToolEmbeddingIndex, saveLearningState, loadLearningState, type PersistedLearningState, cleanupOldData, FirestorePersistence, getFirestorePersistence, } from './firestore-persistence.js';
export { getToolEmbeddingIndex, initializeToolEmbeddingIndex, type ToolEmbeddingIndex, type IndexStats, } from './tool-embedding-index.js';
//# sourceMappingURL=index.d.ts.map