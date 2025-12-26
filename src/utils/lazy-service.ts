/**
 * Lazy Service Loader
 *
 * Defers loading of heavy services until they're actually needed.
 * This reduces cold start time and memory usage.
 *
 * Usage:
 *   const landingIntelligence = lazyService(() => import('../services/landing-intelligence/index.js'));
 *   // Later, when needed:
 *   const service = await landingIntelligence();
 *   service.optimizeLandingPage(...)
 *
 * Benefits:
 *   - Faster cold starts (don't load everything upfront)
 *   - Lower memory usage (only load what's used)
 *   - Better tree-shaking (dynamic imports are separate chunks)
 */

import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'lazy-service' });

type ServiceLoader<T> = () => Promise<T>;

interface LazyServiceOptions {
  /** Preload the service after this delay (ms). Set to 0 to disable preloading. */
  preloadDelay?: number;
  /** Log when the service is loaded */
  debug?: boolean;
  /** Service name for debugging */
  name?: string;
}

/**
 * Create a lazy-loaded service that only loads when first accessed
 */
export function lazyService<T>(
  loader: ServiceLoader<T>,
  options: LazyServiceOptions = {}
): () => Promise<T> {
  const { preloadDelay = 0, debug = false, name = 'unknown' } = options;

  let cachedService: T | null = null;
  let loadingPromise: Promise<T> | null = null;

  // Optional preloading after delay
  if (preloadDelay > 0) {
    setTimeout(() => {
      if (!cachedService && !loadingPromise) {
        if (debug) log.debug({ name }, 'Preloading service...');
        loadingPromise = loader().then((service) => {
          cachedService = service;
          loadingPromise = null;
          if (debug) log.debug({ name }, 'Preloaded service');
          return service;
        });
      }
    }, preloadDelay);
  }

  return async (): Promise<T> => {
    // Return cached service if available
    if (cachedService) {
      return cachedService;
    }

    // Return existing loading promise if loading
    if (loadingPromise) {
      return loadingPromise;
    }

    // Load the service
    if (debug) log.debug({ name }, 'Loading service...');
    const startTime = Date.now();

    loadingPromise = loader().then((service) => {
      cachedService = service;
      loadingPromise = null;
      if (debug) {
        const duration = Date.now() - startTime;
        log.debug({ name, duration }, 'Loaded service');
      }
      return service;
    });

    return loadingPromise;
  };
}

// NOTE: The lazyServices registry has been moved to src/services/lazy-registry.ts
// to follow proper architecture (business logic belongs in services layer).
// Use: services/lazy-registry.ts → lazyServices

export type { LazyServiceOptions };
