/**
 * Visual Memory Store
 *
 * > "Better than human means remembering every photo you shared."
 *
 * Storage and retrieval of visual memories.
 *
 * @module services/visual-memory/visual-memory-store
 */
import type { VisualMemory, VisualUploadRequest, VisualUploadResponse, VisualSearchRequest, VisualSearchResult, VisualMemoryContext, VisualMemoryPreferences } from './types.js';
/**
 * Upload and process a visual memory
 */
export declare function uploadVisualMemory(request: VisualUploadRequest): Promise<VisualUploadResponse>;
/**
 * Get a specific visual memory
 */
export declare function getVisualMemory(userId: string, memoryId: string): Promise<VisualMemory | null>;
/**
 * Get recent visual memories
 */
export declare function getRecentVisualMemories(userId: string, limit?: number): Promise<VisualMemory[]>;
/**
 * Delete a visual memory (soft delete)
 */
export declare function deleteVisualMemory(userId: string, memoryId: string, reason?: string): Promise<boolean>;
/**
 * Search visual memories
 */
export declare function searchVisualMemories(request: VisualSearchRequest): Promise<VisualSearchResult>;
/**
 * Get visual memory preferences
 */
export declare function getVisualPreferences(userId: string): Promise<VisualMemoryPreferences | null>;
/**
 * Update visual memory preferences
 */
export declare function updateVisualPreferences(userId: string, prefs: Partial<VisualMemoryPreferences>): Promise<void>;
/**
 * Build visual memory context for LLM injection
 */
export declare function buildVisualContext(userId: string): Promise<VisualMemoryContext>;
/**
 * Format visual context for LLM injection
 */
export declare function getVisualContextInjection(userId: string): Promise<string>;
export declare const visualMemoryStore: {
    uploadVisualMemory: typeof uploadVisualMemory;
    getVisualMemory: typeof getVisualMemory;
    getRecentVisualMemories: typeof getRecentVisualMemories;
    deleteVisualMemory: typeof deleteVisualMemory;
    searchVisualMemories: typeof searchVisualMemories;
    getVisualPreferences: typeof getVisualPreferences;
    updateVisualPreferences: typeof updateVisualPreferences;
    buildVisualContext: typeof buildVisualContext;
    getVisualContextInjection: typeof getVisualContextInjection;
};
//# sourceMappingURL=visual-memory-store.d.ts.map