/**
 * Lazy Services Registry
 *
 * Registry of heavy/rarely-used services that should be loaded on-demand.
 * This reduces cold start time and memory usage by deferring loading
 * until the service is actually needed.
 *
 * This file is in the services layer because it contains business logic
 * about WHICH services to load lazily and WHEN to preload them.
 * The utility function `lazyService()` remains in utils layer.
 *
 * @module services/lazy-registry
 */

import { lazyService } from '../../utils/lazy-service.js';

/**
 * Lazy services registry for heavy/rarely-used services.
 *
 * These services are loaded on-demand instead of at startup:
 * - Landing Intelligence (Gemini-powered, only used for marketing)
 * - Scientific Knowledge (large knowledge base)
 * - Predictive Insights (ML models)
 * - Wisdom Synthesis (complex aggregation)
 * - Behavioral Economics (nudge patterns)
 * - Somatic Intelligence (body awareness)
 */
export const lazyServices = {
  /**
   * Landing page optimization with Gemini
   * Only used when someone visits the marketing site
   */
  landingIntelligence: lazyService(async () => import('../landing-intelligence/index.js'), {
    name: 'landing-intelligence',
    preloadDelay: 30000,
  }),

  /**
   * Scientific knowledge base
   * Only used for research-related queries
   */
  scientificKnowledge: lazyService(async () => import('../scientific-knowledge/index.js'), {
    name: 'scientific-knowledge',
  }),

  /**
   * Predictive insights engine
   * Only used for analytics dashboards
   */
  predictiveInsights: lazyService(async () => import('../predictive-insights/index.js'), {
    name: 'predictive-insights',
  }),

  /**
   * Wisdom synthesis service
   * Only used for wisdom aggregation jobs
   */
  wisdomSynthesis: lazyService(async () => import('../wisdom-synthesis/index.js'), {
    name: 'wisdom-synthesis',
  }),

  /**
   * Behavioral economics patterns
   * Only used for nudge recommendations
   */
  behavioralEconomics: lazyService(async () => import('../behavioral-economics/index.js'), {
    name: 'behavioral-economics',
  }),

  /**
   * Somatic intelligence (body awareness)
   * Only used for wellness coaching
   */
  somaticIntelligence: lazyService(async () => import('../somatic-intelligence/index.js'), {
    name: 'somatic-intelligence',
  }),
};

export type LazyServices = typeof lazyServices;

export default lazyServices;
