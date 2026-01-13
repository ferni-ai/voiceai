/**
 * Biometrics Token Persistence
 *
 * Handles saving and loading biometric OAuth tokens to/from user profiles.
 *
 * @module services/biometrics/token-persistence
 */
import type { UserBiometrics } from './types.js';
/**
 * Save biometric tokens to persistent storage (user profile)
 */
export declare function persistTokens(userId: string, data: UserBiometrics): Promise<void>;
/**
 * Load biometric tokens from persistent storage
 */
export declare function loadTokens(userId: string): Promise<UserBiometrics | null>;
/**
 * Clear persisted tokens for a user
 */
export declare function clearPersistedTokens(userId: string): Promise<void>;
//# sourceMappingURL=token-persistence.d.ts.map