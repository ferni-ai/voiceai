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
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { encryptSensitive, decryptSensitive } from '../privacy-crypto.js';
const log = createLogger({ module: 'smart-home-credentials' });
// ============================================================================
// ENCRYPTION HELPERS
// ============================================================================
/**
 * Check if a value is already encrypted (has enc_ prefix)
 */
function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith('enc_');
}
/**
 * Encrypt Hue credentials (username is an API key)
 */
async function encryptHueCredentials(creds) {
    return {
        ...creds,
        username: await encryptSensitive(creds.username),
    };
}
/**
 * Decrypt Hue credentials (handles unencrypted legacy data)
 */
async function decryptHueCredentials(creds) {
    if (!isEncrypted(creds.username)) {
        // Legacy unencrypted data - return as-is
        return creds;
    }
    return {
        ...creds,
        username: await decryptSensitive(creds.username),
    };
}
/**
 * Encrypt LIFX credentials (token is an API key)
 */
async function encryptLifxCredentials(creds) {
    return {
        ...creds,
        token: await encryptSensitive(creds.token),
    };
}
/**
 * Decrypt LIFX credentials (handles unencrypted legacy data)
 */
async function decryptLifxCredentials(creds) {
    if (!isEncrypted(creds.token)) {
        return creds;
    }
    return {
        ...creds,
        token: await decryptSensitive(creds.token),
    };
}
/**
 * Encrypt Sonos credentials (access and refresh tokens)
 */
async function encryptSonosCredentials(creds) {
    return {
        ...creds,
        accessToken: await encryptSensitive(creds.accessToken),
        refreshToken: await encryptSensitive(creds.refreshToken),
    };
}
/**
 * Decrypt Sonos credentials (handles unencrypted legacy data)
 */
async function decryptSonosCredentials(creds) {
    const needsDecrypt = isEncrypted(creds.accessToken) || isEncrypted(creds.refreshToken);
    if (!needsDecrypt) {
        return creds;
    }
    return {
        ...creds,
        accessToken: isEncrypted(creds.accessToken)
            ? await decryptSensitive(creds.accessToken)
            : creds.accessToken,
        refreshToken: isEncrypted(creds.refreshToken)
            ? await decryptSensitive(creds.refreshToken)
            : creds.refreshToken,
    };
}
// ============================================================================
// CREDENTIAL LOADING
// ============================================================================
/**
 * Load all smart home credentials for a user
 */
export async function getUserSmartHomeCredentials(userId) {
    const credentials = {
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
        // Load and decrypt credentials (handles legacy unencrypted data)
        if (hueDoc.exists) {
            credentials.hue = await decryptHueCredentials(hueDoc.data());
        }
        if (lifxDoc.exists) {
            credentials.lifx = await decryptLifxCredentials(lifxDoc.data());
        }
        if (sonosDoc.exists) {
            credentials.sonos = await decryptSonosCredentials(sonosDoc.data());
        }
        if (homeKitDoc.exists) {
            // HomeKit has no sensitive credentials to decrypt
            credentials.homeKit = homeKitDoc.data();
        }
        log.debug({
            userId,
            hasHue: !!credentials.hue,
            hasLifx: !!credentials.lifx,
            hasSonos: !!credentials.sonos,
            hasHomeKit: !!credentials.homeKit,
        }, 'Loaded smart home credentials');
        return credentials;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load smart home credentials');
        return credentials;
    }
}
/**
 * Get specific credential type for a user
 */
export async function getCredential(userId, type) {
    try {
        const db = getFirestore();
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('smart_home')
            .doc(type === 'homeKit' ? 'homekit' : type)
            .get();
        if (!doc.exists)
            return null;
        // Decrypt based on credential type (handles legacy unencrypted data)
        const rawData = doc.data();
        switch (type) {
            case 'hue':
                return (await decryptHueCredentials(rawData));
            case 'lifx':
                return (await decryptLifxCredentials(rawData));
            case 'sonos':
                return (await decryptSonosCredentials(rawData));
            case 'homeKit':
                // HomeKit has no sensitive credentials
                return rawData;
            default:
                return rawData;
        }
    }
    catch (error) {
        log.error({ error: String(error), userId, type }, 'Failed to load credential');
        return null;
    }
}
/**
 * Save credentials for a specific integration
 * Encrypts sensitive fields before storing in Firestore
 */
export async function saveCredential(userId, type, credentials) {
    try {
        const db = getFirestore();
        const docId = type === 'homeKit' ? 'homekit' : type;
        // Encrypt sensitive fields before saving
        // Note: Cast through unknown required because TypeScript can't narrow generic K
        let encryptedCredentials;
        switch (type) {
            case 'hue':
                encryptedCredentials = (await encryptHueCredentials(credentials));
                break;
            case 'lifx':
                encryptedCredentials = (await encryptLifxCredentials(credentials));
                break;
            case 'sonos':
                encryptedCredentials = (await encryptSonosCredentials(credentials));
                break;
            case 'homeKit':
                // HomeKit has no sensitive credentials to encrypt
                encryptedCredentials = credentials;
                break;
            default:
                encryptedCredentials = credentials;
        }
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('smart_home')
            .doc(docId)
            .set({
            ...encryptedCredentials,
            connectedAt: new Date().toISOString(),
        }, { merge: true });
        // Update setup state
        await updateSetupState(userId, type, true);
        log.info({ userId, type }, 'Saved smart home credential (encrypted)');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), userId, type }, 'Failed to save credential');
        return false;
    }
}
/**
 * Delete credentials for a specific integration
 */
export async function deleteCredential(userId, type) {
    try {
        const db = getFirestore();
        const docId = type === 'homeKit' ? 'homekit' : type;
        await db.collection('bogle_users').doc(userId).collection('smart_home').doc(docId).delete();
        // Update setup state
        await updateSetupState(userId, type, false);
        log.info({ userId, type }, 'Deleted smart home credential');
        return true;
    }
    catch (error) {
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
export async function getSetupState(userId) {
    const defaultState = {
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
        if (!doc.exists)
            return defaultState;
        return { ...defaultState, ...doc.data() };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load setup state');
        return defaultState;
    }
}
/**
 * Update setup state when an integration is added/removed
 */
async function updateSetupState(userId, integration, connected) {
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
        }
        else {
            state.completedIntegrations = state.completedIntegrations.filter((i) => i !== integration);
        }
        await stateRef.set(state, { merge: true });
    }
    catch (error) {
        log.error({ error: String(error), userId, integration }, 'Failed to update setup state');
    }
}
/**
 * Mark setup as started (for tracking abandonment)
 */
export async function markSetupStarted(userId) {
    try {
        const db = getFirestore();
        await db.collection('bogle_users').doc(userId).collection('smart_home').doc('_setup_state').set({
            setupStartedAt: new Date().toISOString(),
            setupAbandoned: false,
        }, { merge: true });
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to mark setup started');
    }
}
/**
 * Mark setup as abandoned (user left without completing)
 */
export async function markSetupAbandoned(userId) {
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
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to mark setup abandoned');
    }
}
// ============================================================================
// CONVENIENCE CHECKS
// ============================================================================
/**
 * Check if user has any smart home integrations configured
 */
export async function hasAnySmartHomeIntegration(userId) {
    const credentials = await getUserSmartHomeCredentials(userId);
    return !!(credentials.hue || credentials.lifx || credentials.sonos || credentials.homeKit);
}
/**
 * Check if a specific integration is configured
 */
export async function isIntegrationConfigured(userId, type) {
    const credential = await getCredential(userId, type);
    return credential !== null;
}
/**
 * Get a summary of configured integrations
 */
export async function getConfiguredIntegrations(userId) {
    const credentials = await getUserSmartHomeCredentials(userId);
    const configured = [];
    if (credentials.hue)
        configured.push('hue');
    if (credentials.lifx)
        configured.push('lifx');
    if (credentials.sonos)
        configured.push('sonos');
    if (credentials.homeKit)
        configured.push('homeKit');
    return configured;
}
//# sourceMappingURL=user-credentials.js.map