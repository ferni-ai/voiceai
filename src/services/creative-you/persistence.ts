/**
 * 🗄️ Creative You Persistence Layer
 *
 * Firestore persistence for Creative You data:
 * - Creative DNA profiles
 * - Watch sessions
 * - Saved insights
 * - Podcast listening history
 *
 * Falls back to in-memory storage when Firestore is unavailable.
 */

import { removeUndefined } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { CreativeDNA, CreativeInsight, CreativeJourneyStats } from './creative-dna.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface Firestore {
  collection(path: string): CollectionRef;
}

interface CollectionRef {
  doc(id: string): DocumentRef;
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

interface DocumentRef {
  get(): Promise<DocumentSnapshot>;
  set(data: unknown, options?: { merge?: boolean }): Promise<void>;
  update(data: unknown): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): CollectionRef;
}

interface Query {
  get(): Promise<QuerySnapshot>;
  limit(n: number): Query;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query;
  where(field: string, op: string, value: unknown): Query;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  forEach(callback: (doc: DocumentSnapshot) => void): void;
}

interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

// ============================================================================
// PERSISTENCE CLASS
// ============================================================================

// Topic history type for persistence
interface TopicHistoryRecord {
  topic: string;
  count: number;
  lastSeen: Date;
  sessions: string[]; // Session IDs where topic was discussed
}

interface UserTopicHistory {
  userId: string;
  topics: TopicHistoryRecord[];
  lastUpdated: Date;
}

class CreativeYouPersistence {
  private db: Firestore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // In-memory fallback stores
  private memoryDNA = new Map<string, CreativeDNA>();
  private memoryInsights = new Map<string, CreativeInsight[]>();
  private memoryWatchHistory = new Map<string, WatchRecord[]>();
  private memoryTopicHistory = new Map<string, UserTopicHistory>();

  // Collection names
  private readonly COLLECTION_CREATIVE_DNA = 'creative_dna';
  private readonly COLLECTION_INSIGHTS = 'creative_insights';
  private readonly COLLECTION_WATCH_HISTORY = 'watch_history';
  private readonly COLLECTION_TOPIC_HISTORY = 'topic_history';

  /**
   * Initialize Firestore connection (lazy)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
      this.db = new FirestoreClass({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as Firestore;

      // Test connectivity
      await this.db.collection(this.COLLECTION_CREATIVE_DNA).limit(1).get();

      this.initialized = true;
      log.info('✅ Creative You persistence initialized with Firestore');
    } catch (error) {
      log.warn(
        { error: String(error) },
        '⚠️ Firestore not available for Creative You, using in-memory fallback'
      );
      this.db = null;
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Check if using Firestore or fallback
   */
  isUsingFirestore(): boolean {
    return this.db !== null;
  }

  // ========================================
  // CREATIVE DNA
  // ========================================

  /**
   * Save Creative DNA to Firestore
   */
  async saveCreativeDNA(userId: string, dna: CreativeDNA): Promise<void> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION_CREATIVE_DNA)
          .doc(userId)
          .set(
            {
              ...dna,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        log.debug({ userId }, '💾 Creative DNA saved to Firestore');
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save Creative DNA');
        // Fallback to memory
        this.memoryDNA.set(userId, dna);
      }
    } else {
      this.memoryDNA.set(userId, dna);
    }
  }

  /**
   * Load Creative DNA from Firestore
   */
  async loadCreativeDNA(userId: string): Promise<CreativeDNA | null> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION_CREATIVE_DNA).doc(userId).get();

        if (doc.exists) {
          return doc.data() as unknown as CreativeDNA;
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load Creative DNA');
      }
    }

    return this.memoryDNA.get(userId) || null;
  }

  // ========================================
  // INSIGHTS
  // ========================================

  /**
   * Save insight to Firestore
   */
  async saveInsight(insight: CreativeInsight): Promise<void> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION_INSIGHTS)
          .doc(insight.id)
          .set(
            removeUndefined({
              ...insight,
              savedAt: new Date().toISOString(),
            })
          );
        log.debug({ insightId: insight.id }, '💾 Insight saved to Firestore');
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to save insight');
        // Fallback
        const userInsights = this.memoryInsights.get(insight.userId) || [];
        userInsights.push(insight);
        this.memoryInsights.set(insight.userId, userInsights);
      }
    } else {
      const userInsights = this.memoryInsights.get(insight.userId) || [];
      userInsights.push(insight);
      this.memoryInsights.set(insight.userId, userInsights);
    }
  }

  /**
   * Load insights for a user
   */
  async loadInsights(
    userId: string,
    options?: { limit?: number; topic?: string }
  ): Promise<CreativeInsight[]> {
    await this.ensureInitialized();
    const limit = options?.limit || 50;

    if (this.db) {
      try {
        let query: Query = this.db
          .collection(this.COLLECTION_INSIGHTS)
          .where('userId', '==', userId)
          .orderBy('savedAt', 'desc')
          .limit(limit);

        const snapshot = await query.get();
        const insights: CreativeInsight[] = [];
        snapshot.forEach((doc: DocumentSnapshot) => {
          insights.push(doc.data() as unknown as CreativeInsight);
        });

        // Filter by topic client-side if needed
        if (options?.topic) {
          const topicLower = options.topic.toLowerCase();
          return insights.filter(
            (i) =>
              i.tags?.some((t) => t.toLowerCase().includes(topicLower)) ||
              i.topic?.toLowerCase().includes(topicLower)
          );
        }

        return insights;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load insights');
      }
    }

    // Fallback to memory
    let insights = this.memoryInsights.get(userId) || [];
    if (options?.topic) {
      const topicLower = options.topic.toLowerCase();
      insights = insights.filter(
        (i) =>
          i.tags?.some((t) => t.toLowerCase().includes(topicLower)) ||
          i.topic?.toLowerCase().includes(topicLower)
      );
    }
    return insights.slice(0, limit);
  }

  /**
   * Delete an insight
   */
  async deleteInsight(userId: string, insightId: string): Promise<boolean> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        await this.db.collection(this.COLLECTION_INSIGHTS).doc(insightId).delete();
        return true;
      } catch (error) {
        log.error({ error: String(error), insightId }, 'Failed to delete insight');
      }
    }

    // Fallback
    const insights = this.memoryInsights.get(userId);
    if (insights) {
      const index = insights.findIndex((i) => i.id === insightId);
      if (index !== -1) {
        insights.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  // ========================================
  // WATCH HISTORY
  // ========================================

  /**
   * Save watch record
   */
  async saveWatchRecord(record: WatchRecord): Promise<void> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        await this.db.collection(this.COLLECTION_WATCH_HISTORY).doc(record.id).set(record);
        log.debug({ recordId: record.id }, '💾 Watch record saved');
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to save watch record');
        // Fallback
        const history = this.memoryWatchHistory.get(record.userId) || [];
        history.push(record);
        this.memoryWatchHistory.set(record.userId, history);
      }
    } else {
      const history = this.memoryWatchHistory.get(record.userId) || [];
      history.push(record);
      this.memoryWatchHistory.set(record.userId, history);
    }
  }

  /**
   * Load watch history
   */
  async loadWatchHistory(userId: string, limit: number = 20): Promise<WatchRecord[]> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const snapshot = await this.db
          .collection(this.COLLECTION_WATCH_HISTORY)
          .where('userId', '==', userId)
          .orderBy('completedAt', 'desc')
          .limit(limit)
          .get();

        const records: WatchRecord[] = [];
        snapshot.forEach((doc: DocumentSnapshot) => {
          records.push(doc.data() as unknown as WatchRecord);
        });
        return records;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load watch history');
      }
    }

    // Fallback
    const history = this.memoryWatchHistory.get(userId) || [];
    return history
      .filter((r) => r.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, limit);
  }

  // ========================================
  // TOPIC HISTORY (for content personalization)
  // ========================================

  /**
   * Save topic history for a user
   */
  async saveTopicHistory(
    userId: string,
    topics: string[],
    sessionId: string
  ): Promise<void> {
    await this.ensureInitialized();

    // Load existing history
    const existing = await this.loadTopicHistory(userId);
    const now = new Date();

    // Update topic counts
    for (const topic of topics) {
      const existingTopic = existing.topics.find(
        (t) => t.topic.toLowerCase() === topic.toLowerCase()
      );
      if (existingTopic) {
        existingTopic.count++;
        existingTopic.lastSeen = now;
        if (!existingTopic.sessions.includes(sessionId)) {
          existingTopic.sessions.push(sessionId);
        }
      } else {
        existing.topics.push({
          topic,
          count: 1,
          lastSeen: now,
          sessions: [sessionId],
        });
      }
    }

    // Sort by recency and frequency
    existing.topics.sort((a, b) => {
      // Weight by both recency and frequency
      const aScore = a.count * 0.3 + (now.getTime() - a.lastSeen.getTime()) / -100000000;
      const bScore = b.count * 0.3 + (now.getTime() - b.lastSeen.getTime()) / -100000000;
      return bScore - aScore;
    });

    // Keep top 50 topics
    existing.topics = existing.topics.slice(0, 50);
    existing.lastUpdated = now;

    // Persist
    if (this.db) {
      try {
        const data = removeUndefined({
          userId,
          topics: existing.topics.map((t) => ({
            ...t,
            lastSeen: t.lastSeen.toISOString(),
          })),
          lastUpdated: now.toISOString(),
        });
        await this.db.collection(this.COLLECTION_TOPIC_HISTORY).doc(userId).set(data);
        log.debug({ userId, topicCount: topics.length }, '📚 Topic history saved');
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to save topic history');
        // Fallback to memory
        this.memoryTopicHistory.set(userId, existing);
      }
    } else {
      this.memoryTopicHistory.set(userId, existing);
    }
  }

  /**
   * Load topic history for a user
   */
  async loadTopicHistory(userId: string): Promise<UserTopicHistory> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION_TOPIC_HISTORY).doc(userId).get();
        if (doc.exists) {
          const data = doc.data() as Record<string, unknown>;
          return {
            userId,
            topics: ((data.topics as Array<Record<string, unknown>>) || []).map((t) => ({
              topic: t.topic as string,
              count: t.count as number,
              lastSeen: new Date(t.lastSeen as string),
              sessions: (t.sessions as string[]) || [],
            })),
            lastUpdated: data.lastUpdated ? new Date(data.lastUpdated as string) : new Date(),
          };
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load topic history');
      }
    }

    // Fallback to memory or return empty
    return (
      this.memoryTopicHistory.get(userId) || {
        userId,
        topics: [],
        lastUpdated: new Date(),
      }
    );
  }

  /**
   * Get top topics for a user (for recommendations)
   */
  async getTopTopics(userId: string, count: number = 10): Promise<string[]> {
    const history = await this.loadTopicHistory(userId);
    return history.topics.slice(0, count).map((t) => t.topic);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface WatchRecord {
  id: string;
  userId: string;
  contentType: 'video' | 'podcast';
  contentId: string;
  contentTitle: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds: number;
  percentWatched: number;
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: CreativeYouPersistence | null = null;

export function getCreativeYouPersistence(): CreativeYouPersistence {
  if (!instance) {
    instance = new CreativeYouPersistence();
  }
  return instance;
}

export { CreativeYouPersistence };
