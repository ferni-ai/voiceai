/**
 * Semantic Router i18n Module
 *
 * Provides multilingual support for the semantic router through:
 * 1. Externalized locale files (phrases, patterns, keywords per language)
 * 2. Multilingual embeddings (language-agnostic semantic similarity)
 * 3. Hybrid routing (fast keywords + embedding fallback)
 *
 * @example
 * ```typescript
 * import { setLocale, mergeLocaleIntoTools, routeHybrid } from './i18n';
 *
 * // Load Spanish triggers
 * setLocale('es');
 * const localizedTools = await mergeLocaleIntoTools(tools);
 *
 * // Or use embedding-based routing (language-agnostic)
 * const result = await routeHybrid(userInput, tools, embeddingProvider);
 * ```
 *
 * @module semantic-router/i18n
 */

// Locale management
export {
  loadLocale,
  setLocale,
  getLocale,
  getAvailableLocales,
  getTriggersForTool,
  hydrateToolDefinition,
  mergeLocaleIntoTools,
  detectLanguage,
  autoDetectAndLoadLocale,
  preloadLocales,
  type LocaleTrigger,
  type LocaleFile,
  type LoadedLocales,
} from './loader.js';

// Multilingual embeddings
export {
  initializeMultilingualEmbeddings,
  routeMultilingual,
  routeHybrid,
  toolEmbeddingsCache,
  cosineSimilarity,
  type MultilingualConfig,
  type MultilingualRoutingResult,
} from './multilingual.js';

