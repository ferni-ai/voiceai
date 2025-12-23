/**
 * User Memory Indexer Types
 *
 * Shared types for the user memory indexing system.
 *
 * @module memory/user-memory-indexer/types
 */

import type { FirestoreVectorStore } from '../firestore-vector-store.js';
import type { VectorStore, VectorDocument } from '../vector-store.js';

// ============================================================================
// TYPES
// ============================================================================

export type AnyVectorStore = VectorStore | FirestoreVectorStore;

/** Categories for user memory documents */
export type UserMemoryCategory =
  // Original domains
  | 'key_moment'
  | 'person'
  | 'thread'
  | 'followup'
  | 'life_event'
  | 'goal'
  | 'persona_learning'
  | 'shared_content'
  | 'emotional_pattern'
  | 'preference'
  | 'entertainment'
  // Human-centric domains
  | 'important_date'
  | 'emotional_signature'
  | 'inside_joke'
  | 'running_theme'
  | 'value'
  | 'dream'
  | 'fear'
  | 'growth_marker'
  | 'challenge'
  | 'avoidance'
  | 'temporal_pattern'
  | 'comfort_pattern'
  | 'stress_trigger'
  | 'emotional_tell';

/** Result of indexing operation */
export interface IndexingResult {
  indexed: number;
  skipped: number;
  errors: number;
  categories: Record<string, number>;
}

// Re-export VectorDocument for convenience
export type { VectorDocument };

// ============================================================================
// DOCUMENT ID GENERATION
// ============================================================================

/**
 * Generate a stable document ID for user memory
 * Format: {category}_{userId}_{uniqueId}
 */
export function generateDocId(
  category: UserMemoryCategory,
  userId: string,
  uniqueId: string
): string {
  // Sanitize uniqueId to be URL-safe
  const safeId = uniqueId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 50);
  return `${category}_${userId}_${safeId}`;
}
