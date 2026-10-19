/**
 * Biometrics Token Persistence
 *
 * Handles saving and loading biometric OAuth tokens to/from user profiles.
 *
 * @module services/biometrics/token-persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { openTokens, sealTokens } from '../../utils/token-at-rest.js';
import { readProfileTokenField, writeProfileTokenField } from '../identity/profile-token-field.js';
import type { PersistedBiometricTokens, UserBiometrics } from './types.js';

const log = createLogger({ module: 'BiometricsTokens' });
const PROFILE_FIELD = 'biometricTokens';

/**
 * Save biometric tokens to persistent storage (user profile)
 */
export async function persistTokens(userId: string, data: UserBiometrics): Promise<void> {
  try {
    const tokensToSave: PersistedBiometricTokens = {
      platform: data.platform,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiry: data.tokenExpiry.toISOString(),
      lastSync: data.lastSync.toISOString(),
    };

    // Sealed on the profile; never the plaintext token (backups export the db).
    await writeProfileTokenField(userId, PROFILE_FIELD, sealTokens(tokensToSave));
    log.debug({ userId, platform: data.platform }, 'Biometric tokens persisted');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist biometric tokens');
  }
}

/**
 * Load biometric tokens from persistent storage
 */
export async function loadTokens(userId: string): Promise<UserBiometrics | null> {
  try {
    // Sealed, or legacy plaintext until the encrypt-integration-tokens migration runs
    const tokens = openTokens<PersistedBiometricTokens>(
      await readProfileTokenField(userId, PROFILE_FIELD),
      PROFILE_FIELD
    );
    if (!tokens) return null;

    // Reconstruct UserBiometrics from persisted data
    const userBio: UserBiometrics = {
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
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load biometric tokens');
    return null;
  }
}

/**
 * Clear persisted tokens for a user
 */
export async function clearPersistedTokens(userId: string): Promise<void> {
  try {
    // A real field delete: a merge write of the profile without the key left it behind.
    await writeProfileTokenField(userId, PROFILE_FIELD, null);
    log.debug({ userId }, 'Biometric tokens cleared from storage');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to clear biometric tokens');
  }
}
