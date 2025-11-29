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

import { log } from '@livekit/agents';
import { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

interface PoolConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idleTimeoutMillis?: number;
}

// Use any for Pool to avoid pg type dependency
type Pool = {
  connect: () => Promise<PoolClient>;
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  end: () => Promise<void>;
};

type PoolClient = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

// ============================================================================
// POSTGRESQL STORE
// ============================================================================

export class PostgresStore extends MemoryStore {
  private pool: Pool | null = null;
  private config: PoolConfig;
  private initialized = false;

  constructor(config?: PoolConfig) {
    super();
    this.config = config || {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid requiring pg at compile time
      const pg = await import('pg');
      const Pool = pg.default?.Pool || pg.Pool;
      this.pool = new Pool(this.config) as Pool;

      const client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS conversation_summaries (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          session_id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS key_moments (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS financial_goals (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON conversation_summaries(user_id);
        CREATE INDEX IF NOT EXISTS idx_profiles_updated ON user_profiles(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_moments_user_id ON key_moments(user_id);
        CREATE INDEX IF NOT EXISTS idx_goals_user_id ON financial_goals(user_id);
      `);

      client.release();
      this.initialized = true;
      getLogger().info('PostgreSQL store initialized');
    } catch (error) {
      getLogger().error(`PostgreSQL initialization failed: ${error}`);
      throw error;
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query('SELECT data FROM user_profiles WHERE id = $1', [
        userId,
      ]);

      if (result.rows.length === 0) return null;
      return this.hydrateProfile(result.rows[0].data as unknown as UserProfile);
    } catch (error) {
      getLogger().error(`getProfile error: ${error}`);
      return null;
    }
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const serialized = this.serializeProfile(profile);

      await this.pool.query(
        `
        INSERT INTO user_profiles (id, data, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id) 
        DO UPDATE SET data = $2, updated_at = NOW()
      `,
        [profile.id, JSON.stringify(serialized)]
      );

      getLogger().debug(`Saved profile: ${profile.id}`);
    } catch (error) {
      getLogger().error(`saveProfile error: ${error}`);
      throw error;
    }
  }

  async deleteProfile(userId: string): Promise<boolean> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query('DELETE FROM user_profiles WHERE id = $1', [userId]);
      return result.rowCount > 0;
    } catch (error) {
      getLogger().error(`deleteProfile error: ${error}`);
      return false;
    }
  }

  async hasProfile(userId: string): Promise<boolean> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query('SELECT 1 FROM user_profiles WHERE id = $1', [userId]);
      return result.rows.length > 0;
    } catch (error) {
      getLogger().error(`hasProfile error: ${error}`);
      return false;
    }
  }

  async listProfiles(options?: QueryOptions): Promise<UserProfile[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const limit = options?.limit || 100;
      const offset = options?.offset || 0;
      const sortBy = options?.sortBy || 'updated_at';
      const sortOrder = options?.sortOrder || 'desc';

      const result = await this.pool.query(
        `SELECT data FROM user_profiles ORDER BY ${sortBy} ${sortOrder} LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map((row) => this.hydrateProfile(row.data as unknown as UserProfile));
    } catch (error) {
      getLogger().error(`listProfiles error: ${error}`);
      return [];
    }
  }

  async saveSummary(userId: string, summary: ConversationSummary): Promise<void> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      await this.pool.query(
        `
        INSERT INTO conversation_summaries (id, user_id, session_id, data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET data = $4
      `,
        [summary.id, userId, summary.sessionId, JSON.stringify(summary)]
      );

      getLogger().debug(`Saved summary: ${summary.id}`);
    } catch (error) {
      getLogger().error(`saveSummary error: ${error}`);
      throw error;
    }
  }

  async getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const limit = options?.limit || 10;
      const offset = options?.offset || 0;

      const result = await this.pool.query(
        `
        SELECT data FROM conversation_summaries
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
        [userId, limit, offset]
      );

      return result.rows.map((row) => row.data as unknown as ConversationSummary);
    } catch (error) {
      getLogger().error(`getSummaries error: ${error}`);
      return [];
    }
  }

  async addKeyMoment(userId: string, moment: KeyMoment): Promise<void> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const momentId = moment.id || `moment_${Date.now()}`;
      await this.pool.query(
        `
        INSERT INTO key_moments (id, user_id, data, created_at)
        VALUES ($1, $2, $3, NOW())
      `,
        [momentId, userId, JSON.stringify({ ...moment, id: momentId })]
      );

      getLogger().debug(`Added key moment for user: ${userId}`);
    } catch (error) {
      getLogger().error(`addKeyMoment error: ${error}`);
      throw error;
    }
  }

  async getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const limit = options?.limit || 50;

      const result = await this.pool.query(
        `
        SELECT data FROM key_moments
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
        [userId, limit]
      );

      return result.rows.map((row) => row.data as unknown as KeyMoment);
    } catch (error) {
      getLogger().error(`getKeyMoments error: ${error}`);
      return [];
    }
  }

  async saveGoal(userId: string, goal: FinancialGoal): Promise<void> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      await this.pool.query(
        `
        INSERT INTO financial_goals (id, user_id, data, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET data = $3
      `,
        [goal.id, userId, JSON.stringify(goal)]
      );

      getLogger().debug(`Saved goal: ${goal.id}`);
    } catch (error) {
      getLogger().error(`saveGoal error: ${error}`);
      throw error;
    }
  }

  async getGoals(userId: string): Promise<FinancialGoal[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query(
        `
        SELECT data FROM financial_goals
        WHERE user_id = $1
      `,
        [userId]
      );

      return result.rows.map((row) => row.data as unknown as FinancialGoal);
    } catch (error) {
      getLogger().error(`getGoals error: ${error}`);
      return [];
    }
  }

  async deleteGoal(userId: string, goalId: string): Promise<boolean> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query(
        'DELETE FROM financial_goals WHERE id = $1 AND user_id = $2',
        [goalId, userId]
      );
      return result.rowCount > 0;
    } catch (error) {
      getLogger().error(`deleteGoal error: ${error}`);
      return false;
    }
  }

  async searchProfiles(
    query: string,
    options?: QueryOptions
  ): Promise<SearchResult<UserProfile>[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const limit = options?.limit || 10;

      const result = await this.pool.query(
        `
        SELECT id, data,
          ts_rank(to_tsvector('english', data::text), plainto_tsquery('english', $1)) as rank
        FROM user_profiles
        WHERE to_tsvector('english', data::text) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
      `,
        [query, limit]
      );

      return result.rows.map((row) => ({
        item: this.hydrateProfile(row.data as unknown as UserProfile),
        score: row.rank as number,
      }));
    } catch (error) {
      getLogger().error(`searchProfiles error: ${error}`);
      return [];
    }
  }

  async getAllUserIds(): Promise<string[]> {
    if (!this.pool) throw new Error('PostgresStore not initialized');

    try {
      const result = await this.pool.query('SELECT id FROM user_profiles');
      return result.rows.map((row) => row.id as string);
    } catch (error) {
      getLogger().error(`getAllUserIds error: ${error}`);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      getLogger().info('PostgreSQL connection closed');
    }
  }

  private serializeProfile(profile: UserProfile): Record<string, unknown> {
    return JSON.parse(
      JSON.stringify(profile, (key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
      })
    );
  }

  private hydrateProfile(data: UserProfile): UserProfile {
    const dateFields = ['firstContact', 'lastContact', 'createdAt', 'updatedAt'];
    const hydrated = { ...data };

    for (const field of dateFields) {
      const value = (hydrated as Record<string, unknown>)[field];
      if (typeof value === 'string') {
        (hydrated as Record<string, unknown>)[field] = new Date(value);
      }
    }

    return hydrated;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let postgresInstance: PostgresStore | null = null;

export function getPostgresStore(config?: PoolConfig): PostgresStore {
  if (!postgresInstance) {
    postgresInstance = new PostgresStore(config);
  }
  return postgresInstance;
}

export function resetPostgresStore(): void {
  if (postgresInstance) {
    postgresInstance.close();
    postgresInstance = null;
  }
}

export default PostgresStore;
