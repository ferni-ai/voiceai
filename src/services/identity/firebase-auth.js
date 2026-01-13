/**
 * Firebase Authentication Service (Backend)
 *
 * Verifies Firebase ID tokens from the frontend.
 * Used by auth-middleware.ts to authenticate API requests.
 *
 * Token Verification Flow:
 * 1. Frontend gets Firebase ID token from firebase.auth().currentUser.getIdToken()
 * 2. Frontend sends token in Authorization: Bearer header
 * 3. Backend verifies token using Firebase Admin SDK
 * 4. Extracts user ID (UID) and claims
 *
 * @module FirebaseAuth
 */
import admin from 'firebase-admin';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'FirebaseAuth' });
// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================
/**
 * Check if we're running in production.
 */
function isProduction() {
    const nodeEnv = process.env.NODE_ENV;
    const gcpProject = process.env.GOOGLE_CLOUD_PROJECT;
    const cloudRun = process.env.K_SERVICE;
    return nodeEnv === 'production' || !!gcpProject || !!cloudRun;
}
// ============================================================================
// INITIALIZATION
// ============================================================================
let isInitialized = false;
/**
 * Initialize Firebase Admin SDK if not already initialized.
 * Uses application default credentials (ADC) in production.
 */
function ensureInitialized() {
    if (isInitialized) {
        return true;
    }
    // Check if already initialized by another module
    if (admin.apps.length > 0) {
        isInitialized = true;
        return true;
    }
    try {
        // Check for service account key file first
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (serviceAccountPath) {
            log.info('Initializing Firebase Admin with service account');
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
        }
        else if (process.env.FIREBASE_PROJECT_ID) {
            // Use project ID with ADC (works on Cloud Run, GCE, etc.)
            log.info('Initializing Firebase Admin with project ID and ADC');
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: process.env.FIREBASE_PROJECT_ID,
            });
        }
        else {
            // Try to initialize with ADC only (may work on GCP)
            log.info('Initializing Firebase Admin with default credentials');
            try {
                admin.initializeApp();
            }
            catch {
                log.warn('Firebase Admin initialization failed - token verification disabled');
                return false;
            }
        }
        isInitialized = true;
        log.info('Firebase Admin SDK initialized');
        return true;
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to initialize Firebase Admin SDK');
        return false;
    }
}
// ============================================================================
// TOKEN VERIFICATION
// ============================================================================
/**
 * Verify a Firebase ID token.
 *
 * SECURITY: In production, this will throw if Firebase is not initialized.
 * This prevents silent auth bypass due to misconfiguration.
 *
 * @param idToken - The Firebase ID token from the frontend
 * @param checkRevoked - Whether to check if the token has been revoked (default: false for performance)
 * @returns Verified token info, or null if invalid
 * @throws Error in production if Firebase is not initialized
 */
export async function verifyFirebaseToken(idToken, checkRevoked = false) {
    if (!ensureInitialized()) {
        if (isProduction()) {
            // SECURITY: In production, fail hard if Firebase isn't initialized
            // This prevents silent auth bypass due to misconfiguration
            log.error('SECURITY: Firebase Admin not initialized in production - rejecting token');
            throw new Error('Authentication service unavailable');
        }
        log.debug('Firebase Admin not initialized - token verification skipped (dev mode)');
        return null;
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken, checkRevoked);
        // Determine if user is anonymous
        // Anonymous users have the 'anonymous' provider and no email
        const isAnonymous = decodedToken.firebase?.sign_in_provider === 'anonymous' || !decodedToken.email;
        const result = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified || false,
            signInProvider: decodedToken.firebase?.sign_in_provider,
            isAnonymous,
            claims: {
                admin: decodedToken.admin === true,
                ...decodedToken,
            },
            expiresAt: decodedToken.exp,
        };
        log.debug({ uid: `${result.uid.substring(0, 8)}...`, isAnonymous, provider: result.signInProvider }, 'Firebase token verified');
        return result;
    }
    catch (error) {
        // Handle specific Firebase errors
        if (error instanceof Error) {
            const { code } = error;
            switch (code) {
                case 'auth/id-token-expired':
                    log.debug('Firebase token expired');
                    break;
                case 'auth/id-token-revoked':
                    log.warn('Firebase token revoked');
                    break;
                case 'auth/argument-error':
                    log.debug('Invalid Firebase token format');
                    break;
                default:
                    log.warn({ error: error.message, code }, 'Firebase token verification failed');
            }
        }
        return null;
    }
}
/**
 * Get Firebase user by UID.
 * Useful for checking user status, custom claims, etc.
 */
export async function getFirebaseUser(uid) {
    if (!ensureInitialized()) {
        return null;
    }
    try {
        return await admin.auth().getUser(uid);
    }
    catch (error) {
        log.error({ error: String(error), uid }, 'Failed to get Firebase user');
        return null;
    }
}
/**
 * Set custom claims on a Firebase user.
 * Used for setting admin flag, subscription tier, etc.
 */
export async function setCustomClaims(uid, claims) {
    if (!ensureInitialized()) {
        return false;
    }
    try {
        await admin.auth().setCustomUserClaims(uid, claims);
        log.info({ uid: `${uid.substring(0, 8)}...`, claims }, 'Set custom claims');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), uid }, 'Failed to set custom claims');
        return false;
    }
}
/**
 * Revoke all refresh tokens for a user.
 * Forces user to re-authenticate on all devices.
 */
export async function revokeRefreshTokens(uid) {
    if (!ensureInitialized()) {
        return false;
    }
    try {
        await admin.auth().revokeRefreshTokens(uid);
        log.info({ uid: `${uid.substring(0, 8)}...` }, 'Revoked refresh tokens');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), uid }, 'Failed to revoke refresh tokens');
        return false;
    }
}
/**
 * Delete a Firebase user.
 * Used for GDPR account deletion.
 */
export async function deleteFirebaseUser(uid) {
    if (!ensureInitialized()) {
        return false;
    }
    try {
        await admin.auth().deleteUser(uid);
        log.info({ uid: `${uid.substring(0, 8)}...` }, 'Deleted Firebase user');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), uid }, 'Failed to delete Firebase user');
        return false;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const firebaseAuth = {
    verifyToken: verifyFirebaseToken,
    getUser: getFirebaseUser,
    setCustomClaims,
    revokeRefreshTokens,
    deleteUser: deleteFirebaseUser,
};
//# sourceMappingURL=firebase-auth.js.map