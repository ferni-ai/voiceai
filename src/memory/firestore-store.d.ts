/**
 * Google Cloud Firestore Memory Store
 *
 * Production-grade persistent storage using Google Cloud Firestore.
 *
 * Requires: npm install @google-cloud/firestore
 *
 * Environment:
 * - GOOGLE_CLOUD_PROJECT: Your GCP project ID
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
 */
import { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
import type { UserProfile, ConversationSummary, KeyMoment, FinancialGoal } from '../types/user-profile.js';
interface FirestoreConfig {
    projectId?: string;
    databaseId?: string;
    credentials?: {
        client_email: string;
        private_key: string;
    };
    /**
     * Connection pooling settings for performance optimization.
     * These reduce cold start latency by maintaining warm connections.
     */
    pooling?: {
        /** Minimum gRPC channels to maintain (default: 2) */
        minChannels?: number;
        /** Maximum idle gRPC channels (default: 10) */
        maxIdleChannels?: number;
    };
}
interface Firestore {
    collection: (path: string) => CollectionReference;
    terminate: () => Promise<void>;
}
interface CollectionReference {
    doc: (id: string) => DocumentReference;
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    limit: (n: number) => Query;
    where: (field: string, op: string, value: unknown) => Query;
    get: () => Promise<QuerySnapshot>;
}
interface DocumentReference {
    id: string;
    set: (data: unknown, options?: {
        merge?: boolean;
    }) => Promise<unknown>;
    get: () => Promise<DocumentSnapshot>;
    delete: () => Promise<unknown>;
    collection: (name: string) => CollectionReference;
}
interface DocumentSnapshot {
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id: string;
}
interface QuerySnapshot {
    empty: boolean;
    docs: DocumentSnapshot[];
    size: number;
}
interface Query {
    orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
    limit: (n: number) => Query;
    offset: (n: number) => Query;
    where: (field: string, op: string, value: unknown) => Query;
    get: () => Promise<QuerySnapshot>;
}
export declare class FirestoreStore extends MemoryStore {
    private db;
    private config;
    private readonly USERS_COLLECTION;
    private initPromise;
    constructor(config?: FirestoreConfig);
    /**
     * FIX: Initialize with proper race condition handling
     * The initPromise is now only cleared after successful initialization
     */
    initialize(): Promise<void>;
    private doInitialize;
    /**
     * Ensure Firestore is initialized before any operation.
     * This enables true lazy initialization - connect on first use, not startup.
     * @returns The initialized Firestore instance (guaranteed non-null)
     */
    private ensureInitialized;
    /**
     * FIX: Helper to get db with explicit null check instead of assertion
     * Throws a descriptive error if db is null (indicates a bug in initialization flow)
     */
    private getDb;
    /**
     * Get the raw Firestore database instance.
     * Ensures initialization before returning.
     * Use this when you need direct access to Firestore APIs (e.g., for custom collections).
     */
    getDatabase(): Promise<Firestore>;
    getProfile(userId: string): Promise<UserProfile | null>;
    saveProfile(profile: UserProfile): Promise<void>;
    deleteProfile(userId: string): Promise<boolean>;
    hasProfile(userId: string): Promise<boolean>;
    listProfiles(options?: QueryOptions): Promise<UserProfile[]>;
    saveSummary(userId: string, summary: ConversationSummary): Promise<void>;
    getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]>;
    addKeyMoment(userId: string, moment: KeyMoment): Promise<void>;
    getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]>;
    saveGoal(userId: string, goal: FinancialGoal): Promise<void>;
    getGoals(userId: string): Promise<FinancialGoal[]>;
    deleteGoal(userId: string, goalId: string): Promise<boolean>;
    searchProfiles(query: string, options?: QueryOptions): Promise<Array<SearchResult<UserProfile>>>;
    /**
     * Atomically update a user profile using a transaction.
     * Ensures that read-modify-write operations are safe from race conditions.
     *
     * @param userId - The user ID to update
     * @param updater - Function that receives current profile and returns updated profile
     * @param options - Transaction options
     * @returns The updated profile, or null if user doesn't exist and createIfMissing is false
     */
    atomicProfileUpdate(userId: string, updater: (profile: UserProfile) => UserProfile | Promise<UserProfile>, options?: {
        createIfMissing?: boolean;
        maxRetries?: number;
    }): Promise<UserProfile | null>;
    /**
     * Batch update multiple profiles atomically
     * Useful for bulk operations like migrations
     */
    batchProfileUpdate(updates: Array<{
        userId: string;
        updater: (profile: UserProfile) => UserProfile;
    }>): Promise<{
        success: number;
        failed: number;
        errors: string[];
    }>;
    close(): Promise<void>;
    private serializeForFirestore;
    /**
     * Hydrate raw Firestore data by converting date strings/timestamps to Date objects.
     * Returns a Record that should then be validated with type guards.
     */
    private hydrateData;
}
export declare function getFirestoreStore(config?: FirestoreConfig): FirestoreStore;
export declare function resetFirestoreStore(): Promise<void>;
export default FirestoreStore;
//# sourceMappingURL=firestore-store.d.ts.map