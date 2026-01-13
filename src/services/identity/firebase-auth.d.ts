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
export interface VerifiedToken {
    /** Firebase User ID */
    uid: string;
    /** User's email (if available) */
    email?: string;
    /** Whether email is verified */
    emailVerified: boolean;
    /** Provider ID (google.com, apple.com, password, anonymous) */
    signInProvider?: string;
    /** Whether user is anonymous */
    isAnonymous: boolean;
    /** Custom claims (including admin flag) */
    claims: Record<string, unknown>;
    /** Token expiration time (Unix timestamp in seconds) */
    expiresAt: number;
}
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
export declare function verifyFirebaseToken(idToken: string, checkRevoked?: boolean): Promise<VerifiedToken | null>;
/**
 * Get Firebase user by UID.
 * Useful for checking user status, custom claims, etc.
 */
export declare function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord | null>;
/**
 * Set custom claims on a Firebase user.
 * Used for setting admin flag, subscription tier, etc.
 */
export declare function setCustomClaims(uid: string, claims: Record<string, unknown>): Promise<boolean>;
/**
 * Revoke all refresh tokens for a user.
 * Forces user to re-authenticate on all devices.
 */
export declare function revokeRefreshTokens(uid: string): Promise<boolean>;
/**
 * Delete a Firebase user.
 * Used for GDPR account deletion.
 */
export declare function deleteFirebaseUser(uid: string): Promise<boolean>;
export declare const firebaseAuth: {
    verifyToken: typeof verifyFirebaseToken;
    getUser: typeof getFirebaseUser;
    setCustomClaims: typeof setCustomClaims;
    revokeRefreshTokens: typeof revokeRefreshTokens;
    deleteUser: typeof deleteFirebaseUser;
};
//# sourceMappingURL=firebase-auth.d.ts.map