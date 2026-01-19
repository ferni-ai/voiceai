/**
 * Security Headers Configuration
 *
 * Implements OWASP security header recommendations:
 * - HSTS (HTTP Strict Transport Security)
 * - CSP (Content Security Policy)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SecurityHeaders' });

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  /** Enable HSTS (default: true in production) */
  hsts?: boolean;
  /** HSTS max-age in seconds (default: 1 year) */
  hstsMaxAge?: number;
  /** Include subdomains in HSTS (default: true) */
  hstsIncludeSubdomains?: boolean;
  /** Enable CSP (default: true) */
  csp?: boolean;
  /** Custom CSP directives */
  cspDirectives?: Record<string, string[]>;
  /** Enable X-Frame-Options (default: true) */
  frameOptions?: boolean;
  /** X-Frame-Options value (default: DENY) */
  frameOptionsValue?: 'DENY' | 'SAMEORIGIN';
  /** Enable X-Content-Type-Options (default: true) */
  contentTypeOptions?: boolean;
  /** Enable Referrer-Policy (default: true) */
  referrerPolicy?: boolean;
  /** Referrer-Policy value */
  referrerPolicyValue?: string;
  /** Enable Permissions-Policy (default: true) */
  permissionsPolicy?: boolean;
}

/**
 * Default CSP directives
 */
const DEFAULT_CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  // SECURITY: Removed 'unsafe-inline' and 'unsafe-eval' - these bypass CSP protections
  // Use nonces for inline scripts: add 'nonce-{random}' to script tags and CSP
  // 'strict-dynamic' allows trusted scripts to load other scripts
  'script-src': ["'self'", "'strict-dynamic'", 'https://apis.google.com', 'https://cdn.jsdelivr.net'],
  // SECURITY: Removed 'unsafe-inline' for styles - use nonces or hashes instead
  'style-src': ["'self'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'connect-src': [
    "'self'",
    'https://*.livekit.cloud',
    'wss://*.livekit.cloud',
    'https://*.firebaseio.com',
    'https://*.googleapis.com',
    'https://api.stripe.com',
    'https://api.cartesia.ai',
    'https://api.openai.com',
    'https://cdn.jsdelivr.net',
    'https://fonts.gstatic.com', // Required for service worker font caching
  ],
  'media-src': ["'self'", 'blob:', 'https:'],
  'object-src': ["'none'"],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
};

/**
 * Build CSP header value from directives
 */
function buildCspHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Default Permissions-Policy
 */
const DEFAULT_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=(self)',
  'battery=()',
  'camera=()',
  'cross-origin-isolated=()',
  'display-capture=()',
  'document-domain=()',
  'encrypted-media=()',
  'execution-while-not-rendered=()',
  'execution-while-out-of-viewport=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'keyboard-map=()',
  'magnetometer=()',
  'microphone=(self)', // Needed for voice
  'midi=()',
  'navigation-override=()',
  'payment=()',
  'picture-in-picture=(self)',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'sync-xhr=(self)',
  'usb=()',
  'web-share=(self)',
  'xr-spatial-tracking=()',
].join(', ');

/**
 * Check if running in production
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Set security headers on response
 */
export function setSecurityHeaders(res: ServerResponse, config: SecurityHeadersConfig = {}): void {
  const inProduction = isProduction();

  // HSTS - Only in production with HTTPS
  if ((config.hsts ?? inProduction) && inProduction) {
    const maxAge = config.hstsMaxAge ?? 31536000; // 1 year
    const includeSubdomains = config.hstsIncludeSubdomains ?? true;
    let hstsValue = `max-age=${maxAge}`;
    if (includeSubdomains) {
      hstsValue += '; includeSubDomains';
    }
    // Note: preload should only be added after verifying the site works with HSTS
    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  // CSP
  if (config.csp !== false) {
    const directives = {
      ...DEFAULT_CSP_DIRECTIVES,
      ...config.cspDirectives,
    };
    const cspHeader = buildCspHeader(directives);

    // Use Content-Security-Policy-Report-Only in development
    if (inProduction) {
      res.setHeader('Content-Security-Policy', cspHeader);
    } else {
      res.setHeader('Content-Security-Policy-Report-Only', cspHeader);
    }
  }

  // X-Frame-Options
  if (config.frameOptions !== false) {
    res.setHeader('X-Frame-Options', config.frameOptionsValue ?? 'DENY');
  }

  // X-Content-Type-Options
  if (config.contentTypeOptions !== false) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  // Referrer-Policy
  if (config.referrerPolicy !== false) {
    res.setHeader(
      'Referrer-Policy',
      config.referrerPolicyValue ?? 'strict-origin-when-cross-origin'
    );
  }

  // Permissions-Policy
  if (config.permissionsPolicy !== false) {
    res.setHeader('Permissions-Policy', DEFAULT_PERMISSIONS_POLICY);
  }

  // Additional security headers
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
}

/**
 * Create security headers middleware
 */
export function securityHeadersMiddleware(config?: SecurityHeadersConfig) {
  return (res: ServerResponse): void => {
    setSecurityHeaders(res, config);
  };
}

/**
 * Stricter CSP for API routes (no script execution)
 */
export const API_CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'none'"],
  'frame-ancestors': ["'none'"],
};

/**
 * Set API-specific security headers (stricter CSP)
 */
export function setApiSecurityHeaders(res: ServerResponse): void {
  setSecurityHeaders(res, {
    cspDirectives: API_CSP_DIRECTIVES,
    frameOptionsValue: 'DENY',
  });
}

/**
 * Validate and log security header configuration
 */
export function validateSecurityConfig(): void {
  const inProduction = isProduction();

  if (inProduction) {
    log.info('Security headers enabled for production');
  } else {
    log.debug('Security headers in report-only mode for development');
  }
}
