/**
 * Smart Injection Filter - Re-export from intelligence layer
 *
 * Canonical implementation lives in intelligence/utils/injection-filter.ts
 * so domain layers (context-routing) can import without depending on agents/.
 * This file re-exports for backward compatibility with turn-processor and other agents code.
 *
 * @module agents/processors/injection-filter
 */

export {
  filterInjections,
  deduplicateInjections,
  detectConversationMode,
  ESSENTIAL_CATEGORIES,
  OPTIONAL_CATEGORIES,
  MAX_INJECTIONS,
  MAX_TOTAL_CHARS,
  type ConversationMode,
  type FilterOptions,
} from '../../intelligence/utils/injection-filter.js';

export { default } from '../../intelligence/utils/injection-filter.js';
