/**
 * Locale Persistence Utilities
 *
 * Re-exports persistence functions from browser.ts for convenience.
 * This module exists for explicit imports when only persistence is needed.
 */

export {
  persistLocale,
  getPersistedLocale,
  clearPersistedLocale,
  getLocaleFromCookie,
} from './browser.js';
