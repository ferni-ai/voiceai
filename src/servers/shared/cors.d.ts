/**
 * CORS Configuration (SINGLE SOURCE OF TRUTH)
 *
 * This module is the centralized CORS configuration for all Ferni servers.
 *
 * Usage:
 * - API routes: Use via src/api/security-headers.ts → getCorsHeaders()
 * - Route handlers: Use handleCorsPreflightRequest() and setCorsHeaders()
 * - Custom origins: Set ALLOWED_ORIGINS env var (comma-separated)
 *
 * Security best practices:
 * - Strict origin validation (no wildcards in production)
 * - Credentials require explicit origin match
 * - Limited allowed headers and methods
 *
 * @module servers/shared/cors
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { CorsConfig } from './types.js';
/**
 * Production allowed origins (strict)
 */
export declare const PRODUCTION_ORIGINS: string[];
/**
 * Development allowed origins
 */
export declare const DEVELOPMENT_ORIGINS: string[];
/**
 * Default allowed origins based on environment
 */
export declare const DEFAULT_ORIGINS: string[];
/**
 * Get allowed origins from environment or defaults
 */
export declare function getAllowedOrigins(): string[];
/**
 * Validate origin against allowed list
 * Returns true if origin is allowed, false otherwise
 */
export declare function isOriginAllowed(origin: string | undefined, allowedOrigins?: string[]): boolean;
/**
 * Get the appropriate CORS origin for a request
 * Returns the origin if allowed, otherwise returns empty string
 */
export declare function getCorsOrigin(req: IncomingMessage, allowedOrigins?: string[]): string;
/**
 * Set CORS headers on response
 * Only sets headers if origin is in the allowed list
 */
export declare function setCorsHeaders(req: IncomingMessage, res: ServerResponse, config?: Partial<CorsConfig>): void;
/**
 * Handle CORS preflight request
 */
export declare function handleCorsPreflightRequest(req: IncomingMessage, res: ServerResponse): boolean;
/**
 * Create CORS middleware
 */
export declare function corsMiddleware(config?: Partial<CorsConfig>): (req: IncomingMessage, res: ServerResponse) => boolean;
//# sourceMappingURL=cors.d.ts.map