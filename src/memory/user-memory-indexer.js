/**
 * User Memory Indexer
 *
 * Re-exports from the modular user-memory-indexer/ directory.
 * Maintained for backward compatibility.
 *
 * @see USER-MEMORY-VECTORIZATION.md for full strategy
 * @module memory/user-memory-indexer
 */
// Re-export everything from the modular implementation
export { 
// Main functions
indexUserMemories, removeUserMemories, batchIndexUserMemories, getUserMemoryStats, 
// Helper
generateDocId, 
// Profile indexers
indexKeyMoments, indexPeople, indexOpenThreads, indexFollowUps, indexLifeEvents, indexGoals, indexPersonaMemories, indexSharedContent, indexPreferences, indexEntertainment, 
// Human memory indexers
indexHumanMemory, indexImportantDates, indexInsideJokes, indexRunningThemes, indexValues, indexDreams, indexFears, indexGrowthMarkers, indexChallenges, indexAvoidances, indexTemporalPatterns, indexComfortPatterns, indexStressTriggers, indexEmotionalTells, 
// Extended indexers (voice journals, custom agents, contacts, habits)
indexVoiceJournals, indexCustomAgents, indexContactNotes, indexHabits, } from './user-memory-indexer/index.js';
// Re-export default for backward compatibility
export { default } from './user-memory-indexer/index.js';
//# sourceMappingURL=user-memory-indexer.js.map