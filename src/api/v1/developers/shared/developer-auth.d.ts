/**
 * Shared Developer Auth Helpers
 *
 * Provides Firebase Auth and Firestore utilities for developer console routes.
 * Single source of truth - all developer routes should import from here.
 *
 * @module api/v1/developers/shared/developer-auth
 */
import type { IncomingMessage } from 'http';
export interface FirebaseDecodedToken {
    uid: string;
    email?: string;
    name?: string;
    firebase?: {
        sign_in_provider?: string;
    };
}
export interface Firestore {
    collection: (path: string) => CollectionReference;
    batch: () => WriteBatch;
}
export interface WriteBatch {
    set: (docRef: DocumentReference, data: unknown, options?: {
        merge?: boolean;
    }) => WriteBatch;
    update: (docRef: DocumentReference, data: Record<string, unknown>) => WriteBatch;
    delete: (docRef: DocumentReference) => WriteBatch;
    commit: () => Promise<void>;
}
export interface CollectionReference {
    doc: (id?: string) => DocumentReference;
    where: (field: string, op: string, value: unknown) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}
export interface DocumentReference {
    id: string;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<unknown>;
    get: () => Promise<DocumentSnapshot>;
    update: (data: Record<string, unknown>) => Promise<void>;
    delete: () => Promise<void>;
    collection: (path: string) => CollectionReference;
}
export interface DocumentSnapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id: string;
    ref: DocumentReference;
}
export interface Query {
    limit: (n: number) => Query;
    get: () => Promise<QuerySnapshot>;
    where: (field: string, op: string, value: unknown) => Query;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    startAfter: (snapshot: DocumentSnapshot) => Query;
}
export interface QuerySnapshot {
    empty: boolean;
    docs: DocumentSnapshot[];
    size: number;
}
/**
 * Get Firebase Auth instance for token verification
 * Uses firebase-admin/auth module directly for better ESM compatibility.
 * Singleton pattern ensures one-time initialization across all route files.
 */
export declare function getFirebaseAuth(): Promise<import("firebase-admin/auth").Auth>;
/**
 * Get Firestore instance for database operations
 * Singleton pattern ensures one-time initialization across all route files.
 */
export declare function getFirestore(): Promise<Firestore>;
/**
 * Get publisher ID from Firebase token in Authorization header
 *
 * @param req - HTTP request with Authorization: Bearer <token>
 * @returns Publisher ID or null if auth fails
 */
export declare function getPublisherFromToken(req: IncomingMessage): Promise<string | null>;
/**
 * Verify Firebase ID token and get decoded payload
 *
 * @param idToken - Firebase ID token string
 * @returns Decoded token or null if invalid
 */
export declare function verifyFirebaseToken(idToken: string): Promise<FirebaseDecodedToken | null>;
/**
 * Find publisher by Firebase UID
 *
 * @param firebaseUid - Firebase user ID
 * @returns Publisher data or null if not found
 */
export declare function findPublisherByFirebaseUid(firebaseUid: string): Promise<{
    id: string;
    email: string;
    name: string;
    verified: boolean;
    createdAt: Date;
} | null>;
/**
 * Reset singleton instances (for testing only)
 */
export declare function resetDeveloperAuth(): void;
//# sourceMappingURL=developer-auth.d.ts.map