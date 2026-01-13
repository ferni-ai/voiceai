/**
 * Shared Developer Auth Helpers
 *
 * Provides Firebase Auth and Firestore utilities for developer console routes.
 * Single source of truth - all developer routes should import from here.
 *
 * @module api/v1/developers/shared/developer-auth
 */
import { getLogger } from '../../../../utils/safe-logger.js';
const log = getLogger().child({ module: 'developer-auth' });
// ============================================================================
// FIREBASE AUTH (Singleton)
// ============================================================================
let firebaseAuthInstance = null;
let authInitPromise = null;
/**
 * Get Firebase Auth instance for token verification
 * Uses firebase-admin/auth module directly for better ESM compatibility.
 * Singleton pattern ensures one-time initialization across all route files.
 */
export async function getFirebaseAuth() {
    if (firebaseAuthInstance)
        return firebaseAuthInstance;
    if (authInitPromise) {
        await authInitPromise;
        if (firebaseAuthInstance)
            return firebaseAuthInstance;
    }
    authInitPromise = (async () => {
        try {
            const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
            const { getAuth } = await import('firebase-admin/auth');
            if (getApps().length === 0) {
                initializeApp({
                    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
                    credential: applicationDefault(),
                });
                log.info('Firebase Admin initialized for developer routes');
            }
            firebaseAuthInstance = getAuth();
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            log.error({ error: err.message }, 'Failed to initialize Firebase Admin');
            throw err;
        }
    })();
    await authInitPromise;
    if (!firebaseAuthInstance)
        throw new Error('Firebase Admin initialization failed');
    return firebaseAuthInstance;
}
// ============================================================================
// FIRESTORE (Singleton)
// ============================================================================
let db = null;
/**
 * Get Firestore instance for database operations
 * Singleton pattern ensures one-time initialization across all route files.
 */
export async function getFirestore() {
    if (db)
        return db;
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
}
// ============================================================================
// AUTH HELPERS
// ============================================================================
/**
 * Get publisher ID from Firebase token in Authorization header
 *
 * @param req - HTTP request with Authorization: Bearer <token>
 * @returns Publisher ID or null if auth fails
 */
export async function getPublisherFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        log.debug('No Bearer token in Authorization header');
        return null;
    }
    const idToken = authHeader.substring(7);
    try {
        const auth = await getFirebaseAuth();
        const decodedToken = (await auth.verifyIdToken(idToken));
        const db = await getFirestore();
        const query = db.collection('publishers').where('firebaseUid', '==', decodedToken.uid).limit(1);
        const snapshot = await query.get();
        if (snapshot.empty) {
            log.warn({ firebaseUid: decodedToken.uid }, 'No publisher found for Firebase UID');
            return null;
        }
        return snapshot.docs[0].id;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn({ error: err.message }, 'Failed to get publisher from token');
        return null;
    }
}
/**
 * Verify Firebase ID token and get decoded payload
 *
 * @param idToken - Firebase ID token string
 * @returns Decoded token or null if invalid
 */
export async function verifyFirebaseToken(idToken) {
    try {
        const auth = await getFirebaseAuth();
        return (await auth.verifyIdToken(idToken));
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.warn({ error: err.message }, 'Invalid Firebase ID token');
        return null;
    }
}
/**
 * Find publisher by Firebase UID
 *
 * @param firebaseUid - Firebase user ID
 * @returns Publisher data or null if not found
 */
export async function findPublisherByFirebaseUid(firebaseUid) {
    const db = await getFirestore();
    const query = db.collection('publishers').where('firebaseUid', '==', firebaseUid).limit(1);
    const snapshot = await query.get();
    if (snapshot.empty)
        return null;
    const doc = snapshot.docs[0];
    const data = doc.data();
    if (!data)
        return null;
    return {
        id: doc.id,
        email: data.email,
        name: data.name,
        verified: data.verified,
        createdAt: toDate(data.createdAt),
    };
}
/**
 * Convert various timestamp formats to Date
 */
function toDate(value) {
    if (!value)
        return new Date();
    if (value instanceof Date)
        return value;
    if (typeof value === 'number')
        return new Date(value);
    if (typeof value === 'string')
        return new Date(value);
    if (typeof value.toDate === 'function') {
        return value.toDate();
    }
    // Firestore Timestamp with _seconds
    if (typeof value._seconds === 'number') {
        return new Date(value._seconds * 1000);
    }
    return new Date();
}
// ============================================================================
// RESET HELPERS (for testing)
// ============================================================================
/**
 * Reset singleton instances (for testing only)
 */
export function resetDeveloperAuth() {
    firebaseAuthInstance = null;
    authInitPromise = null;
    db = null;
}
//# sourceMappingURL=developer-auth.js.map