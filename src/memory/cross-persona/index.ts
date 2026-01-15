/**
 * Cross-Persona Memory Module
 *
 * Phase 12: Cross-Persona Memory Sharing
 *
 * Provides unified memory access for all personas with persona-specific
 * context building and cross-persona insight sharing.
 *
 * @module memory/cross-persona
 */

// Shared Memory API
export {
  // Memory operations
  getMemories,
  getMemoriesForPersona,
  storeMemory,
  recordMemorySurfaced,
  // Insight operations
  createInsight,
  getInsightsForPersona,
  markInsightDelivered,
  // Cache management
  clearMemoryCache,
  clearAllCaches,
  getCacheStats,
  // Types and constants
  PERSONA_MEMORY_INTERESTS,
  type PersonaId,
  type MemoryCategory,
  type SharedMemory,
  type MemoryQueryFilters,
  type MemoryQueryResult,
  type CrossPersonaInsight,
} from './shared-memory-api.js';

// Persona Memory Context
export {
  buildPersonaMemoryContext,
  recordContextSurfaced,
  buildHandoffContext,
  type PersonaMemoryContext,
  type FormattedMemory,
  type FormattedInsight,
  type PersonaMemoryContextOptions,
} from './persona-memory-context.js';
