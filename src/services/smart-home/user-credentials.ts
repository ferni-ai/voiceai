/**
 * Smart Home User Credentials Service
 *
 * Loads and manages per-user smart home credentials from Firestore.
 * This is the bridge between the UI (which saves credentials) and
 * the smart-home tools (which need to use them).
 *
 * SECURITY: Sensitive credentials are encrypted at rest using AES-256-GCM.
 * Sensitive fields: Hue username (API key), LIFX token, Sonos access/refresh tokens
 */

import { FieldValue } from '@google-cloud/firestore'; // the same instance firebase-admin uses
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import { createLogger } from '../../utils/safe-logger.js';
import { openTokens } from '../../utils/token-at-rest.js';
import { encryptSensitive, decryptSensitive } from '../privacy-crypto.js';

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
// ENCRYPTION HELPERS
// ============================================================================

/**
 * Check if a value is already encrypted (has enc_ prefix)
 */
function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('enc_');
}

/** The fields of each integration that hold a secret (Hue's username is its API key). */
const SECRET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  hue: ['username'],
  lifx: ['token'],
  sonos: ['accessToken', 'refreshToken'],
};

/**
 * Additional authenticated data for one encrypted field. It binds the
 * ciphertext to this user, integration and field, so it cannot be replayed
 * into another user's doc (or another field) and decrypted there.
 */
export function smartHomeAad(userId: string, integration: string, field: string): string {
  return `${userId}/smart_home/${integration}/${field}`;
}

/** Encrypt the secret fields, bound to their context (see smartHomeAad). */
async function encryptFields<T extends object>(
  userId: string,
  integration: string,
  creds: T
): Promise<T> {
  const out = { ...creds } as Record<string, unknown>;
  for (const field of SECRET_FIELDS[integration] ?? []) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = await encryptSensitive(value, smartHomeAad(userId, integration, field));
    }
  }
  return out as T;
}

/**
 * Decrypt the enc_ secret fields. Plaintext (legacy) values pass through. The
 * AAD is required: a ciphertext without it, or bound to another user or field,
 * does not open (prod never had DATA_ENCRYPTION_KEY, so no pre-AAD ciphertext
 * exists, and a fallback would let any no-AAD ciphertext, such as an MCP or
 * OAuth secret, open inside a smart_home doc).
 */
async function decryptFields<T extends object>(
  userId: string,
  integration: string,
  creds: T
): Promise<T> {
  const out = { ...creds } as Record<string, unknown>;
  for (const field of SECRET_FIELDS[integration] ?? []) {
    const value = out[field];
    if (isEncrypted(value)) {
      out[field] = await decryptSensitive<string>(value, smartHomeAad(userId, integration, field));
    }
  }
  return out as T;
}

// ============================================================================
// CREDENTIAL LOADING
// ============================================================================

/**
 * A smart_home doc as any reader should see it. Both shapes get their enc_ fields
 * decrypted, each bound to this user, integration and field (smartHomeAad): a doc
 * this module wrote with raw enc_ fields, and a doc the web routes sealed whose
 * opened envelope still holds enc_ fields the agent wrote. A ciphertext that does
 * not open for this doc (another user, field or integration, or tampered) throws,
 * so a caller never gets a partial or plaintext-from-elsewhere value.
 * Docs that are not token-shaped (homekit) come back as stored.
 */
export async function openSmartHomeCredentials<T>(
  userId: string,
  integration: string,
  stored: unknown
): Promise<T | null> {
  if (stored === null || typeof stored !== 'object') return null;
  if (typeof (stored as { encrypted?: unknown }).encrypted === 'string') {
    const opened = openTokens<DocumentData>(stored, `smart_home/${integration}`);
    return opened ? ((await decryptFields(userId, integration, opened)) as T) : null;
  }
  return (await decryptFields(userId, integration, stored as DocumentData)) as T;
}

/**
 * Reads and opens a credential doc. Returns null only when the doc does not exist.
 * A read error, or a record that will not open, throws: a caller must not treat an
 * unreadable record as "no record" (saveCredentials would then overwrite it).
 */
export async function readSmartHomeCredentials<T>(
  userId: string,
  integration: string
): Promise<T | null> {
  const doc = await getAdminFirestore()
    .collection('bogle_users')
    .doc(userId)
    .collection('smart_home')
    .doc(integration)
    .get();

  if (!doc.exists) return null;
  const opened = await openSmartHomeCredentials<T>(userId, integration, doc.data());
  if (opened === null) throw new Error(`smart_home/${integration} record could not be opened`);
  return opened;
}

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
    const db = getAdminFirestore();
    const smartHomeRef = db.collection('bogle_users').doc(userId).collection('smart_home');

    // Load all credentials in parallel
    const [hueDoc, lifxDoc, sonosDoc, homeKitDoc] = await Promise.all([
      smartHomeRef.doc('hue').get(),
      smartHomeRef.doc('lifx').get(),
      smartHomeRef.doc('sonos').get(),
      smartHomeRef.doc('homekit').get(),
    ]);

    // Open docs the web routes sealed; decrypt the ones this module wrote. One bad
    // field fails only its own integration, never the others.
    const open = async <T>(integration: string, stored: unknown): Promise<T | null> => {
      try {
        return await openSmartHomeCredentials<T>(userId, integration, stored);
      } catch (error) {
        log.warn({ error: String(error), integration }, 'Smart home credential unreadable');
        return null;
      }
    };
    credentials.hue = await open<HueCredentials>('hue', hueDoc.data());
    credentials.lifx = await open<LifxCredentials>('lifx', lifxDoc.data());
    credentials.sonos = await open<SonosCredentials>('sonos', sonosDoc.data());

    if (homeKitDoc.exists) {
      // HomeKit has no sensitive credentials to decrypt
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
    const db = getAdminFirestore();
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc(type === 'homeKit' ? 'homekit' : type)
      .get();

    if (!doc.exists) return null as SmartHomeCredentials[K];

    // Same view as the web routes: opened if sealed, enc_ fields decrypted
    const docId = type === 'homeKit' ? 'homekit' : type;
    return (await openSmartHomeCredentials(userId, docId, doc.data())) as SmartHomeCredentials[K];
  } catch (error) {
    log.error({ error: String(error), userId, type }, 'Failed to load credential');
    return null as SmartHomeCredentials[K];
  }
}

/**
 * Save credentials for a specific integration
 * Encrypts sensitive fields before storing in Firestore
 */
export async function saveCredential<K extends keyof SmartHomeCredentials>(
  userId: string,
  type: K,
  credentials: NonNullable<SmartHomeCredentials[K]>
): Promise<boolean> {
  try {
    const db = getAdminFirestore();
    const docId = type === 'homeKit' ? 'homekit' : type;

    // Encrypt sensitive fields (bound to this user and field) before saving
    const encryptedCredentials = await encryptFields(userId, docId, credentials);

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('smart_home')
      .doc(docId)
      .set(
        {
          ...encryptedCredentials,
          encrypted: FieldValue.delete(), // a stale sealed copy must not shadow these fields
          connectedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    // Update setup state
    await updateSetupState(userId, type, true);

    log.info({ userId, type }, 'Saved smart home credential (encrypted)');
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
    const db = getAdminFirestore();
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
    const db = getAdminFirestore();
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
    const db = getAdminFirestore();
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
    const db = getAdminFirestore();
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
      const db = getAdminFirestore();
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
 * Whether this user saved a LIFX token. With SMART_HOME_LIFX on, the light tools
 * ask this per caller (a process env var cannot say whether this caller linked one).
 */
export async function hasLinkedLifxToken(userId: string): Promise<boolean> {
  const lifx = await getCredential(userId, 'lifx');
  return typeof lifx?.token === 'string' && lifx.token.trim() !== '';
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
