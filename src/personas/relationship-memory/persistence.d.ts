/**
 * Relationship Memory Persistence
 *
 * > "Your best friend forgets. We don't."
 *
 * Firestore persistence layer for relationship memories.
 * Saves and loads the complete relationship history between users and personas.
 */
import type { RelationshipMemory } from './types.js';
interface Firestore {
    collection: (path: string) => CollectionReference;
}
interface CollectionReference {
    doc: (id: string) => DocumentReference;
    where: (field: string, op: string, value: unknown) => Query;
    get: () => Promise<QuerySnapshot>;
}
interface DocumentReference {
    id: string;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<unknown>;
    get: () => Promise<DocumentSnapshot>;
    delete: () => Promise<unknown>;
}
interface DocumentSnapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id: string;
}
interface QuerySnapshot {
    empty: boolean;
    docs: DocumentSnapshot[];
}
interface Query {
    get: () => Promise<QuerySnapshot>;
    limit: (n: number) => Query;
}
/**
 * Firestore persistence for relationship memories
 */
export declare class RelationshipMemoryPersistence {
    private db;
    private initPromise;
    constructor(firestore?: Firestore);
    /**
     * Initialize Firestore connection (lazy)
     */
    private ensureInitialized;
    private initialize;
    /**
     * Generate document ID for user-persona pair
     */
    private getDocId;
    /**
     * Save relationship memory to Firestore
     */
    save(memory: RelationshipMemory): Promise<void>;
    /**
     * Load relationship memory from Firestore
     */
    load(userId: string, personaId: string): Promise<RelationshipMemory | null>;
    /**
     * Delete relationship memory
     */
    delete(userId: string, personaId: string): Promise<void>;
    /**
     * Load all relationship memories for a user (across all personas)
     */
    loadAllForUser(userId: string): Promise<RelationshipMemory[]>;
    /**
     * Check if relationship exists
     */
    exists(userId: string, personaId: string): Promise<boolean>;
}
/**
 * Get the singleton persistence instance
 */
export declare function getRelationshipPersistence(): RelationshipMemoryPersistence;
/**
 * Save relationship memory (convenience function)
 */
export declare function saveRelationshipMemory(memory: RelationshipMemory): Promise<void>;
/**
 * Load relationship memory (convenience function)
 */
export declare function loadRelationshipMemory(userId: string, personaId: string): Promise<RelationshipMemory | null>;
/**
 * Load all relationship memories for a user (convenience function)
 */
export declare function loadAllRelationshipMemories(userId: string): Promise<RelationshipMemory[]>;
export default RelationshipMemoryPersistence;
//# sourceMappingURL=persistence.d.ts.map