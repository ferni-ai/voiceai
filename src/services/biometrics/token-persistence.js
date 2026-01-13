/**
 * Biometrics Token Persistence
 *
 * Handles saving and loading biometric OAuth tokens to/from user profiles.
 *
 * @module services/biometrics/token-persistence
 */
import { getStore } from '../../memory/store-factory.js';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'BiometricsTokens' });
/**
 * Save biometric tokens to persistent storage (user profile)
 */
export async function persistTokens(userId, data) {
    try {
        const store = await getStore();
        const profile = await store.getOrCreateProfile(userId);
        const tokensToSave = {
            platform: data.platform,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            tokenExpiry: data.tokenExpiry.toISOString(),
            lastSync: data.lastSync.toISOString(),
        };
        // Store tokens in user profile (extends profile with biometricTokens field)
        const updatedProfile = {
            ...profile,
            biometricTokens: tokensToSave,
        };
        await store.saveProfile(updatedProfile);
        log.debug({ userId, platform: data.platform }, 'Biometric tokens persisted');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to persist biometric tokens');
    }
}
/**
 * Load biometric tokens from persistent storage
 */
export async function loadTokens(userId) {
    try {
        const store = await getStore();
        const profile = await store.getProfile(userId);
        if (!profile)
            return null;
        // Type assertion to access biometricTokens field
        const tokens = profile.biometricTokens;
        if (!tokens)
            return null;
        // Reconstruct UserBiometrics from persisted data
        const userBio = {
            platform: tokens.platform,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiry: new Date(tokens.tokenExpiry),
            lastSync: new Date(tokens.lastSync),
            snapshot: null,
            history: [],
            eventCallbacks: new Set(),
        };
        log.debug({ userId, platform: tokens.platform }, 'Biometric tokens loaded from storage');
        return userBio;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load biometric tokens');
        return null;
    }
}
/**
 * Clear persisted tokens for a user
 */
export async function clearPersistedTokens(userId) {
    try {
        const store = await getStore();
        const profile = await store.getProfile(userId);
        if (profile) {
            // Remove biometricTokens field
            const updatedProfile = { ...profile };
            delete updatedProfile.biometricTokens;
            await store.saveProfile(updatedProfile);
            log.debug({ userId }, 'Biometric tokens cleared from storage');
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to clear biometric tokens');
    }
}
//# sourceMappingURL=token-persistence.js.map