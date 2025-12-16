/**
 * Frontend Logger Utility
 * 
 * A structured logging utility for the frontend that:
 * - Can be disabled in production via environment or runtime config
 * - Supports log levels (debug, info, warn, error)
 * - Provides namespaced loggers for different modules
 * - Respects user preferences for verbose logging
 * 
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('HandoffService');
 *   log.debug('Processing handoff', { personaId });
 *   log.info('Handoff complete');
 *   log.warn('Rate limited');
 *   log.error('Handoff failed', error);
 */

// ============================================================================
// TYPES
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

interface LoggerConfig {
  level: LogLevel;
  enabledNamespaces: Set<string> | 'all';
  showTimestamps: boolean;
}

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

// Detect production mode
const isProduction = typeof window !== 'undefined' && 
  (window.location.hostname !== 'localhost' && 
   !window.location.hostname.includes('127.0.0.1'));

// Default config - can be overridden at runtime
const config: LoggerConfig = {
  level: isProduction ? 'warn' : 'debug',
  enabledNamespaces: 'all',
  showTimestamps: false,
};

// Check localStorage for user preference
try {
  const stored = localStorage.getItem('ferni:log-level');
  if (stored && stored in LOG_LEVELS) {
    config.level = stored as LogLevel;
  }
  
  const namespaces = localStorage.getItem('ferni:log-namespaces');
  if (namespaces) {
    config.enabledNamespaces = new Set(namespaces.split(',').map(s => s.trim()));
  }
} catch {
  // localStorage not available (SSR or restricted)
}

// ============================================================================
// LOGGER FACTORY
// ============================================================================

/**
 * Create a namespaced logger instance
 */
export function createLogger(namespace: string): Logger {
  const shouldLog = (level: LogLevel): boolean => {
    // Check level
    if (LOG_LEVELS[level] < LOG_LEVELS[config.level]) {
      return false;
    }
    
    // Check namespace
    if (config.enabledNamespaces !== 'all' && !config.enabledNamespaces.has(namespace)) {
      return false;
    }
    
    return true;
  };

  const formatMessage = (level: LogLevel, args: unknown[]): unknown[] => {
    const prefix = config.showTimestamps
      ? `[${new Date().toISOString()}] [${namespace}]`
      : `[${namespace}]`;
    
    // Add level indicator for non-console methods
    const levelPrefix = level === 'debug' ? '🔍' : 
                        level === 'info' ? 'ℹ️' :
                        level === 'warn' ? '⚠️' :
                        level === 'error' ? '❌' : '';
    
    return [levelPrefix, prefix, ...args];
  };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug(...formatMessage('debug', args));
      }
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) {
        console.info(...formatMessage('info', args));
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(...formatMessage('warn', args));
      }
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(...formatMessage('error', args));
      }
    },
  };
}

// ============================================================================
// RUNTIME CONFIGURATION
// ============================================================================

/**
 * Set the global log level at runtime
 */
export function setLogLevel(level: LogLevel): void {
  config.level = level;
  try {
    localStorage.setItem('ferni:log-level', level);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Enable logging for specific namespaces only
 */
export function setEnabledNamespaces(namespaces: string[] | 'all'): void {
  config.enabledNamespaces = namespaces === 'all' ? 'all' : new Set(namespaces);
  try {
    if (namespaces === 'all') {
      localStorage.removeItem('ferni:log-namespaces');
    } else {
      localStorage.setItem('ferni:log-namespaces', namespaces.join(','));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get current log level
 */
export function getLogLevel(): LogLevel {
  return config.level;
}

// ============================================================================
// DEFAULT LOGGER
// ============================================================================

/**
 * Default logger for quick use
 */
export const log = createLogger('App');

// ============================================================================
// EXPOSE FOR DEBUGGING
// ============================================================================

// Expose config functions globally for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ferniLogger = {
    setLevel: setLogLevel,
    setNamespaces: setEnabledNamespaces,
    getLevel: getLogLevel,
  };
}

