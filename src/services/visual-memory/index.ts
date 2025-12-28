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

import { createLogger } from '../../utils/safe-logger.js';

// Re-export types
export type {
  VisualMemory,
  VisionAnalysisResult,
  VisualUploadRequest,
  VisualUploadResponse,
  VisualSearchRequest,
  VisualSearchResult,
  VisualMemoryContext,
  VisualMemoryPreferences,
} from './types.js';

// Re-export analysis functions
export {
  analyzeImage,
  generateImageDescription,
  categorizeImage,
  visionAnalysis,
} from './vision-analysis.js';

// Re-export store functions
export {
  uploadVisualMemory,
  getVisualMemory,
  getRecentVisualMemories,
  deleteVisualMemory,
  searchVisualMemories,
  getVisualPreferences,
  updateVisualPreferences,
  buildVisualContext,
  getVisualContextInjection,
  visualMemoryStore,
} from './visual-memory-store.js';

const log = createLogger({ module: 'visual-memory' });

// ============================================================================
// UNIFIED API
// ============================================================================

import {
  uploadVisualMemory,
  getVisualMemory,
  getRecentVisualMemories,
  searchVisualMemories,
  deleteVisualMemory,
  getVisualPreferences,
  updateVisualPreferences,
  buildVisualContext,
  getVisualContextInjection,
} from './visual-memory-store.js';
import type { VisualUploadRequest, VisualSearchRequest, VisualMemoryPreferences } from './types.js';

/**
 * Unified Visual Memory API
 */
export const visualMemory = {
  /**
   * Upload a visual memory
   */
  upload: uploadVisualMemory,

  /**
   * Get a specific visual memory
   */
  get: getVisualMemory,

  /**
   * Get recent visual memories
   */
  getRecent: getRecentVisualMemories,

  /**
   * Search visual memories
   */
  search: searchVisualMemories,

  /**
   * Delete a visual memory
   */
  delete: deleteVisualMemory,

  /**
   * Get user's visual memory preferences
   */
  getPreferences: getVisualPreferences,

  /**
   * Update user's visual memory preferences
   */
  updatePreferences: updateVisualPreferences,

  /**
   * Build visual context for a user
   */
  buildContext: buildVisualContext,

  /**
   * Get visual context injection for LLM
   */
  getContextInjection: getVisualContextInjection,

  /**
   * Check if visual memory is enabled for user
   */
  isEnabled: async (userId: string): Promise<boolean> => {
    const prefs = await getVisualPreferences(userId);
    return prefs?.enabled ?? false;
  },

  /**
   * Enable visual memory for user
   */
  enable: async (userId: string): Promise<void> => {
    await updateVisualPreferences(userId, {
      enabled: true,
      autoAnalyze: true,
      storePermanently: true,
      enableFaceDetection: false, // Privacy default
      enableLocationExtraction: false, // Privacy default
      defaultPrivate: false,
      autoDeleteDays: 0, // Never
    });
    log.info({ userId }, 'Visual memory enabled');
  },

  /**
   * Disable visual memory for user
   */
  disable: async (userId: string): Promise<void> => {
    await updateVisualPreferences(userId, {
      enabled: false,
    });
    log.info({ userId }, 'Visual memory disabled');
  },

  /**
   * Count visual memories for user
   */
  count: async (userId: string): Promise<number> => {
    const recent = await getRecentVisualMemories(userId, 1000);
    return recent.length;
  },
};

// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================

import type { ContextInjection } from '../../intelligence/context-builders/core/types.js';

/**
 * Build visual memory awareness context injection
 *
 * Priority: 74 (below health at 76, above general at 70)
 */
export async function buildVisualMemoryInjection(userId: string): Promise<ContextInjection | null> {
  try {
    const context = await buildVisualContext(userId);

    if (!context.hasVisualMemories) {
      return null;
    }

    const content = await getVisualContextInjection(userId);
    if (!content) return null;

    return {
      id: 'visual-memory',
      source: 'visual-memory',
      content,
      priority: 'standard',
      category: 'better-than-human',
      confidence: 0.8,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to build visual memory injection');
    return null;
  }
}

export default visualMemory;
