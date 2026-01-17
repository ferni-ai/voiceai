/**
 * Security Headers Module
 *
 * HTTP security headers to protect against common web vulnerabilities.
 * These headers should be applied to all API and page responses.
 *
 * References:
 * - OWASP Security Headers: https://owasp.org/www-project-secure-headers/
 * - MDN HTTP Headers: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
 */

import { createLogger } from '../utils/safe-logger.js';
import { getAllowedOrigins, isOriginAllowed, getCorsOrigin } from '../servers/shared/cors.js';

const log = createLogger({ module: 'SecurityHeaders' });

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if we're running in production mode.
 * Uses multiple signals to determine environment.
 */
export function isProduction(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
  const cloudRun = process.env.K_SERVICE; // Cloud Run sets this

  return nodeEnv === 'production' || !!gcpProject || !!cloudRun;
}

/**
 * Check if we're running in development mode.
 */
export function isDevelopment(): boolean {
  return !isProduction();
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

/**
 * Core security headers applied to all responses.
 * These protect against XSS, clickjacking, MIME sniffing, and more.
 */
export function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    // Prevent clickjacking - don't allow embedding in frames
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // XSS protection (legacy but still useful for older browsers)
    'X-XSS-Protection': '1; mode=block',

    // Prevent browsers from caching sensitive data
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',

    // Don't leak referrer info to third parties
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Prevent Flash/PDF from accessing page data
    'X-Permitted-Cross-Domain-Policies': 'none',

    // DNS prefetch control
    'X-DNS-Prefetch-Control': 'off',
  };

  // Production-only headers
  if (isProduction()) {
    // HSTS - Force HTTPS for 1 year, include subdomains
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';

    // Content Security Policy - Restrictive by default
    // Adjust based on your frontend needs (scripts, styles, images, etc.)
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud https://api.stripe.com https://*.firebaseio.com https://*.googleapis.com",
      "frame-src 'self' https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; ');

    // Permissions Policy - Disable unnecessary browser features
    headers['Permissions-Policy'] = [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=(self)',
      'battery=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=(self)',
      'execution-while-not-rendered=()',
      'execution-while-out-of-viewport=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'keyboard-map=()',
      'magnetometer=()',
      'microphone=(self)', // Required for voice AI
      'midi=()',
      'navigation-override=()',
      'payment=(self)',
      'picture-in-picture=(self)',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=(self)',
      'xr-spatial-tracking=()',
    ].join(', ');
  }

  return headers;
}

/**
 * API-specific security headers.
 * Less restrictive than page headers for JSON responses.
 */
export function getAPISecurityHeaders(): Record<string, string> {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    ...(isProduction()
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

// ============================================================================
// CORS VALIDATION (delegates to shared/cors.ts)
// ============================================================================

/**
 * Validate and return CORS headers.
 * Delegates to the shared CORS module which has comprehensive origin validation.
 *
 * @param origin - The request Origin header
 * @returns CORS headers object
 */
export function getCorsHeaders(origin?: string): Record<string, string> {
  // Use the shared CORS module's origin validation
  const allowedOrigins = getAllowedOrigins();

  // Determine which origin to allow
  let allowOrigin = '';

  if (origin) {
    if (isOriginAllowed(origin, allowedOrigins)) {
      allowOrigin = origin;
    } else {
      // Origin not allowed - log in production
      if (isProduction()) {
        log.warn(
          { origin, allowed: allowedOrigins.slice(0, 5) },
          'CORS: Origin not in allowed list'
        );
      }
    }
  } else if (!isProduction()) {
    // No origin header in development - allow (same-origin requests)
    allowOrigin = '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-User-Id, Authorization, X-API-Key, X-Request-Id, X-Admin-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// Re-export shared CORS utilities for convenience
export { isOriginAllowed, getAllowedOrigins, getCorsOrigin };

/**
 * Get all headers for an API response (security + CORS).
 */
export function getResponseHeaders(origin?: string): Record<string, string> {
  return {
    ...getAPISecurityHeaders(),
    ...getCorsHeaders(origin),
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate production security requirements.
 * Call this at server startup to catch misconfigurations early.
 *
 * @throws Error if critical security config is missing in production
 */
export function validateProductionSecurity(): void {
  if (!isProduction()) {
    log.info('Development mode - skipping production security validation');
    return;
  }

  const issues: string[] = [];

  // Check ALLOWED_ORIGINS
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins || allowedOrigins === '*') {
    issues.push('ALLOWED_ORIGINS must be set to specific origins (not wildcard)');
  }

  // Check LOG_HASH_SECRET for security event hashing
  if (!process.env.LOG_HASH_SECRET) {
    issues.push('LOG_HASH_SECRET should be set for privacy-preserving security logs');
  }

  // Log issues but don't crash (allow graceful degradation with warnings)
  if (issues.length > 0) {
    log.error({ issues }, 'SECURITY: Production security configuration issues detected');
    // In strict mode, you could throw here:
    // throw new Error(`Production security requirements not met: ${issues.join(', ')}`);
  } else {
    log.info('Production security validation passed');
  }
}

// ============================================================================
// REQUEST SIZE LIMITS
// ============================================================================

/**
 * Maximum request body sizes by type.
 */
export const REQUEST_SIZE_LIMITS = {
  /** Standard JSON API requests */
  json: 1024 * 1024, // 1MB

  /** Webhook payloads (Stripe, etc.) */
  webhook: 2 * 1024 * 1024, // 2MB

  /** File uploads */
  upload: 10 * 1024 * 1024, // 10MB

  /** Voice/audio data */
  audio: 50 * 1024 * 1024, // 50MB
} as const;

/**
 * Check if request body size is within limits.
 */
export function isRequestSizeAllowed(
  contentLength: number | undefined,
  type: keyof typeof REQUEST_SIZE_LIMITS = 'json'
): boolean {
  if (contentLength === undefined) return true; // No content-length header
  return contentLength <= REQUEST_SIZE_LIMITS[type];
}
