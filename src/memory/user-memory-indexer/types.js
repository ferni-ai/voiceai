/**
 * User Memory Indexer Types
 *
 * Shared types for the user memory indexing system.
 *
 * @module memory/user-memory-indexer/types
 */
// ============================================================================
// DOCUMENT ID GENERATION
// ============================================================================
/**
 * Generate a stable document ID for user memory
 * Format: {category}_{userId}_{uniqueId}
 */
export function generateDocId(category, userId, uniqueId) {
    // Sanitize uniqueId to be URL-safe
    const safeId = uniqueId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 50);
    return `${category}_${userId}_${safeId}`;
}
//# sourceMappingURL=types.js.map