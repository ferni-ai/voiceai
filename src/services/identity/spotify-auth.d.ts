/**
 * Spotify Token Manager
 *
 * Automatically manages Spotify OAuth tokens:
 * - Stores tokens in a JSON file (not .env)
 * - Auto-refreshes when expired
 * - Persists across restarts
 * - Thread-safe with mutex for concurrent requests
 * - Circuit breaker for repeated failures
 *
 * This eliminates the need to manually update .env when tokens expire!
 */
/**
 * Get a valid access token (auto-refreshes if needed)
 *
 * This is the main function to call - it handles everything automatically!
 * Thread-safe: Uses mutex to prevent multiple simultaneous refresh attempts.
 *
 * @param forceRefresh - Force a token refresh even if current token appears valid
 */
export declare function getSpotifyAccessToken(forceRefresh?: boolean): Promise<string | null>;
/**
 * Check if Spotify is configured
 */
export declare function isSpotifyConfigured(): boolean;
/**
 * Get token expiry info for monitoring
 */
export declare function getSpotifyTokenStatus(): {
    valid: boolean;
    minutesRemaining: number;
    expiresAt: Date | null;
};
/**
 * Validate token by making an actual API call
 * Returns true if token is valid and working
 */
export declare function validateSpotifyToken(): Promise<boolean>;
/**
 * Proactively refresh token if it will expire soon
 * Call this periodically (e.g., every 5 minutes) to ensure token is always fresh
 */
export declare function ensureTokenFresh(): Promise<boolean>;
/**
 * Start background token refresh (validates on startup, then checks every 5 minutes)
 */
export declare function startAutoRefresh(): void;
/**
 * Stop background refresh
 */
export declare function stopAutoRefresh(): void;
/**
 * Store new tokens (called after OAuth flow)
 */
export declare function storeSpotifyTokens(accessToken: string, refreshToken: string, expiresIn: number): void;
/**
 * Clear stored tokens (for logout/reset)
 */
export declare function clearSpotifyTokens(): void;
export interface SpotifyHealthStatus {
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasTokenFile: boolean;
    hasRefreshToken: boolean;
    tokenValid: boolean;
    tokenMinutesRemaining: number;
    circuitBreakerOpen: boolean;
    circuitBreakerFailures: number;
    lastError: string | null;
}
/**
 * Record the last error for diagnostics
 */
export declare function recordSpotifyError(error: string): void;
/**
 * Get comprehensive health status for Spotify integration.
 * Use this to diagnose issues.
 */
export declare function getSpotifyHealthStatus(): SpotifyHealthStatus;
/**
 * Log detailed diagnostics for debugging Spotify issues
 */
export declare function logSpotifyDiagnostics(): void;
/**
 * Reset the circuit breaker manually (for testing/recovery)
 */
export declare function resetSpotifyCircuitBreaker(): void;
//# sourceMappingURL=spotify-auth.d.ts.map