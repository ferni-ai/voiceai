/**
 * Optimization System Persistence Service
 *
 * Handles Firestore persistence for the tool optimization system:
 * - User feedback records
 * - Interaction patterns (co-occurrences, sequences, journeys)
 * - AI-generated recommendations
 * - A/B experiment results
 *
 * Data is buffered in memory and flushed periodically to reduce writes.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { FeedbackRecord, FeedbackSummary } from '../tools/feedback-collector.js';
import type {
  ToolCoOccurrence,
  ToolSequence,
  UserJourney,
  GapAnalysis,
  ConsolidationOpportunity,
  SessionData,
} from '../tools/pattern-analyzer.js';
import type { Recommendation } from '../tools/recommendation-engine.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
  batch: () => WriteBatch;
}

interface CollectionRef {
  doc: (id?: string) => DocumentRef;
  get: () => Promise<QuerySnapshot>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  limit: (count: number) => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
  add: (data: unknown) => Promise<DocumentRef>;
}

interface DocumentRef {
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
  delete: () => Promise<void>;
  id: string;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
  size: number;
}

interface Transaction {
  get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => void;
  update: (ref: DocumentRef, data: unknown) => void;
}

interface WriteBatch {
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => WriteBatch;
  update: (ref: DocumentRef, data: unknown) => WriteBatch;
  delete: (ref: DocumentRef) => WriteBatch;
  commit: () => Promise<void>;
}

// ============================================================================
// PERSISTENCE SERVICE
// ============================================================================

class OptimizationPersistenceService {
  private db: FirestoreDB | null = null;
  private initialized = false;
  private flushInterval: NodeJS.Timeout | null = null;

  // Collection names
  private readonly COLLECTIONS = {
    FEEDBACK: 'optimization_feedback',
    FEEDBACK_SUMMARY: 'optimization_feedback_summary',
    PATTERNS: 'optimization_patterns',
    SESSIONS: 'optimization_sessions',
    RECOMMENDATIONS: 'optimization_recommendations',
    EXPERIMENTS: 'optimization_experiments',
    JOURNEYS: 'optimization_journeys',
    GAPS: 'optimization_gaps',
  };

  // Buffers
  private feedbackBuffer: FeedbackRecord[] = [];
  private sessionBuffer: SessionData[] = [];
  private recommendationBuffer: Recommendation[] = [];

  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 60000; // 1 minute

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(db?: FirestoreDB): Promise<void> {
    if (this.initialized) return;

    if (db) {
      this.db = db;
    } else {
      try {
        const { Firestore } = await import('@google-cloud/firestore');
        this.db = new Firestore({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        }) as unknown as FirestoreDB;
      } catch (error) {
        getLogger().warn({ error }, 'Firestore not available, optimization data will be in-memory only');
      }
    }

    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flushAll().catch((err) =>
        getLogger().warn({ err }, 'Failed to flush optimization buffers')
      );
    }, this.FLUSH_INTERVAL_MS);

    this.initialized = true;
    getLogger().info('🗄️ Optimization persistence initialized');
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flushAll();
    getLogger().info('🗄️ Optimization persistence shut down');
  }

  // ==========================================================================
  // FEEDBACK PERSISTENCE
  // ==========================================================================

  /**
   * Buffer feedback for batch writing
   */
  bufferFeedback(feedback: FeedbackRecord): void {
    this.feedbackBuffer.push(feedback);
    if (this.feedbackBuffer.length >= this.BUFFER_SIZE) {
      this.flushFeedback().catch((err) =>
        getLogger().warn({ err }, 'Failed to flush feedback')
      );
    }
  }

  /**
   * Flush feedback buffer to Firestore
   */
  async flushFeedback(): Promise<void> {
    if (this.feedbackBuffer.length === 0 || !this.db) return;

    const toFlush = this.feedbackBuffer.splice(0, this.feedbackBuffer.length);
    
    try {
      const batch = this.db.batch();
      const collection = this.db.collection(this.COLLECTIONS.FEEDBACK);

      for (const feedback of toFlush) {
        const docRef = collection.doc();
        batch.set(docRef, {
          ...feedback,
          timestamp: feedback.timestamp.toISOString(),
          createdAt: new Date().toISOString(),
        });
      }

      await batch.commit();
      getLogger().debug({ count: toFlush.length }, '📝 Flushed feedback to Firestore');
    } catch (error) {
      // Re-add to buffer on failure
      this.feedbackBuffer.unshift(...toFlush);
      getLogger().error({ error }, 'Failed to flush feedback');
    }
  }

  /**
   * Save aggregated feedback summary
   */
  async saveFeedbackSummary(toolId: string, summary: FeedbackSummary): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.collection(this.COLLECTIONS.FEEDBACK_SUMMARY).doc(toolId).set(
        {
          ...summary,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      getLogger().error({ error, toolId }, 'Failed to save feedback summary');
    }
  }

  /**
   * Get feedback summary for a tool
   */
  async getFeedbackSummary(toolId: string): Promise<FeedbackSummary | null> {
    if (!this.db) return null;

    try {
      const doc = await this.db.collection(this.COLLECTIONS.FEEDBACK_SUMMARY).doc(toolId).get();
      const data = doc.data();
      return doc.exists && data ? (data as unknown as FeedbackSummary) : null;
    } catch (error) {
      getLogger().error({ error, toolId }, 'Failed to get feedback summary');
      return null;
    }
  }

  /**
   * Get all feedback summaries
   */
  async getAllFeedbackSummaries(): Promise<FeedbackSummary[]> {
    if (!this.db) return [];

    try {
      const snapshot = await this.db.collection(this.COLLECTIONS.FEEDBACK_SUMMARY).get();
      return snapshot.docs
        .map((doc) => doc.data() as unknown as FeedbackSummary | undefined)
        .filter((data): data is FeedbackSummary => data !== undefined);
    } catch (error) {
      getLogger().error({ error }, 'Failed to get all feedback summaries');
      return [];
    }
  }

  // ==========================================================================
  // SESSION & PATTERN PERSISTENCE
  // ==========================================================================

  /**
   * Buffer completed session for analysis
   */
  bufferSession(session: SessionData): void {
    this.sessionBuffer.push(session);
    if (this.sessionBuffer.length >= this.BUFFER_SIZE) {
      this.flushSessions().catch((err) =>
        getLogger().warn({ err }, 'Failed to flush sessions')
      );
    }
  }

  /**
   * Flush sessions to Firestore
   */
  async flushSessions(): Promise<void> {
    if (this.sessionBuffer.length === 0 || !this.db) return;

    const toFlush = this.sessionBuffer.splice(0, this.sessionBuffer.length);

    try {
      const batch = this.db.batch();
      const collection = this.db.collection(this.COLLECTIONS.SESSIONS);

      for (const session of toFlush) {
        const docRef = collection.doc(session.sessionId);
        batch.set(docRef, {
          ...session,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString(),
          toolCalls: session.toolCalls.map((tc) => ({
            ...tc,
            timestamp: tc.timestamp.toISOString(),
          })),
          createdAt: new Date().toISOString(),
        });
      }

      await batch.commit();
      getLogger().debug({ count: toFlush.length }, '📊 Flushed sessions to Firestore');
    } catch (error) {
      this.sessionBuffer.unshift(...toFlush);
      getLogger().error({ error }, 'Failed to flush sessions');
    }
  }

  /**
   * Save pattern analysis results
   */
  async savePatternAnalysis(analysis: {
    coOccurrences: ToolCoOccurrence[];
    sequences: ToolSequence[];
    journeys: UserJourney[];
    gaps: GapAnalysis[];
    consolidationOpportunities: ConsolidationOpportunity[];
    analyzedAt: Date;
  }): Promise<void> {
    if (!this.db) return;

    try {
      const docId = `analysis_${Date.now()}`;
      await this.db.collection(this.COLLECTIONS.PATTERNS).doc(docId).set({
        ...analysis,
        analyzedAt: analysis.analyzedAt.toISOString(),
      });

      getLogger().info('📊 Saved pattern analysis to Firestore');
    } catch (error) {
      getLogger().error({ error }, 'Failed to save pattern analysis');
    }
  }

  /**
   * Get latest pattern analysis
   */
  async getLatestPatternAnalysis(): Promise<{
    coOccurrences: ToolCoOccurrence[];
    sequences: ToolSequence[];
    journeys: UserJourney[];
    gaps: GapAnalysis[];
    consolidationOpportunities: ConsolidationOpportunity[];
    analyzedAt: string;
  } | null> {
    if (!this.db) return null;

    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.PATTERNS)
        .orderBy('analyzedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) return null;

      return snapshot.docs[0].data() as {
        coOccurrences: ToolCoOccurrence[];
        sequences: ToolSequence[];
        journeys: UserJourney[];
        gaps: GapAnalysis[];
        consolidationOpportunities: ConsolidationOpportunity[];
        analyzedAt: string;
      };
    } catch (error) {
      getLogger().error({ error }, 'Failed to get latest pattern analysis');
      return null;
    }
  }

  // ==========================================================================
  // RECOMMENDATIONS PERSISTENCE
  // ==========================================================================

  /**
   * Buffer recommendation
   */
  bufferRecommendation(recommendation: Recommendation): void {
    this.recommendationBuffer.push(recommendation);
    if (this.recommendationBuffer.length >= this.BUFFER_SIZE) {
      this.flushRecommendations().catch((err) =>
        getLogger().warn({ err }, 'Failed to flush recommendations')
      );
    }
  }

  /**
   * Flush recommendations to Firestore
   */
  async flushRecommendations(): Promise<void> {
    if (this.recommendationBuffer.length === 0 || !this.db) return;

    const toFlush = this.recommendationBuffer.splice(0, this.recommendationBuffer.length);

    try {
      const batch = this.db.batch();
      const collection = this.db.collection(this.COLLECTIONS.RECOMMENDATIONS);

      for (const rec of toFlush) {
        const docRef = collection.doc(rec.id);
        batch.set(docRef, {
          ...rec,
          createdAt: rec.createdAt.toISOString(),
        });
      }

      await batch.commit();
      getLogger().debug({ count: toFlush.length }, '💡 Flushed recommendations to Firestore');
    } catch (error) {
      this.recommendationBuffer.unshift(...toFlush);
      getLogger().error({ error }, 'Failed to flush recommendations');
    }
  }

  /**
   * Save a recommendation
   */
  async saveRecommendation(recommendation: Recommendation): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.collection(this.COLLECTIONS.RECOMMENDATIONS).doc(recommendation.id).set({
        ...recommendation,
        createdAt: recommendation.createdAt.toISOString(),
      });
    } catch (error) {
      getLogger().error({ error }, 'Failed to save recommendation');
    }
  }

  /**
   * Get pending recommendations
   */
  async getPendingRecommendations(): Promise<Recommendation[]> {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.RECOMMENDATIONS)
        .where('status', '==', 'pending')
        .orderBy('priority', 'desc')
        .limit(50)
        .get();

      return snapshot.docs
        .map((doc) => {
          const data = doc.data();
          if (!data) return null;
          return {
            ...data,
            createdAt: new Date(data['createdAt'] as string),
          } as Recommendation;
        })
        .filter((rec): rec is Recommendation => rec !== null);
    } catch (error) {
      getLogger().error({ error }, 'Failed to get pending recommendations');
      return [];
    }
  }

  /**
   * Update recommendation status
   */
  async updateRecommendationStatus(
    id: string,
    status: 'pending' | 'approved' | 'rejected' | 'implemented',
    implementedAt?: Date
  ): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.collection(this.COLLECTIONS.RECOMMENDATIONS).doc(id).update({
        status,
        implementedAt: implementedAt?.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      getLogger().error({ error, id, status }, 'Failed to update recommendation status');
    }
  }

  // ==========================================================================
  // EXPERIMENT PERSISTENCE
  // ==========================================================================

  /**
   * Save experiment configuration and results
   */
  async saveExperiment(experiment: {
    id: string;
    name: string;
    description: string;
    variants: Array<{ id: string; name: string; config: Record<string, unknown> }>;
    status: 'draft' | 'active' | 'completed' | 'cancelled';
    startedAt?: Date;
    completedAt?: Date;
    results?: {
      winner?: string;
      metrics: Record<string, Record<string, number>>;
      confidence: number;
    };
  }): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.collection(this.COLLECTIONS.EXPERIMENTS).doc(experiment.id).set({
        ...experiment,
        startedAt: experiment.startedAt?.toISOString(),
        completedAt: experiment.completedAt?.toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      getLogger().error({ error, experimentId: experiment.id }, 'Failed to save experiment');
    }
  }

  /**
   * Get active experiments
   */
  async getActiveExperiments(): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      status: string;
    }>
  > {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection(this.COLLECTIONS.EXPERIMENTS)
        .where('status', '==', 'active')
        .get();

      return snapshot.docs.map((doc) => doc.data() as {
        id: string;
        name: string;
        description: string;
        status: string;
      });
    } catch (error) {
      getLogger().error({ error }, 'Failed to get active experiments');
      return [];
    }
  }

  // ==========================================================================
  // AGGREGATION & ANALYTICS
  // ==========================================================================

  /**
   * Get dashboard summary data
   */
  async getDashboardSummary(): Promise<{
    totalFeedback: number;
    feedbackByType: Record<string, number>;
    totalSessions: number;
    avgSessionDuration: number;
    topTools: Array<{ toolId: string; count: number }>;
    activeExperiments: number;
    pendingRecommendations: number;
    lastAnalysisTime: string | null;
  }> {
    if (!this.db) {
      return {
        totalFeedback: 0,
        feedbackByType: {},
        totalSessions: 0,
        avgSessionDuration: 0,
        topTools: [],
        activeExperiments: 0,
        pendingRecommendations: 0,
        lastAnalysisTime: null,
      };
    }

    try {
      // Get feedback count
      const feedbackSnapshot = await this.db.collection(this.COLLECTIONS.FEEDBACK).get();
      
      // Count by type
      const feedbackByType: Record<string, number> = {};
      feedbackSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data) {
          const type = data['type'] as string;
          feedbackByType[type] = (feedbackByType[type] || 0) + 1;
        }
      });

      // Get session count
      const sessionSnapshot = await this.db.collection(this.COLLECTIONS.SESSIONS).get();

      // Get active experiments
      const experimentsSnapshot = await this.db
        .collection(this.COLLECTIONS.EXPERIMENTS)
        .where('status', '==', 'active')
        .get();

      // Get pending recommendations
      const recsSnapshot = await this.db
        .collection(this.COLLECTIONS.RECOMMENDATIONS)
        .where('status', '==', 'pending')
        .get();

      // Get latest analysis time
      const latestAnalysis = await this.getLatestPatternAnalysis();

      return {
        totalFeedback: feedbackSnapshot.size,
        feedbackByType,
        totalSessions: sessionSnapshot.size,
        avgSessionDuration: 0, // TODO: Calculate from sessions
        topTools: [], // TODO: Aggregate from sessions
        activeExperiments: experimentsSnapshot.size,
        pendingRecommendations: recsSnapshot.size,
        lastAnalysisTime: latestAnalysis?.analyzedAt || null,
      };
    } catch (error) {
      getLogger().error({ error }, 'Failed to get dashboard summary');
      return {
        totalFeedback: 0,
        feedbackByType: {},
        totalSessions: 0,
        avgSessionDuration: 0,
        topTools: [],
        activeExperiments: 0,
        pendingRecommendations: 0,
        lastAnalysisTime: null,
      };
    }
  }

  // ==========================================================================
  // FLUSH ALL
  // ==========================================================================

  /**
   * Flush all buffers
   */
  async flushAll(): Promise<void> {
    await Promise.all([
      this.flushFeedback(),
      this.flushSessions(),
      this.flushRecommendations(),
    ]);
  }

  /**
   * Check if persistence is available
   */
  isAvailable(): boolean {
    return this.db !== null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const optimizationPersistence = new OptimizationPersistenceService();

export default optimizationPersistence;

