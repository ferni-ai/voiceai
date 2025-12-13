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
        if (debug) console.log(`[lazy-service] Preloading ${name}...`);
        loadingPromise = loader().then((service) => {
          cachedService = service;
          loadingPromise = null;
          if (debug) console.log(`[lazy-service] Preloaded ${name}`);
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
    if (debug) console.log(`[lazy-service] Loading ${name}...`);
    const startTime = Date.now();

    loadingPromise = loader().then((service) => {
      cachedService = service;
      loadingPromise = null;
      if (debug) {
        const duration = Date.now() - startTime;
        console.log(`[lazy-service] Loaded ${name} in ${duration}ms`);
      }
      return service;
    });

    return loadingPromise;
  };
}

/**
 * Lazy services registry for heavy/rarely-used services
 *
 * These services are loaded on-demand instead of at startup:
 * - Landing Intelligence (Gemini-powered, only used for marketing)
 * - Scientific Knowledge (large knowledge base)
 * - Predictive Insights (ML models)
 * - Wisdom Synthesis (complex aggregation)
 */
export const lazyServices = {
  /**
   * Landing page optimization with Gemini
   * Only used when someone visits the marketing site
   */
  landingIntelligence: lazyService(
    () => import('../services/landing-intelligence/index.js'),
    { name: 'landing-intelligence', preloadDelay: 30000 }
  ),

  /**
   * Scientific knowledge base
   * Only used for research-related queries
   */
  scientificKnowledge: lazyService(
    () => import('../services/scientific-knowledge/index.js'),
    { name: 'scientific-knowledge' }
  ),

  /**
   * Predictive insights engine
   * Only used for analytics dashboards
   */
  predictiveInsights: lazyService(
    () => import('../services/predictive-insights/index.js'),
    { name: 'predictive-insights' }
  ),

  /**
   * Wisdom synthesis service
   * Only used for wisdom aggregation jobs
   */
  wisdomSynthesis: lazyService(
    () => import('../services/wisdom-synthesis/index.js'),
    { name: 'wisdom-synthesis' }
  ),

  /**
   * Behavioral economics patterns
   * Only used for nudge recommendations
   */
  behavioralEconomics: lazyService(
    () => import('../services/behavioral-economics/index.js'),
    { name: 'behavioral-economics' }
  ),

  /**
   * Somatic intelligence (body awareness)
   * Only used for wellness coaching
   */
  somaticIntelligence: lazyService(
    () => import('../services/somatic-intelligence/index.js'),
    { name: 'somatic-intelligence' }
  ),
};

export type LazyServices = typeof lazyServices;

