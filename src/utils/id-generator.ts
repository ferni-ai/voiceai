/**
 * ID Generator Utilities
 *
 * Centralized ID generation for consistent, traceable identifiers.
 *
 * @module utils/id-generator
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique ID with an optional prefix.
 *
 * Format: {prefix}_{uuid}
 * Example: "ent_a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *
 * Using prefixes makes IDs easier to identify in logs and Firestore.
 *
 * @param prefix - Optional prefix (e.g., "ent" for entity, "rel" for relationship)
 * @returns A unique identifier
 */
export function generateId(prefix?: string): string {
  const uuid = uuidv4();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * Generate a short ID for session-scoped data.
 * Uses the first 8 characters of a UUID.
 *
 * NOT guaranteed to be globally unique - use for session-scoped identifiers only.
 *
 * @param prefix - Optional prefix
 * @returns A short identifier (prefix + 8 chars)
 */
export function generateShortId(prefix?: string): string {
  const uuid = uuidv4().slice(0, 8);
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * Extract the prefix from a prefixed ID.
 *
 * @param id - The full ID (e.g., "ent_abc123")
 * @returns The prefix, or null if no prefix
 */
export function getIdPrefix(id: string): string | null {
  const underscoreIndex = id.indexOf('_');
  if (underscoreIndex === -1) return null;
  return id.slice(0, underscoreIndex);
}

/**
 * Check if an ID has a specific prefix.
 *
 * @param id - The ID to check
 * @param prefix - The prefix to look for
 * @returns True if the ID has the given prefix
 */
export function hasIdPrefix(id: string, prefix: string): boolean {
  return id.startsWith(`${prefix}_`);
}

// Common prefixes for reference
export const ID_PREFIXES = {
  ENTITY: 'ent',
  RELATIONSHIP: 'rel',
  FACT: 'fact',
  MENTION: 'mention',
  CORRELATION: 'corr',
  OBSERVATION: 'obs',
  SURFACING: 'surf',
  SESSION: 'sess',
  COMMITMENT: 'commit',
  MEMORY: 'mem',
} as const;
