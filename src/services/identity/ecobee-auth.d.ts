/**
 * Ecobee OAuth Service
 *
 * Handles PIN-based OAuth 2.0 authentication for Ecobee thermostats:
 * 1. Request PIN from Ecobee
 * 2. User enters PIN at ecobee.com/consumerportal
 * 3. Poll Ecobee to exchange code for tokens
 * 4. Refresh tokens automatically
 *
 * PIN-based flow is simpler than redirect OAuth for voice-first devices.
 */
import type { EcobeeTokens, EcobeePendingAuth, EcobeeResult } from './ecobee-types.js';
/**
 * Check if a user's token recently failed with a permanent error
 */
export declare function isTokenPermanentlyFailed(userId: string): boolean;
/**
 * Mark a token as permanently failed
 */
export declare function markTokenAsFailed(userId: string): void;
/**
 * Clear failed token status (after successful re-auth)
 */
export declare function clearFailedTokenStatus(userId: string): void;
/**
 * Store tokens for a user
 */
export declare function storeUserTokens(userId: string, tokens: EcobeeTokens): Promise<void>;
/**
 * Get tokens for a user
 */
export declare function getUserTokens(userId: string): Promise<EcobeeTokens | undefined>;
/**
 * Delete user tokens (disconnect)
 */
export declare function deleteUserTokens(userId: string): Promise<void>;
/**
 * Check if tokens are expired
 */
export declare function areTokensExpired(tokens: EcobeeTokens): boolean;
/**
 * Step 1: Request a PIN for the user to enter at ecobee.com
 */
export declare function requestPin(userId: string): Promise<EcobeeResult<{
    pin: string;
    expiresIn: number;
}>>;
/**
 * Step 2: Poll to check if user has authorized (call after user enters PIN)
 */
export declare function checkAuthorization(userId: string): Promise<EcobeeResult<{
    authorized: boolean;
}>>;
/**
 * Get pending authorization status
 */
export declare function getPendingAuth(userId: string): Promise<EcobeePendingAuth | null>;
/**
 * Refresh access token using refresh token
 */
export declare function refreshAccessToken(refreshToken: string): Promise<EcobeeTokens>;
/**
 * Get valid access token for a user (refreshes if needed)
 */
export declare function getValidAccessToken(userId: string): Promise<string | null>;
/**
 * Check if Ecobee is configured for a user
 */
export declare function isEcobeeConfigured(userId: string): Promise<boolean>;
/**
 * Check if Ecobee API is configured (application-level)
 */
export declare function isApiConfigured(): boolean;
/**
 * Get all users with connected Ecobee
 */
export declare function getAllEcobeeUsers(): Promise<string[]>;
declare const _default: {
    requestPin: typeof requestPin;
    checkAuthorization: typeof checkAuthorization;
    getPendingAuth: typeof getPendingAuth;
    refreshAccessToken: typeof refreshAccessToken;
    getValidAccessToken: typeof getValidAccessToken;
    storeUserTokens: typeof storeUserTokens;
    getUserTokens: typeof getUserTokens;
    deleteUserTokens: typeof deleteUserTokens;
    areTokensExpired: typeof areTokensExpired;
    isEcobeeConfigured: typeof isEcobeeConfigured;
    isApiConfigured: typeof isApiConfigured;
    getAllEcobeeUsers: typeof getAllEcobeeUsers;
    isTokenPermanentlyFailed: typeof isTokenPermanentlyFailed;
    markTokenAsFailed: typeof markTokenAsFailed;
    clearFailedTokenStatus: typeof clearFailedTokenStatus;
    ecobeeCircuitBreaker: import("../../utils/circuit-breaker.js").CircuitBreaker;
};
export default _default;
//# sourceMappingURL=ecobee-auth.d.ts.map