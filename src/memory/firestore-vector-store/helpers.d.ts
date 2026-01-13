/**
 * Firestore Vector Store Helpers
 *
 * Utility functions for embedding extraction and validation.
 *
 * @module memory/firestore-vector-store/helpers
 */
/**
 * Safely extract embedding array with validation.
 * Returns undefined if embedding is invalid or wrong dimension.
 */
export declare function extractEmbedding(rawEmbedding: unknown, expectedDimension: number, docId: string): number[] | undefined;
/**
 * Check if document matches filter criteria.
 */
export declare function matchesFilter(doc: {
    metadata: {
        source: string;
        category?: string;
        userId?: string;
    };
}, filter?: {
    source?: string | string[];
    category?: string | string[];
    userId?: string;
}): boolean;
//# sourceMappingURL=helpers.d.ts.map