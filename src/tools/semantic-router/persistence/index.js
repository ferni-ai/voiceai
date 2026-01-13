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
initializeFirestorePersistence, getFirestore, isPersistenceAvailable, 
// Collections
COLLECTIONS, 
// Correction persistence
saveCorrection, loadCorrections, 
// User profile persistence
saveUserProfile, loadUserProfile, 
// Routing event persistence
saveRoutingEvent, loadRoutingEvents, 
// A/B test persistence
saveABTest, loadABTests, 
// Tool embedding persistence
saveToolEmbedding, loadToolEmbedding, loadAllToolEmbeddings, deleteToolEmbeddingVersion, 
// Learning state persistence
saveLearningState, loadLearningState, 
// Utilities
cleanupOldData, 
// Class wrapper
FirestorePersistence, getFirestorePersistence, } from './firestore-persistence.js';
// Re-export tool embedding index
export { getToolEmbeddingIndex, initializeToolEmbeddingIndex, } from './tool-embedding-index.js';
//# sourceMappingURL=index.js.map