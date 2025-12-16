/**
 * Environment Detection Utility
 *
 * Centralized utility for detecting runtime environment (development vs production).
 * Use this throughout the frontend for consistent environment-aware behavior.
 *
 * Usage:
 *   import { isDevelopment, isProduction, getEnvironment } from '../utils/environment.js';
 *
 *   if (isDevelopment()) {
 *     // Dev-only behavior
 *   }
 */

import { createLogger } from './logger.js';

const log = createLogger('Environment');

// ============================================================================
// TYPES
// ============================================================================

export type Environment = 'development' | 'production' | 'staging';

// ============================================================================
// DETECTION
// ============================================================================

// Vite environment interface
interface ViteEnv {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  VITE_VAPID_PUBLIC_KEY?: string;
}

interface ViteImportMeta {
  env?: ViteEnv;
}

/**
 * Detect the current runtime environment.
 *
 * Detection order:
 * 1. Vite's import.meta.env.MODE (if available)
 * 2. Hostname-based detection (localhost = dev)
 * 3. Default to production (fail-safe)
 */
export function getEnvironment(): Environment {
  // Check Vite environment variable first
  const meta = import.meta as unknown as ViteImportMeta;
  if (meta?.env?.MODE) {
    const mode = meta.env.MODE;
    if (mode === 'development') return 'development';
    if (mode === 'staging') return 'staging';
    return 'production';
  }

  // Fall back to hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Development hostnames
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      return 'development';
    }

    // Staging hostnames (customize as needed)
    if (
      hostname.includes('staging') ||
      hostname.includes('preview') ||
      hostname.includes('-dev.')
    ) {
      return 'staging';
    }
  }

  // Default to production (fail-safe for user-facing code)
  return 'production';
}

// Cache the environment on first call (it won't change during runtime)
let cachedEnvironment: Environment | null = null;

function getCachedEnvironment(): Environment {
  if (cachedEnvironment === null) {
    cachedEnvironment = getEnvironment();
    log.debug(`Environment detected: ${cachedEnvironment}`);
  }
  return cachedEnvironment;
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Check if running in development mode.
 * Use for: debug logging, mock data, dev tools, etc.
 */
export function isDevelopment(): boolean {
  return getCachedEnvironment() === 'development';
}

/**
 * Check if running in production mode.
 * Use for: real API calls, analytics, error tracking, etc.
 */
export function isProduction(): boolean {
  return getCachedEnvironment() === 'production';
}

/**
 * Check if running in staging mode.
 * Use for: pre-production testing with real services.
 */
export function isStaging(): boolean {
  return getCachedEnvironment() === 'staging';
}

/**
 * Check if NOT in production (dev or staging).
 * Use for: features safe to test in non-production environments.
 */
export function isNonProduction(): boolean {
  return !isProduction();
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Check if demo/mock data should be used.
 *
 * Returns true in development, or when explicitly enabled via localStorage.
 * In production, NEVER returns true unless explicitly overridden.
 */
export function shouldUseDemoData(): boolean {
  // Check explicit override first
  try {
    const override = localStorage.getItem('ferni:use-demo-data');
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // localStorage not available
  }

  // Default: demo data only in development
  return isDevelopment();
}

/**
 * Check if verbose/debug features should be enabled.
 */
export function shouldShowDebugFeatures(): boolean {
  // Check explicit override
  try {
    const override = localStorage.getItem('ferni:debug-mode');
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // localStorage not available
  }

  // Default: debug features in development and staging
  return isNonProduction();
}

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

/**
 * Get handoff timeout based on environment.
 * Development: 8 seconds (faster iteration)
 * Staging: 12 seconds (slightly longer for testing)
 * Production: 15 seconds (account for real network conditions)
 */
export function getHandoffTimeoutMs(): number {
  const env = getCachedEnvironment();
  switch (env) {
    case 'development':
      return 8_000;
    case 'staging':
      return 12_000;
    case 'production':
    default:
      return 15_000;
  }
}

/**
 * Get cameo timeout based on environment.
 */
export function getCameoTimeoutMs(): number {
  const env = getCachedEnvironment();
  switch (env) {
    case 'development':
      return 20_000;
    case 'staging':
      return 25_000;
    case 'production':
    default:
      return 30_000;
  }
}

// ============================================================================
// RUNTIME CONFIGURATION
// ============================================================================

/**
 * Force demo data mode (for testing in production).
 * WARNING: Should only be used for internal testing/demos.
 */
export function enableDemoDataOverride(): void {
  try {
    localStorage.setItem('ferni:use-demo-data', 'true');
    log.warn('Demo data override ENABLED - reload page to take effect');
  } catch {
    log.error('Could not enable demo data override');
  }
}

/**
 * Disable demo data override (restore normal behavior).
 */
export function disableDemoDataOverride(): void {
  try {
    localStorage.removeItem('ferni:use-demo-data');
    log.info('Demo data override disabled - reload page to take effect');
  } catch {
    log.error('Could not disable demo data override');
  }
}

// ============================================================================
// EXPOSE FOR DEBUGGING
// ============================================================================

// Expose environment functions globally for debugging in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ferniEnv = {
    get: getCachedEnvironment,
    isDev: isDevelopment,
    isProd: isProduction,
    isStaging,
    shouldUseDemoData,
    enableDemoData: enableDemoDataOverride,
    disableDemoData: disableDemoDataOverride,
  };
}

export default {
  getEnvironment: getCachedEnvironment,
  isDevelopment,
  isProduction,
  isStaging,
  isNonProduction,
  shouldUseDemoData,
  shouldShowDebugFeatures,
  enableDemoDataOverride,
  disableDemoDataOverride,
};
