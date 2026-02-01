/**
 * Firestore Link Storage
 *
 * Persistence layer for memory links in Google Cloud Firestore.
 *
 * @module memory/unified-store/graph/firestore-links
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryLink, MemoryLinkType, MemoryLinkInput } from '../types.js';
import { LINK_TYPE_CONFIGS } from './link-types.js';

const log = createLogger({ module: 'FirestoreLinks' });

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreInstance {
  collection: (path: string) => CollectionReference;
  terminate: () => Promise<void>;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
  update: (data: Record<string, unknown>) => Promise<unknown>;
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
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  get: () => Promise<QuerySnapshot>;
}

interface FirestoreLinkConfig {
  projectId?: string;
  databaseId?: string;
}

// ============================================================================
// FIRESTORE LINK STORE
// ============================================================================

/**
 * Firestore-based storage for memory links
 */
export class FirestoreLinkStore {
  private db: FirestoreInstance | null = null;
  private config: FirestoreLinkConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private readonly USERS_COLLECTION = 'bogle_users';
  private readonly LINKS_SUBCOLLECTION = 'memory_links';

  constructor(config?: FirestoreLinkConfig) {
    this.config = {
      projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: config?.databaseId || process.env.FIRESTORE_DATABASE || '(default)',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');

      this.db = new Firestore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
      }) as unknown as FirestoreInstance;

      this.initialized = true;
      log.info({ projectId: this.config.projectId }, 'Firestore link store initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize Firestore link store');
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LINK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new link between memories
   */
  async createLink(userId: string, input: MemoryLinkInput): Promise<MemoryLink> {
    await this.ensureInitialized();

    const config = LINK_TYPE_CONFIGS[input.type];
    const link: MemoryLink = {
      id: uuidv4(),
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      weight: input.weight ?? config.defaultWeight,
      bidirectional: input.bidirectional ?? config.defaultBidirectional,
      createdAt: new Date(),
      lastReinforced: new Date(),
      reinforcementCount: 1,
      metadata: {
        detectedBy: input.detectedBy || 'manual',
        confidence: input.confidence || 0.8,
        context: input.context,
      },
    };

    const docRef = this.getLinkDocRef(userId, link.id);
    await docRef.set(this.toFirestoreDoc(link));

    log.debug({ userId, linkId: link.id, type: link.type }, 'Link created');
    return link;
  }

  /**
   * Get a link by ID
   */
  async getLink(userId: string, linkId: string): Promise<MemoryLink | null> {
    await this.ensureInitialized();

    const docRef = this.getLinkDocRef(userId, linkId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return null;
    }

    return this.fromFirestoreDoc(snapshot.id, snapshot.data()!);
  }

  /**
   * Get all links for a memory (as source or target)
   */
  async getLinksForMemory(
    userId: string,
    memoryId: string,
    options?: { type?: MemoryLinkType; direction?: 'outgoing' | 'incoming' | 'both' }
  ): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    const direction = options?.direction || 'both';
    const links: MemoryLink[] = [];

    // Get outgoing links (memory as source)
    if (direction === 'outgoing' || direction === 'both') {
      let query: Query = this.getLinksCollectionRef(userId).where(
        'sourceId',
        '==',
        memoryId
      ) as unknown as Query;

      if (options?.type) {
        query = query.where('type', '==', options.type);
      }

      const outgoingSnapshot = await query.get();
      for (const doc of outgoingSnapshot.docs) {
        links.push(this.fromFirestoreDoc(doc.id, doc.data()!));
      }
    }

    // Get incoming links (memory as target)
    if (direction === 'incoming' || direction === 'both') {
      let query: Query = this.getLinksCollectionRef(userId).where(
        'targetId',
        '==',
        memoryId
      ) as unknown as Query;

      if (options?.type) {
        query = query.where('type', '==', options.type);
      }

      const incomingSnapshot = await query.get();
      for (const doc of incomingSnapshot.docs) {
        // Avoid duplicates for bidirectional links
        const existing = links.find((l) => l.id === doc.id);
        if (!existing) {
          links.push(this.fromFirestoreDoc(doc.id, doc.data()!));
        }
      }
    }

    return links;
  }

  /**
   * Get all links of a specific type for a user
   */
  async getLinksByType(userId: string, type: MemoryLinkType, limit?: number): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    let query: Query = this.getLinksCollectionRef(userId).where(
      'type',
      '==',
      type
    ) as unknown as Query;

    if (limit) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc.id, doc.data()!));
  }

  /**
   * Update a link
   */
  async updateLink(userId: string, linkId: string, updates: Partial<MemoryLink>): Promise<void> {
    await this.ensureInitialized();

    const docRef = this.getLinkDocRef(userId, linkId);
    const updateData: Record<string, unknown> = {};

    if (updates.weight !== undefined) updateData.weight = updates.weight;
    if (updates.bidirectional !== undefined) updateData.bidirectional = updates.bidirectional;
    if (updates.lastReinforced !== undefined) updateData.lastReinforced = updates.lastReinforced;
    if (updates.reinforcementCount !== undefined) updateData.reinforcementCount = updates.reinforcementCount;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    await docRef.update(updateData);
    log.debug({ userId, linkId }, 'Link updated');
  }

  /**
   * Reinforce a link (increase weight and count)
   */
  async reinforceLink(userId: string, linkId: string): Promise<MemoryLink | null> {
    await this.ensureInitialized();

    const link = await this.getLink(userId, linkId);
    if (!link) return null;

    const config = LINK_TYPE_CONFIGS[link.type];

    // Calculate new weight with diminishing returns
    const boost = 0.1 / Math.sqrt(link.reinforcementCount + 1);
    const newWeight = Math.min(link.weight + boost, config.maxWeight);

    await this.updateLink(userId, linkId, {
      weight: newWeight,
      lastReinforced: new Date(),
      reinforcementCount: link.reinforcementCount + 1,
    });

    return {
      ...link,
      weight: newWeight,
      lastReinforced: new Date(),
      reinforcementCount: link.reinforcementCount + 1,
    };
  }

  /**
   * Delete a link
   */
  async deleteLink(userId: string, linkId: string): Promise<void> {
    await this.ensureInitialized();

    const docRef = this.getLinkDocRef(userId, linkId);
    await docRef.delete();

    log.debug({ userId, linkId }, 'Link deleted');
  }

  /**
   * Delete all links for a memory
   */
  async deleteLinksForMemory(userId: string, memoryId: string): Promise<number> {
    await this.ensureInitialized();

    const links = await this.getLinksForMemory(userId, memoryId);
    await Promise.all(links.map((link) => this.deleteLink(userId, link.id)));

    return links.length;
  }

  /**
   * Check if a link exists between two memories
   */
  async linkExists(
    userId: string,
    sourceId: string,
    targetId: string,
    type?: MemoryLinkType
  ): Promise<boolean> {
    await this.ensureInitialized();

    let query: Query = this.getLinksCollectionRef(userId)
      .where('sourceId', '==', sourceId)
      .where('targetId', '==', targetId) as unknown as Query;

    if (type) {
      query = query.where('type', '==', type);
    }

    query = query.limit(1);
    const snapshot = await query.get();
    return !snapshot.empty;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create multiple links in batch
   */
  async createLinks(userId: string, inputs: MemoryLinkInput[]): Promise<MemoryLink[]> {
    const links: MemoryLink[] = [];
    for (const input of inputs) {
      const link = await this.createLink(userId, input);
      links.push(link);
    }
    return links;
  }

  /**
   * Get link statistics for a user
   */
  async getLinkStats(userId: string): Promise<{
    total: number;
    byType: Record<MemoryLinkType, number>;
  }> {
    await this.ensureInitialized();

    const snapshot = await this.getLinksCollectionRef(userId).get();
    const byType: Partial<Record<MemoryLinkType, number>> = {};
    let total = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data) continue;
      const type = data.type as MemoryLinkType;
      byType[type] = (byType[type] || 0) + 1;
      total++;
    }

    return {
      total,
      byType: byType as Record<MemoryLinkType, number>,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getLinkDocRef(userId: string, linkId: string): DocumentReference {
    return this.db!.collection(this.USERS_COLLECTION)
      .doc(userId)
      .collection(this.LINKS_SUBCOLLECTION)
      .doc(linkId);
  }

  private getLinksCollectionRef(userId: string): CollectionReference {
    return this.db!.collection(this.USERS_COLLECTION)
      .doc(userId)
      .collection(this.LINKS_SUBCOLLECTION);
  }

  private toFirestoreDoc(link: MemoryLink): Record<string, unknown> {
    return {
      sourceId: link.sourceId,
      targetId: link.targetId,
      type: link.type,
      weight: link.weight,
      bidirectional: link.bidirectional,
      createdAt: link.createdAt,
      lastReinforced: link.lastReinforced,
      reinforcementCount: link.reinforcementCount,
      metadata: link.metadata,
    };
  }

  private fromFirestoreDoc(id: string, data: Record<string, unknown>): MemoryLink {
    return {
      id,
      sourceId: data.sourceId as string,
      targetId: data.targetId as string,
      type: data.type as MemoryLinkType,
      weight: data.weight as number,
      bidirectional: data.bidirectional as boolean,
      createdAt: this.toDate(data.createdAt),
      lastReinforced: this.toDate(data.lastReinforced),
      reinforcementCount: (data.reinforcementCount as number) || 1,
      metadata: {
        detectedBy: (data.metadata as Record<string, unknown>)?.detectedBy as
          | 'auto'
          | 'manual'
          | 'llm',
        confidence: (data.metadata as Record<string, unknown>)?.confidence as number,
        context: (data.metadata as Record<string, unknown>)?.context as string | undefined,
      },
    };
  }

  private toDate(value: unknown): Date {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'object' && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return new Date();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: FirestoreLinkStore | null = null;

/**
 * Get or create the Firestore link store singleton
 */
export function getFirestoreLinkStore(config?: FirestoreLinkConfig): FirestoreLinkStore {
  if (!instance) {
    instance = new FirestoreLinkStore(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetFirestoreLinkStore(): void {
  instance = null;
}
