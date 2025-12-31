/**
 * Smart Home User Credentials Service
 *
 * Loads and manages per-user smart home credentials from Firestore.
 * This is the bridge between the UI (which saves credentials) and
 * the smart-home tools (which need to use them).
 *
 * SECURITY NOTE: Credentials are currently stored in plain text.
 * TODO: Implement KMS encryption for production.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'smart-home-credentials' });

// ============================================================================
// TYPES
// ============================================================================

export interface HueCredentials {
  bridgeIp: string;
  username: string;
  connectedAt?: string;
}

export interface LifxCredentials {
  token: string;
  connectedAt?: string;
}

export interface SonosCredentials {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: number;
  householdId?: string;
  connectedAt?: string;
}

export interface HomeKitCredentials {
  enabled: boolean;
  homeId?: string;
  homeName?: string;
  deviceCount?: number;
  connectedAt?: string;
}

export interface SmartHomeCredentials {
  hue: HueCredentials | null;
  lifx: LifxCredentials | null;
  sonos: SonosCredentials | null;
  homeKit: HomeKitCredentials | null;
  // Ecobee is handled separately in ecobee-auth.ts
}

export interface SmartHomeSetupState {
  completedIntegrations: string[];
  lastSetupDate: string | null;
  setupStartedAt: string | null;
  setupAbandoned: boolean;
}

// ============================================================================
// CREDENTIAL LOADING
// ============================================================================

/**
 * Load all smart home credentials for a user
 */
export async function getUserSmartHomeCredentials(userId: string): Promise<SmartHomeCredentials> {
  const credentials: SmartHomeCredentials = {
    hue: null,
    lifx: null,
    sonos: null,
    homeKit: null,
  };

  try {
    const db = getFirestore();
    const smartHomeRef = db.collection('bogle_users').doc(userId).collection('smart_home');

    // Load all credentials in parallel
    const [hueDoc, lifxDoc, sonosDoc, homeKitDoc] = await Promise.all([
      smartHomeRef.doc('hue').get(),
      smartHomeRef.doc('lifx').get(),
      smartHomeRef.doc('sonos').get(),
      smartHomeRef.doc('homekit').get(),
    ]);

    if (hueDoc.exists) {
      credentials.hue = hueDoc.data() as HueCredentials;
    }

    if (lifxDoc.exists) {
      credentials.lifx = lifxDoc.data() as LifxCredentials;
    }

    if (sonosDoc.exists) {
      credentials.sonos = sonosDoc.data() as SonosCredentials;
    }

    if (homeKitDoc.exists) {
      credentials.homeKit = homeKitDoc.data() as HomeKitCredentials;
    }

    log.debug(
      {
        userId,
        hasHue: !!credentials.hue,
        hasLifx: !!credentials.lifx,
        hasSonos: !!credentials.sonos,
        hasHomeKit: !!credentials.homeKit,
      },
      'Loaded smart home credentials'
    );

    return credentials;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load smart home credentials');
    return credentials;
  }
}

/**
 * Get specific credential type for a user
 */
export async function getCredential<K extends keyof SmartHomeCredentials>(
  userId: string,
  type: K
): Promise<SmartHomeCredentials[K]> {
  try {
    const db = getFirestore();
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc(type === 'homeKit' ? 'homekit' : type)
      .get();

    if (!doc.exists) return null as SmartHomeCredentials[K];
    return doc.data() as SmartHomeCredentials[K];
  } catch (error) {
    log.error({ error: String(error), userId, type }, 'Failed to load credential');
    return null as SmartHomeCredentials[K];
  }
}

/**
 * Save credentials for a specific integration
 */
export async function saveCredential<K extends keyof SmartHomeCredentials>(
  userId: string,
  type: K,
  credentials: NonNullable<SmartHomeCredentials[K]>
): Promise<boolean> {
  try {
    const db = getFirestore();
    const docId = type === 'homeKit' ? 'homekit' : type;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc(docId)
      .set(
        {
          ...credentials,
          connectedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    // Update setup state
    await updateSetupState(userId, type, true);

    log.info({ userId, type }, 'Saved smart home credential');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, type }, 'Failed to save credential');
    return false;
  }
}

/**
 * Delete credentials for a specific integration
 */
export async function deleteCredential(
  userId: string,
  type: keyof SmartHomeCredentials
): Promise<boolean> {
  try {
    const db = getFirestore();
    const docId = type === 'homeKit' ? 'homekit' : type;

    await db.collection('bogle_users').doc(userId).collection('smart_home').doc(docId).delete();

    // Update setup state
    await updateSetupState(userId, type, false);

    log.info({ userId, type }, 'Deleted smart home credential');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, type }, 'Failed to delete credential');
    return false;
  }
}

// ============================================================================
// SETUP STATE TRACKING
// ============================================================================

/**
 * Get the user's smart home setup state
 */
export async function getSetupState(userId: string): Promise<SmartHomeSetupState> {
  const defaultState: SmartHomeSetupState = {
    completedIntegrations: [],
    lastSetupDate: null,
    setupStartedAt: null,
    setupAbandoned: false,
  };

  try {
    const db = getFirestore();
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc('_setup_state')
      .get();

    if (!doc.exists) return defaultState;
    return { ...defaultState, ...doc.data() } as SmartHomeSetupState;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load setup state');
    return defaultState;
  }
}

/**
 * Update setup state when an integration is added/removed
 */
async function updateSetupState(
  userId: string,
  integration: string,
  connected: boolean
): Promise<void> {
  try {
    const db = getFirestore();
    const stateRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc('_setup_state');

    const state = await getSetupState(userId);

    if (connected) {
      if (!state.completedIntegrations.includes(integration)) {
        state.completedIntegrations.push(integration);
      }
      state.lastSetupDate = new Date().toISOString();
      state.setupAbandoned = false;
    } else {
      state.completedIntegrations = state.completedIntegrations.filter((i) => i !== integration);
    }

    await stateRef.set(state, { merge: true });
  } catch (error) {
    log.error({ error: String(error), userId, integration }, 'Failed to update setup state');
  }
}

/**
 * Mark setup as started (for tracking abandonment)
 */
export async function markSetupStarted(userId: string): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection('bogle_users').doc(userId).collection('smart_home').doc('_setup_state').set(
      {
        setupStartedAt: new Date().toISOString(),
        setupAbandoned: false,
      },
      { merge: true }
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to mark setup started');
  }
}

/**
 * Mark setup as abandoned (user left without completing)
 */
export async function markSetupAbandoned(userId: string): Promise<void> {
  try {
    const state = await getSetupState(userId);

    // Only mark as abandoned if they started but didn't complete any
    if (state.setupStartedAt && state.completedIntegrations.length === 0) {
      const db = getFirestore();
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('smart_home')
        .doc('_setup_state')
        .set({ setupAbandoned: true }, { merge: true });
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to mark setup abandoned');
  }
}

// ============================================================================
// CONVENIENCE CHECKS
// ============================================================================

/**
 * Check if user has any smart home integrations configured
 */
export async function hasAnySmartHomeIntegration(userId: string): Promise<boolean> {
  const credentials = await getUserSmartHomeCredentials(userId);
  return !!(credentials.hue || credentials.lifx || credentials.sonos || credentials.homeKit);
}

/**
 * Check if a specific integration is configured
 */
export async function isIntegrationConfigured(
  userId: string,
  type: keyof SmartHomeCredentials
): Promise<boolean> {
  const credential = await getCredential(userId, type);
  return credential !== null;
}

/**
 * Get a summary of configured integrations
 */
export async function getConfiguredIntegrations(userId: string): Promise<string[]> {
  const credentials = await getUserSmartHomeCredentials(userId);
  const configured: string[] = [];

  if (credentials.hue) configured.push('hue');
  if (credentials.lifx) configured.push('lifx');
  if (credentials.sonos) configured.push('sonos');
  if (credentials.homeKit) configured.push('homeKit');

  return configured;
}
