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

const log = getLogger().child({ module: 'marketplace-firestore' });

// ============================================================================
// TYPES
// ============================================================================

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
      .set({
        ...manifest,
        _updatedAt: new Date(),
      });
    log.debug({ toolId: manifest.id }, 'Tool saved to Firestore');
  }

  async getTool(id: MarketplaceId): Promise<ToolManifest | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.TOOLS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    // Remove internal fields
    const { _updatedAt, ...manifest } = data;
    return manifest as ToolManifest;
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
    let tools = snapshot.docs.map((doc) => {
      const { _updatedAt, ...manifest } = doc.data();
      return manifest as ToolManifest;
    });

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
      .set({
        ...manifest,
        _updatedAt: new Date(),
      });
    log.debug({ agentId: manifest.id }, 'Agent saved to Firestore');
  }

  async getAgent(id: MarketplaceId): Promise<AgentManifest | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.AGENTS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    const { _updatedAt, ...manifest } = data;
    return manifest as AgentManifest;
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
    let agents = snapshot.docs.map((doc) => {
      const { _updatedAt, ...manifest } = doc.data();
      return manifest as AgentManifest;
    });

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
      .set({
        ...installation,
        _updatedAt: new Date(),
      });
    log.debug({ installationId: installation.id }, 'Installation saved to Firestore');
  }

  async getInstallation(id: string): Promise<Installation | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.INSTALLATIONS).doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    const { _updatedAt, ...installation } = data;
    return installation as Installation;
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

    const data = snapshot.docs[0].data();
    const { _updatedAt, ...installation } = data;
    return installation as Installation;
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
    return snapshot.docs.map((doc) => {
      const { _updatedAt, ...installation } = doc.data();
      return installation as Installation;
    });
  }

  async updateInstallation(id: string, updates: Partial<Installation>): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.INSTALLATIONS)
      .doc(id)
      .update({
        ...updates,
        _updatedAt: new Date(),
      });
    log.debug({ installationId: id }, 'Installation updated in Firestore');
  }

  // ---- Execution Tracking ----

  async saveExecution(execution: ToolExecution): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.EXECUTIONS)
      .doc(execution.id)
      .set({
        ...execution,
        _createdAt: new Date(),
      });
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
    return snapshot.docs.map((doc) => {
      const { _createdAt, ...execution } = doc.data();
      return execution as ToolExecution;
    });
  }
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION (for development/testing)
// ============================================================================

class InMemoryMarketplaceStore implements MarketplaceStore {
  private tools = new Map<MarketplaceId, ToolManifest>();
  private agents = new Map<MarketplaceId, AgentManifest>();
  private installations = new Map<string, Installation>();
  private executions: ToolExecution[] = [];

  async initialize(): Promise<void> {
    log.info('In-memory marketplace store initialized');
  }

  isAvailable(): boolean {
    return true;
  }

  // Tool operations
  async saveTool(manifest: ToolManifest): Promise<void> {
    this.tools.set(manifest.id, manifest);
  }

  async getTool(id: MarketplaceId): Promise<ToolManifest | null> {
    return this.tools.get(id) || null;
  }

  async listTools(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<ToolManifest[]> {
    let tools = Array.from(this.tools.values());

    if (options?.category) {
      tools = tools.filter((t) => t.metadata.category === options.category);
    }

    if (options?.trustLevel) {
      tools = tools.filter((t) => t.verification.trustLevel === options.trustLevel);
    }

    if (options?.tags?.length) {
      tools = tools.filter((t) => options.tags!.some((tag) => t.metadata.tags.includes(tag)));
    }

    return tools;
  }

  async deleteTool(id: MarketplaceId): Promise<void> {
    this.tools.delete(id);
  }

  // Agent operations
  async saveAgent(manifest: AgentManifest): Promise<void> {
    this.agents.set(manifest.id, manifest);
  }

  async getAgent(id: MarketplaceId): Promise<AgentManifest | null> {
    return this.agents.get(id) || null;
  }

  async listAgents(options?: {
    category?: string;
    trustLevel?: TrustLevel;
    tags?: string[];
  }): Promise<AgentManifest[]> {
    let agents = Array.from(this.agents.values());

    if (options?.category) {
      agents = agents.filter((a) => a.metadata.category === options.category);
    }

    if (options?.trustLevel) {
      agents = agents.filter((a) => a.verification.trustLevel === options.trustLevel);
    }

    if (options?.tags?.length) {
      agents = agents.filter((a) => options.tags!.some((tag) => a.metadata.tags.includes(tag)));
    }

    return agents;
  }

  async deleteAgent(id: MarketplaceId): Promise<void> {
    this.agents.delete(id);
  }

  // Installation operations
  async saveInstallation(installation: Installation): Promise<void> {
    this.installations.set(installation.id, installation);
  }

  async getInstallation(id: string): Promise<Installation | null> {
    return this.installations.get(id) || null;
  }

  async getInstallationByUserItem(
    userId: UserId,
    itemId: MarketplaceId
  ): Promise<Installation | null> {
    return (
      Array.from(this.installations.values()).find(
        (i) => i.userId === userId && i.itemId === itemId && i.status === 'active'
      ) || null
    );
  }

  async listInstallations(
    userId: UserId,
    options?: { itemType?: 'agent' | 'tool' }
  ): Promise<Installation[]> {
    let installations = Array.from(this.installations.values()).filter(
      (i) => i.userId === userId && i.status === 'active'
    );

    if (options?.itemType) {
      installations = installations.filter((i) => i.itemType === options.itemType);
    }

    return installations;
  }

  async updateInstallation(id: string, updates: Partial<Installation>): Promise<void> {
    const existing = this.installations.get(id);
    if (existing) {
      this.installations.set(id, { ...existing, ...updates });
    }
  }

  // Execution tracking
  async saveExecution(execution: ToolExecution): Promise<void> {
    this.executions.push(execution);
  }

  async listExecutions(
    userId: UserId,
    options?: { toolId?: MarketplaceId; limit?: number; since?: string }
  ): Promise<ToolExecution[]> {
    let results = this.executions.filter((e) => e.userId === userId);

    if (options?.toolId) {
      results = results.filter((e) => e.toolId === options.toolId);
    }

    if (options?.since) {
      const sinceDate = new Date(options.since);
      results = results.filter((e) => new Date(e.executedAt) >= sinceDate);
    }

    results.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // For testing
  clear(): void {
    this.tools.clear();
    this.agents.clear();
    this.installations.clear();
    this.executions = [];
  }
}

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
