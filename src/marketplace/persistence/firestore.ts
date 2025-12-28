/**
 * Firestore Persistence for Marketplace
 *
 * Persists marketplace data to Firestore for production use.
 * Provides a storage abstraction that can switch between
 * in-memory (dev) and Firestore (prod) backends.
 *
 * Collections:
 * - marketplace_tools/{toolId} - Tool manifests
 * - marketplace_agents/{agentId} - Agent manifests
 * - marketplace_installations/{installationId} - User installations
 * - marketplace_executions/{executionId} - Execution history
 */

import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  AgentManifest,
  Installation,
  MarketplaceId,
  ToolExecution,
  ToolManifest,
  TrustLevel,
  UserId,
} from '../schema/types.js';
import { InMemoryMarketplaceStore } from './in-memory.js';

const log = getLogger().child({ module: 'marketplace-firestore' });

// ============================================================================
// TYPES
// ============================================================================

/** Internal Firestore document fields added by the persistence layer */
interface FirestoreInternalFields {
  _updatedAt?: Date;
  _createdAt?: Date;
}

/** Firestore document wrapper that includes internal fields */
type FirestoreDocument<T> = T & FirestoreInternalFields;

/** Strip internal Firestore fields from a document */
function stripInternalFields<T extends object>(doc: FirestoreDocument<T>): T {
  const { _updatedAt, _createdAt, ...data } = doc as T & FirestoreInternalFields;
  return data as T;
}

export interface MarketplaceStore {
  // Tool operations
  saveTool(manifest: ToolManifest): Promise<void>;
  getTool(id: MarketplaceId): Promise<ToolManifest | null>;
  listTools(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<ToolManifest[]>;
  deleteTool(id: MarketplaceId): Promise<void>;

  // Agent operations
  saveAgent(manifest: AgentManifest): Promise<void>;
  getAgent(id: MarketplaceId): Promise<AgentManifest | null>;
  listAgents(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<AgentManifest[]>;
  deleteAgent(id: MarketplaceId): Promise<void>;

  // Installation operations
  saveInstallation(installation: Installation): Promise<void>;
  getInstallation(id: string): Promise<Installation | null>;
  getInstallationByUserItem(userId: UserId, itemId: MarketplaceId): Promise<Installation | null>;
  listInstallations(
    userId: UserId,
    options?: { itemType?: 'agent' | 'tool' }
  ): Promise<Installation[]>;
  updateInstallation(id: string, updates: Partial<Installation>): Promise<void>;

  // Execution tracking
  saveExecution(execution: ToolExecution): Promise<void>;
  listExecutions(
    userId: UserId,
    options?: { toolId?: MarketplaceId; limit?: number; since?: string }
  ): Promise<ToolExecution[]>;

  // Initialization
  initialize(): Promise<void>;
  isAvailable(): boolean;
}

// ============================================================================
// FIRESTORE IMPLEMENTATION
// ============================================================================

const COLLECTIONS = {
  TOOLS: 'marketplace_tools',
  AGENTS: 'marketplace_agents',
  INSTALLATIONS: 'marketplace_installations',
  EXECUTIONS: 'marketplace_executions',
} as const;

class FirestoreMarketplaceStore implements MarketplaceStore {
  private db: FirebaseFirestore.Firestore | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const admin = await import('firebase-admin');

      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        });
      }

      this.db = admin.firestore();
      this.initialized = true;
      log.info('Firestore marketplace store initialized');
    } catch (error) {
      log.warn({ error }, 'Firestore not available for marketplace');
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.db !== null;
  }

  // ---- Tool Operations ----

  async saveTool(manifest: ToolManifest): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.TOOLS)
      .doc(manifest.id)
      .set(
        removeUndefined({
          ...manifest,
          _updatedAt: new Date(),
        })
      );
    log.debug({ toolId: manifest.id }, 'Tool saved to Firestore');
  }

  async getTool(id: MarketplaceId): Promise<ToolManifest | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.TOOLS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    return stripInternalFields(data as FirestoreDocument<ToolManifest>);
  }

  async listTools(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<ToolManifest[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db.collection(COLLECTIONS.TOOLS);

    if (options?.category) {
      query = query.where('metadata.category', '==', options.category);
    }

    if (options?.trustLevel) {
      query = query.where('verification.trustLevel', '==', options.trustLevel);
    }

    const snapshot = await query.get();
    let tools = snapshot.docs.map((doc) =>
      stripInternalFields(doc.data() as FirestoreDocument<ToolManifest>)
    );

    // Filter by tags in memory (Firestore doesn't support array-contains-any with other filters)
    if (options?.tags?.length) {
      tools = tools.filter((t) => options.tags!.some((tag) => t.metadata.tags.includes(tag)));
    }

    return tools;
  }

  async deleteTool(id: MarketplaceId): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');
    await this.db.collection(COLLECTIONS.TOOLS).doc(id).delete();
    log.debug({ toolId: id }, 'Tool deleted from Firestore');
  }

  // ---- Agent Operations ----

  async saveAgent(manifest: AgentManifest): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.AGENTS)
      .doc(manifest.id)
      .set(
        removeUndefined({
          ...manifest,
          _updatedAt: new Date(),
        })
      );
    log.debug({ agentId: manifest.id }, 'Agent saved to Firestore');
  }

  async getAgent(id: MarketplaceId): Promise<AgentManifest | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.AGENTS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    return stripInternalFields(data as FirestoreDocument<AgentManifest>);
  }

  async listAgents(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<AgentManifest[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db.collection(COLLECTIONS.AGENTS);

    if (options?.category) {
      query = query.where('metadata.category', '==', options.category);
    }

    if (options?.trustLevel) {
      query = query.where('verification.trustLevel', '==', options.trustLevel);
    }

    const snapshot = await query.get();
    let agents = snapshot.docs.map((doc) =>
      stripInternalFields(doc.data() as FirestoreDocument<AgentManifest>)
    );

    if (options?.tags?.length) {
      agents = agents.filter((a) => options.tags!.some((tag) => a.metadata.tags.includes(tag)));
    }

    return agents;
  }

  async deleteAgent(id: MarketplaceId): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');
    await this.db.collection(COLLECTIONS.AGENTS).doc(id).delete();
    log.debug({ agentId: id }, 'Agent deleted from Firestore');
  }

  // ---- Installation Operations ----

  async saveInstallation(installation: Installation): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.INSTALLATIONS)
      .doc(installation.id)
      .set(
        removeUndefined({
          ...installation,
          _updatedAt: new Date(),
        })
      );
    log.debug({ installationId: installation.id }, 'Installation saved to Firestore');
  }

  async getInstallation(id: string): Promise<Installation | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.INSTALLATIONS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    return stripInternalFields(data as FirestoreDocument<Installation>);
  }

  async getInstallationByUserItem(
    userId: UserId,
    itemId: MarketplaceId
  ): Promise<Installation | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const snapshot = await this.db
      .collection(COLLECTIONS.INSTALLATIONS)
      .where('userId', '==', userId)
      .where('itemId', '==', itemId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    return stripInternalFields(snapshot.docs[0].data() as FirestoreDocument<Installation>);
  }

  async listInstallations(
    userId: UserId,
    options?: { itemType?: 'agent' | 'tool' }
  ): Promise<Installation[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db
      .collection(COLLECTIONS.INSTALLATIONS)
      .where('userId', '==', userId)
      .where('status', '==', 'active');

    if (options?.itemType) {
      query = query.where('itemType', '==', options.itemType);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) =>
      stripInternalFields(doc.data() as FirestoreDocument<Installation>)
    );
  }

  async updateInstallation(id: string, updates: Partial<Installation>): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.INSTALLATIONS)
      .doc(id)
      .update(
        cleanForFirestore({
          ...updates,
          _updatedAt: new Date(),
        })
      );
    log.debug({ installationId: id }, 'Installation updated in Firestore');
  }

  // ---- Execution Tracking ----

  async saveExecution(execution: ToolExecution): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.EXECUTIONS)
      .doc(execution.id)
      .set(
        removeUndefined({
          ...execution,
          _createdAt: new Date(),
        })
      );
  }

  async listExecutions(
    userId: UserId,
    options?: { toolId?: MarketplaceId; limit?: number; since?: string }
  ): Promise<ToolExecution[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db
      .collection(COLLECTIONS.EXECUTIONS)
      .where('userId', '==', userId)
      .orderBy('executedAt', 'desc');

    if (options?.toolId) {
      query = query.where('toolId', '==', options.toolId);
    }

    if (options?.since) {
      query = query.where('executedAt', '>=', options.since);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) =>
      stripInternalFields(doc.data() as FirestoreDocument<ToolExecution>)
    );
  }
}

// In-memory implementation is in ./in-memory.ts

// ============================================================================
// FACTORY
// ============================================================================

let storeInstance: MarketplaceStore | null = null;

/**
 * Get the marketplace store instance.
 * Returns Firestore in production, in-memory for development.
 */
export async function getMarketplaceStore(): Promise<MarketplaceStore> {
  if (storeInstance) return storeInstance;

  // Try Firestore first in production
  const useFirestore =
    process.env.NODE_ENV === 'production' ||
    process.env.USE_FIRESTORE_MARKETPLACE === 'true' ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;

  if (useFirestore) {
    try {
      const firestoreStore = new FirestoreMarketplaceStore();
      await firestoreStore.initialize();
      storeInstance = firestoreStore;
      log.info('Using Firestore marketplace store');
      return storeInstance;
    } catch (error) {
      log.warn({ error }, 'Firestore not available, falling back to in-memory');
    }
  }

  // Fall back to in-memory
  storeInstance = new InMemoryMarketplaceStore();
  await storeInstance.initialize();
  log.info('Using in-memory marketplace store');
  return storeInstance;
}

/**
 * Reset the store (for testing)
 */
export function resetMarketplaceStore(): void {
  storeInstance = null;
}

/**
 * Get an in-memory store (for testing)
 */
export function createInMemoryStore(): InMemoryMarketplaceStore {
  return new InMemoryMarketplaceStore();
}
