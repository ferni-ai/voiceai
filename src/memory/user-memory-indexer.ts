/**
 * User Memory Indexer Stub
 *
 * This module was removed during the memory architecture cleanup (Jan 2026).
 * These are stub exports to maintain backward compatibility.
 *
 * The actual indexing functionality has been consolidated into:
 * - src/memory/semantic-rag.ts (for semantic search indexing)
 * - src/memory/entity-store/ (for entity-based indexing)
 */

import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

export interface IndexingResult {
  indexed: number;
  skipped: number;
  errors: number;
  categories: Record<string, number>;
}

export interface IndexingOptions {
  categories?: string[];
  forceReindex?: boolean;
  vectorStore?: unknown; // Legacy option, not used
}

/**
 * Index user memories for semantic search.
 * Stub implementation - returns empty result.
 */
export async function indexUserMemories(
  userId: string,
  _profile: UserProfile,
  _options?: IndexingOptions
): Promise<IndexingResult> {
  log.debug({ userId }, 'indexUserMemories called (stub - no-op)');
  return {
    indexed: 0,
    skipped: 0,
    errors: 0,
    categories: {},
  };
}

/**
 * Check if user memories need re-indexing.
 * Stub implementation - always returns false.
 */
export async function needsReindex(_userId: string): Promise<boolean> {
  return false;
}

/**
 * Get indexing status for a user.
 * Stub implementation - returns empty status.
 */
export async function getIndexingStatus(_userId: string): Promise<{
  lastIndexed: Date | null;
  totalIndexed: number;
  categories: string[];
}> {
  return {
    lastIndexed: null,
    totalIndexed: 0,
    categories: [],
  };
}
