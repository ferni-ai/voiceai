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
import { getAllowedOrigins, isOriginAllowed, getCorsOrigin } from '../servers/shared/cors.js';
/**
 * Check if we're running in production mode.
 * Uses multiple signals to determine environment.
 */
export declare function isProduction(): boolean;
/**
 * Check if we're running in development mode.
 */
export declare function isDevelopment(): boolean;
/**
 * Core security headers applied to all responses.
 * These protect against XSS, clickjacking, MIME sniffing, and more.
 */
export declare function getSecurityHeaders(): Record<string, string>;
/**
 * API-specific security headers.
 * Less restrictive than page headers for JSON responses.
 */
export declare function getAPISecurityHeaders(): Record<string, string>;
/**
 * Validate and return CORS headers.
 * Delegates to the shared CORS module which has comprehensive origin validation.
 *
 * @param origin - The request Origin header
 * @returns CORS headers object
 */
export declare function getCorsHeaders(origin?: string): Record<string, string>;
export { isOriginAllowed, getAllowedOrigins, getCorsOrigin };
/**
 * Get all headers for an API response (security + CORS).
 */
export declare function getResponseHeaders(origin?: string): Record<string, string>;
/**
 * Validate production security requirements.
 * Call this at server startup to catch misconfigurations early.
 *
 * @throws Error if critical security config is missing in production
 */
export declare function validateProductionSecurity(): void;
/**
 * Maximum request body sizes by type.
 */
export declare const REQUEST_SIZE_LIMITS: {
    /** Standard JSON API requests */
    readonly json: number;
    /** Webhook payloads (Stripe, etc.) */
    readonly webhook: number;
    /** File uploads */
    readonly upload: number;
    /** Voice/audio data */
    readonly audio: number;
};
/**
 * Check if request body size is within limits.
 */
export declare function isRequestSizeAllowed(contentLength: number | undefined, type?: keyof typeof REQUEST_SIZE_LIMITS): boolean;
//# sourceMappingURL=security-headers.d.ts.map