/**
 * PostgreSQL Memory Store
 *
 * Production-grade persistent storage using PostgreSQL.
 *
 * Requires: npm install pg
 *
 * Environment:
 * - DATABASE_URL: PostgreSQL connection string
 */
import { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
import type { UserProfile, ConversationSummary, KeyMoment, FinancialGoal } from '../types/user-profile.js';
interface PoolConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | {
        rejectUnauthorized: boolean;
    };
    max?: number;
    idleTimeoutMillis?: number;
}
export declare class PostgresStore extends MemoryStore {
    private pool;
    private config;
    private initialized;
    constructor(config?: PoolConfig);
    initialize(): Promise<void>;
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
    getAllUserIds(): Promise<string[]>;
    close(): Promise<void>;
    private serializeProfile;
    private hydrateProfile;
}
export declare function getPostgresStore(config?: PoolConfig): PostgresStore;
export declare function resetPostgresStore(): void;
export default PostgresStore;
//# sourceMappingURL=postgres-store.d.ts.map