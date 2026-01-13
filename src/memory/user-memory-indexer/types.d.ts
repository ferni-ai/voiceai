/**
 * User Memory Indexer Types
 *
 * Shared types for the user memory indexing system.
 *
 * @module memory/user-memory-indexer/types
 */
import type { FirestoreVectorStore } from '../firestore-vector-store.js';
import type { VectorStore, VectorDocument } from '../vector-store.js';
export type AnyVectorStore = VectorStore | FirestoreVectorStore;
/** Categories for user memory documents */
export type UserMemoryCategory = 'key_moment' | 'person' | 'thread' | 'followup' | 'life_event' | 'goal' | 'persona_learning' | 'shared_content' | 'emotional_pattern' | 'preference' | 'entertainment' | 'important_date' | 'emotional_signature' | 'inside_joke' | 'running_theme' | 'value' | 'dream' | 'fear' | 'growth_marker' | 'challenge' | 'avoidance' | 'temporal_pattern' | 'comfort_pattern' | 'stress_trigger' | 'emotional_tell' | 'voice_journal' | 'custom_agent' | 'contact_note' | 'habit';
/** Result of indexing operation */
export interface IndexingResult {
    indexed: number;
    skipped: number;
    errors: number;
    categories: Record<string, number>;
}
export type { VectorDocument };
/**
 * Generate a stable document ID for user memory
 * Format: {category}_{userId}_{uniqueId}
 */
export declare function generateDocId(category: UserMemoryCategory, userId: string, uniqueId: string): string;
//# sourceMappingURL=types.d.ts.map