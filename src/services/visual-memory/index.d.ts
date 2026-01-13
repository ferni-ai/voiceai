/**
 * Visual Memory Service
 *
 * > "Better than human means remembering every photo you shared."
 *
 * Multi-modal visual memory - photos, screenshots, drawings become
 * part of Ferni's understanding of your life.
 *
 * ## Privacy First
 *
 * - All image storage is encrypted
 * - Vision analysis is opt-in
 * - Face detection disabled by default
 * - User can delete any visual memory
 * - Data never leaves Ferni
 *
 * ## What We Remember
 *
 * | Visual Type | How Ferni Uses It |
 * |-------------|-------------------|
 * | Photos shared | "That photo of your dog you showed me..." |
 * | Screenshots | "I remember you were researching..." |
 * | Receipts | "That trip you took last month..." |
 * | Achievements | "Congratulations on your certificate!" |
 *
 * ## Usage
 *
 * ```typescript
 * import { visualMemory } from './services/visual-memory';
 *
 * // Upload a visual
 * const result = await visualMemory.upload({
 *   userId,
 *   imageData: base64,
 *   mimeType: 'image/jpeg',
 *   source: 'shared_in_chat',
 * });
 *
 * // Search visuals
 * const results = await visualMemory.search({
 *   userId,
 *   query: 'dog photos',
 * });
 *
 * // Get context for LLM
 * const context = await visualMemory.getContextInjection(userId);
 * ```
 *
 * @module services/visual-memory
 */
export type { VisualMemory, VisionAnalysisResult, VisualUploadRequest, VisualUploadResponse, VisualSearchRequest, VisualSearchResult, VisualMemoryContext, VisualMemoryPreferences, } from './types.js';
export { analyzeImage, generateImageDescription, categorizeImage, visionAnalysis, } from './vision-analysis.js';
export { uploadVisualMemory, getVisualMemory, getRecentVisualMemories, deleteVisualMemory, searchVisualMemories, getVisualPreferences, updateVisualPreferences, buildVisualContext, getVisualContextInjection, visualMemoryStore, } from './visual-memory-store.js';
import { uploadVisualMemory, getVisualMemory, getRecentVisualMemories, searchVisualMemories, deleteVisualMemory, getVisualPreferences, updateVisualPreferences, buildVisualContext, getVisualContextInjection } from './visual-memory-store.js';
/**
 * Unified Visual Memory API
 */
export declare const visualMemory: {
    /**
     * Upload a visual memory
     */
    upload: typeof uploadVisualMemory;
    /**
     * Get a specific visual memory
     */
    get: typeof getVisualMemory;
    /**
     * Get recent visual memories
     */
    getRecent: typeof getRecentVisualMemories;
    /**
     * Search visual memories
     */
    search: typeof searchVisualMemories;
    /**
     * Delete a visual memory
     */
    delete: typeof deleteVisualMemory;
    /**
     * Get user's visual memory preferences
     */
    getPreferences: typeof getVisualPreferences;
    /**
     * Update user's visual memory preferences
     */
    updatePreferences: typeof updateVisualPreferences;
    /**
     * Build visual context for a user
     */
    buildContext: typeof buildVisualContext;
    /**
     * Get visual context injection for LLM
     */
    getContextInjection: typeof getVisualContextInjection;
    /**
     * Check if visual memory is enabled for user
     */
    isEnabled: (userId: string) => Promise<boolean>;
    /**
     * Enable visual memory for user
     */
    enable: (userId: string) => Promise<void>;
    /**
     * Disable visual memory for user
     */
    disable: (userId: string) => Promise<void>;
    /**
     * Count visual memories for user
     */
    count: (userId: string) => Promise<number>;
};
import type { ContextInjection } from '../../intelligence/context-builders/core/types.js';
/**
 * Build visual memory awareness context injection
 *
 * Priority: 74 (below health at 76, above general at 70)
 */
export declare function buildVisualMemoryInjection(userId: string): Promise<ContextInjection | null>;
export default visualMemory;
//# sourceMappingURL=index.d.ts.map