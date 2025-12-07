/**
 * Logger utility - re-exports from safe-logger for backwards compatibility
 *
 * DEPRECATED: Import directly from './safe-logger.js' instead.
 */
import { getLogger as _getLogger, safeLog as _safeLog } from './safe-logger.js';

export const getLogger = _getLogger;
export const safeLog = _safeLog;
export default _getLogger;

/**
 * Alias for backwards compatibility with code using createLogger pattern
 * @deprecated Use getLogger() instead
 */
export function createLogger(_options?: { module?: string }) {
  // The module option is ignored since safe-logger handles namespacing differently
  return _getLogger();
}
