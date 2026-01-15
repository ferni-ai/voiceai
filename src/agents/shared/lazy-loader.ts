/**
 * Lazy Module Loader
 *
 * Defers heavy module loading until actually needed.
 * This dramatically speeds up child process startup for LiveKit workers.
 *
 * Usage:
 * ```ts
 * // Instead of: import { foo } from 'heavy-module';
 * const { foo } = await LazyLoader.get('heavy-module');
 * ```
 *
 * Benefits:
 * - Child processes start in <1 second (vs 30+ seconds)
 * - Only loads what's needed for each session
 * - Caches loaded modules for reuse
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LazyLoader' });

// ============================================================================
// TYPES
// ============================================================================

interface LoadedModule {
  module: unknown;
  loadedAt: number;
  loadTimeMs: number;
}

type ModuleLoader = () => Promise<unknown>;

// ============================================================================
// MODULE REGISTRY
// ============================================================================

/**
 * Registry of lazy-loadable modules.
 * Add new heavy modules here to enable deferred loading.
 */
const MODULE_LOADERS: Record<string, ModuleLoader> = {
  // LiveKit plugins (heavy - loads ONNX models, AI SDKs)
  '@livekit/agents-plugin-google': async () => import('@livekit/agents-plugin-google'),
  '@livekit/agents-plugin-silero': async () => import('@livekit/agents-plugin-silero'),
  '@livekit/noise-cancellation-node': async () => import('@livekit/noise-cancellation-node'),
  '@google/genai': async () => import('@google/genai'),

  // Speech services
  'speech/voice-manager': async () => import('../../speech/voice-manager.js'),
  'speech/audio-prosody': async () => import('../../speech/audio-prosody.js'),
  'speech/adaptive-ssml': async () => import('../../speech/adaptive-ssml.js'),
  'speech/voice-humanization': async () => import('../../speech/voice-humanization.js'),
  'speech/ambient-awareness': async () => import('../../speech/ambient-awareness.js'),
  'speech/emotional-contagion': async () => import('../../speech/emotional-contagion.js'),
  'speech/multi-signal-laughter': async () => import('../../speech/multi-signal-laughter.js'),

  // Services
  'services/conversation-manager': async () => import('../../services/conversation-manager.js'),
  'services/cognitive-session-hooks': async () =>
    import('../../services/cognitive-session-hooks.js'),
  'services/emotion-analysis/hume': async () => import('../../services/emotion-analysis/hume.js'),
  'services/voice-speaker-change': async () =>
    import('../../services/voice/voice-speaker-change.js'),

  // Tools
  'tools/auto-optimizer': async () => import('../../tools/optimization/auto-optimizer.js'),
  'tools/dynamic-loader': async () => import('../../tools/dynamic-loader.js'),
  'tools/feedback-collector': async () => import('../../tools/optimization/feedback-collector.js'),
  'tools/pattern-analyzer': async () => import('../../tools/optimization/pattern-analyzer.js'),

  // Audio
  'audio/index': async () => import('../../audio/index.js'),

  // SSML
  'ssml/index': async () => import('../../ssml/index.js'),

  // Personas
  'personas/index': async () => import('../../personas/index.js'),

  // Intelligence
  'intelligence/context-builders': async () =>
    import('../../intelligence/context-builders/index.js'),

  // Trust systems
  'services/trust-systems': async () => import('../../services/trust-systems/index.js'),
};

// ============================================================================
// LAZY LOADER
// ============================================================================

class LazyLoaderClass {
  private cache = new Map<string, LoadedModule>();
  private loading = new Map<string, Promise<unknown>>();
  private initialized = false;

  /**
   * Get a lazy-loaded module.
   * Returns cached module if already loaded, otherwise loads it.
   */
  async get<T = unknown>(moduleId: string): Promise<T> {
    // Check cache first
    const cached = this.cache.get(moduleId);
    if (cached) {
      return cached.module as T;
    }

    // Check if already loading (prevent duplicate loads)
    const existingLoad = this.loading.get(moduleId);
    if (existingLoad) {
      return existingLoad as Promise<T>;
    }

    // Get loader
    const loader = MODULE_LOADERS[moduleId];
    if (!loader) {
      throw new Error(`Unknown lazy module: ${moduleId}. Add it to MODULE_LOADERS.`);
    }

    // Load module
    const loadPromise = this.loadModule(moduleId, loader);
    this.loading.set(moduleId, loadPromise);

    try {
      const module = await loadPromise;
      return module as T;
    } finally {
      this.loading.delete(moduleId);
    }
  }

  /**
   * Preload multiple modules in parallel.
   * Use this at the start of entry() to load all needed modules at once.
   */
  async preload(moduleIds: string[]): Promise<void> {
    const start = Date.now();

    await Promise.all(
      moduleIds.map(async (id) =>
        this.get(id).catch((err) => {
          log.warn({ moduleId: id, error: String(err) }, 'Failed to preload module');
        })
      )
    );

    log.debug(
      {
        count: moduleIds.length,
        elapsedMs: Date.now() - start,
      },
      'Modules preloaded'
    );
  }

  /**
   * Check if a module is already loaded.
   */
  isLoaded(moduleId: string): boolean {
    return this.cache.has(moduleId);
  }

  /**
   * Get load statistics.
   */
  getStats(): { loaded: number; totalLoadTimeMs: number; modules: string[] } {
    let totalLoadTimeMs = 0;
    const modules: string[] = [];

    for (const [id, entry] of this.cache.entries()) {
      totalLoadTimeMs += entry.loadTimeMs;
      modules.push(id);
    }

    return {
      loaded: this.cache.size,
      totalLoadTimeMs,
      modules,
    };
  }

  /**
   * Clear the cache (useful for testing).
   */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
  }

  private async loadModule(moduleId: string, loader: ModuleLoader): Promise<unknown> {
    const start = Date.now();

    try {
      const module = await loader();
      const loadTimeMs = Date.now() - start;

      this.cache.set(moduleId, {
        module,
        loadedAt: Date.now(),
        loadTimeMs,
      });

      if (loadTimeMs > 100) {
        log.debug({ moduleId, loadTimeMs }, 'Loaded heavy module');
      }

      return module;
    } catch (error) {
      log.error({ moduleId, error: String(error) }, 'Failed to load module');
      throw error;
    }
  }
}

// Singleton instance
export const LazyLoader = new LazyLoaderClass();

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Preload essential modules for voice session.
 * Call this at the start of entry() function.
 */
export async function preloadSessionModules(): Promise<void> {
  await LazyLoader.preload([
    '@livekit/agents-plugin-google',
    '@livekit/agents-plugin-silero',
    '@livekit/noise-cancellation-node',
    '@google/genai',
    'speech/voice-manager',
    'personas/index',
    'ssml/index',
  ]);
}

/**
 * Preload modules for humanization features.
 * Call this after initial greeting if humanization is enabled.
 */
export async function preloadHumanizationModules(): Promise<void> {
  await LazyLoader.preload([
    'speech/voice-humanization',
    'speech/emotional-contagion',
    'speech/ambient-awareness',
    'speech/multi-signal-laughter',
    'services/emotion-analysis/hume',
  ]);
}

/**
 * Preload modules for tools and analytics.
 * Call this in background after session starts.
 */
export async function preloadToolModules(): Promise<void> {
  await LazyLoader.preload([
    'tools/auto-optimizer',
    'tools/dynamic-loader',
    'tools/feedback-collector',
    'tools/pattern-analyzer',
  ]);
}

export default LazyLoader;
