/**
 * Cached Module Getters
 *
 * Lazy-loaded module caching for performance optimization.
 * These modules are loaded once and cached for the lifetime of the process.
 */

import type { buildIntegratedContext as BuildIntegratedContextFn } from '../../intelligence/context-builders/behavioral/integration.js';

// ============================================================================
// CACHED IMPORTS - Lazy loaded once for performance
// ============================================================================

interface CachedModuleRefs {
  buildIntegratedContext: typeof BuildIntegratedContextFn | null;
  checkForEasterEgg: typeof import('../../personas/easter-eggs.js').checkForEasterEgg | null;
  getTaskManager: typeof import('../../tasks/task-manager.js').getTaskManager | null;
}

const cachedModules: CachedModuleRefs = {
  buildIntegratedContext: null,
  checkForEasterEgg: null,
  getTaskManager: null,
};

// ============================================================================
// CACHED MODULE GETTERS
// ============================================================================

/**
 * Get behavioral context builder (lazy loaded)
 *
 * This is the context system that produces:
 * 1. Behavioral directive (HOW to behave) - no leakage risk
 * 2. Awareness facts (WHAT to know) - model should use these
 * 3. Tool guidance (WHEN to query) - teaches tool usage
 */
export async function getBehavioralContextBuilder() {
  if (!cachedModules.buildIntegratedContext) {
    const mod = await import('../../intelligence/context-builders/behavioral/integration.js');
    cachedModules.buildIntegratedContext = mod.buildIntegratedContext;
  }
  return cachedModules.buildIntegratedContext!;
}

/**
 * Get easter egg checker function (lazy loaded)
 */
export async function getEasterEggChecker(): Promise<
  NonNullable<CachedModuleRefs['checkForEasterEgg']>
> {
  if (!cachedModules.checkForEasterEgg) {
    const mod = await import('../../personas/easter-eggs.js');
    cachedModules.checkForEasterEgg = mod.checkForEasterEgg;
  }
  return cachedModules.checkForEasterEgg!;
}

/**
 * Get task manager (lazy loaded)
 */
export async function getTaskManagerCached(): Promise<
  ReturnType<NonNullable<CachedModuleRefs['getTaskManager']>>
> {
  if (!cachedModules.getTaskManager) {
    const mod = await import('../../tasks/task-manager.js');
    cachedModules.getTaskManager = mod.getTaskManager;
  }
  return cachedModules.getTaskManager!();
}
