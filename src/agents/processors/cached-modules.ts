/**
 * Cached Module Getters
 *
 * Lazy-loaded module caching for performance optimization.
 * These modules are loaded once and cached for the lifetime of the process.
 */

import type { CachedModules } from './types.js';

// ============================================================================
// CACHED IMPORTS - Lazy loaded once for performance
// ============================================================================

const cachedModules: CachedModules = {
  buildConversationContext: null,
  formatContextForPrompt: null,
  shouldUseHighEmotionMode: null,
  checkForEasterEgg: null,
  getTaskManager: null,
};

// ============================================================================
// CACHED MODULE GETTERS
// ============================================================================

/**
 * Get context builder functions (lazy loaded)
 */
export async function getContextBuilders() {
  if (!cachedModules.buildConversationContext) {
    const mod = await import('../../intelligence/context-builders/index.js');
    cachedModules.buildConversationContext = mod.buildConversationContext;
    cachedModules.formatContextForPrompt = mod.formatContextForPrompt;
    // BETTER-THAN-HUMAN: Import high emotion mode detection
    cachedModules.shouldUseHighEmotionMode = mod.shouldUseHighEmotionMode;
  }
  return {
    buildConversationContext: cachedModules.buildConversationContext!,
    formatContextForPrompt: cachedModules.formatContextForPrompt!,
    shouldUseHighEmotionMode: cachedModules.shouldUseHighEmotionMode!,
  };
}

/**
 * Get easter egg checker function (lazy loaded)
 */
export async function getEasterEggChecker() {
  if (!cachedModules.checkForEasterEgg) {
    const mod = await import('../../personas/easter-eggs.js');
    cachedModules.checkForEasterEgg = mod.checkForEasterEgg;
  }
  return cachedModules.checkForEasterEgg!;
}

/**
 * Get task manager (lazy loaded)
 */
export async function getTaskManagerCached() {
  if (!cachedModules.getTaskManager) {
    const mod = await import('../../tasks/task-manager.js');
    cachedModules.getTaskManager = mod.getTaskManager;
  }
  return cachedModules.getTaskManager!();
}
