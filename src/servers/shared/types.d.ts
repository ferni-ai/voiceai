/**
 * Shared types for server infrastructure
 */
import type { IncomingMessage, ServerResponse as HttpServerResponse } from 'http';
/**
 * Extended request with parsed URL and body
 */
export interface ExtendedServerRequest extends IncomingMessage {
    parsedUrl?: URL;
    query?: Record<string, string | string[] | undefined>;
    body?: unknown;
    requestId?: string;
}
/**
 * Extended response with helper methods
 */
export interface ExtendedServerResponse extends HttpServerResponse {
    json?: (data: unknown, statusCode?: number) => void;
    error?: (message: string, statusCode?: number) => void;
}
/**
 * Route handler function signature
 */
export type RouteHandler = (req: ExtendedServerRequest, res: ExtendedServerResponse) => Promise<boolean | void> | boolean | void;
/**
 * Route definition
 */
export interface Route {
    pattern: string | RegExp;
    methods?: string[];
    handler: RouteHandler;
    middleware?: RouteHandler[];
}
/**
 * Server configuration
 */
export interface ServerConfig {
    port: number;
    name: string;
    cors?: CorsConfig;
    ddos?: boolean;
    healthEndpoint?: string;
}
/**
 * CORS configuration
 */
export interface CorsConfig {
    origins: string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
}
/**
 * OAuth state data
 */
export interface OAuthStateData {
    device_id?: string;
    user_id?: string;
    return_url?: string;
    created_at: number;
}
/**
 * Token generation options
 */
export interface TokenOptions {
    roomName: string;
    participantName: string;
    metadata?: Record<string, unknown>;
    ttl?: string;
}
/**
 * Demo session configuration
 */
export interface DemoConfig {
    maxSessionsPerDay: number;
    sessionDurationMinutes: number;
    cooldownMinutes: number;
}
/**
 * Rate limit check result
 */
export interface RateLimitResult {
    allowed: boolean;
    reason?: 'daily_limit' | 'cooldown';
    message?: string;
    retryAfter?: string;
    sessionsRemaining?: number;
}
/**
 * Encrypted data payload
 */
export interface EncryptedPayload {
    encrypted: true;
    iv: string;
    authTag: string;
    data: string;
}
/**
 * OAuth tokens (Spotify, Google, etc.)
 */
export interface OAuthTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope?: string;
    updated_at?: number;
}
/**
 * LiveKit room metadata
 */
export interface RoomMetadata {
    persona_id: string;
    device_id?: string;
    firebase_uid?: string;
    user_name?: string;
    is_demo?: boolean;
    demo_started?: number;
    demo_expires?: number;
    source?: string;
}
/**
 * Server health status
 */
export interface HealthStatus {
    status: 'ok' | 'degraded' | 'unhealthy';
    server: string;
    uptime: number;
    timestamp: string;
    checks?: Record<string, boolean>;
}
//# sourceMappingURL=types.d.ts.map