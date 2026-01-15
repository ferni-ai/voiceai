/**
 * Chronicle Service
 *
 * Complete data layer for "The Chronicle" immersive journal experience.
 * Handles entry storage, semantic indexing, insight generation, and analytics.
 *
 * Firestore Collections:
 * - bogle_users/{userId}/chronicle_entries/{entryId} - Journal entries
 * - bogle_users/{userId}/chronicle_insights/{insightId} - Generated insights
 * - bogle_users/{userId}/chronicle_stats - Aggregated statistics
 *
 * Features:
 * - Text and voice journal entries
 * - Mood tracking with pattern analysis
 * - Automatic semantic indexing for search
 * - AI-generated insights from journal patterns
 * - Streak tracking and milestone celebrations
 *
 * @module services/chronicle
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import { embed } from '../memory/embeddings.js';
import { getFirestoreVectorStore } from '../memory/firestore-vector-store.js';

const log = createLogger({ module: 'ChronicleService' });

// ============================================================================
// TYPES
// ============================================================================

export type ChronicleEntrySource = 'voice' | 'text' | 'auto' | 'prompt';

export type ChronicleInsightType =
  | 'streak' // Journal streak milestones
  | 'mood_pattern' // Mood trends over time
  | 'growth' // Personal growth observations
  | 'theme' // Recurring themes detected
  | 'memory' // Resurface meaningful past entries
  | 'milestone' // Personal milestones
  | 'reflection'; // Reflection prompts based on content

export interface ChronicleEntry {
  id: string;
  userId: string;

  // Content
  content: string;
  transcript?: string; // For voice entries
  audioUrl?: string; // For voice entries
  durationSeconds?: number; // For voice entries

  // Context
  source: ChronicleEntrySource;
  promptId?: string;
  promptText?: string;
  agentId?: string; // Which persona if any
  conversationId?: string; // Link to conversation if from chat

  // Mood & Emotions
  mood?: {
    id: string;
    label: string;
    score: number; // 0-10 scale
    emoji?: string;
  };
  emotionalIntensity?: number; // 0-1 scale

  // Semantic
  themes?: string[];
  keyInsights?: string[];
  embedding?: number[]; // Vector embedding for semantic search

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ChronicleInsight {
  id: string;
  userId: string;
  type: ChronicleInsightType;

  // Content
  title: string;
  description: string;

  // Display
  icon: string;
  value?: string | number;
  actionLabel?: string;
  actionType?: 'view_entry' | 'start_practice' | 'talk_to_past_self' | 'reflect';

  // Metadata
  relatedEntryIds?: string[];
  priority: 'high' | 'medium' | 'low';

  // Lifecycle
  surfacedAt?: Date;
  dismissedAt?: Date;
  expiresAt?: Date;

  createdAt: Date;
}

export interface ChronicleStats {
  userId: string;

  // Counts
  totalEntries: number;
  textEntries: number;
  voiceEntries: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;
  lastEntryDate: Date | null;

  // Mood Analytics
  averageMoodScore: number;
  moodDistribution: Record<string, number>;
  moodTrend: 'improving' | 'stable' | 'declining' | 'unknown';

  // Themes
  topThemes: Array<{ theme: string; count: number }>;

  // Engagement
  entriesThisWeek: number;
  entriesThisMonth: number;

  updatedAt: Date;
}

export interface CreateChronicleEntryData {
  content: string;
  source: ChronicleEntrySource;
  transcript?: string;
  audioUrl?: string;
  durationSeconds?: number;
  mood?: ChronicleEntry['mood'];
  themes?: string[];
  promptId?: string;
  promptText?: string;
  agentId?: string;
  conversationId?: string;
}

// ============================================================================
// CHRONICLE SERVICE CLASS
// ============================================================================

class ChronicleService {
  private statsCache = new Map<string, { stats: ChronicleStats; fetchedAt: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute

  // ============================================================================
  // ENTRY OPERATIONS
  // ============================================================================

  /**
   * Create a new chronicle entry with semantic indexing
   */
  async createEntry(userId: string, data: CreateChronicleEntryData): Promise<ChronicleEntry> {
    const id = `chronicle_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date();

    // Generate embedding for semantic search
    let embedding: number[] | undefined;
    try {
      embedding = await embed(data.content);
      log.debug({ userId, contentLength: data.content.length }, 'Generated embedding for entry');
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to generate embedding');
    }

    // Extract themes if not provided
    const themes = data.themes || this.extractThemes(data.content);

    const entry: ChronicleEntry = {
      id,
      userId,
      content: data.content,
      transcript: data.transcript,
      audioUrl: data.audioUrl,
      durationSeconds: data.durationSeconds,
      source: data.source,
      promptId: data.promptId,
      promptText: data.promptText,
      agentId: data.agentId,
      conversationId: data.conversationId,
      mood: data.mood,
      themes,
      embedding,
      createdAt: now,
      updatedAt: now,
    };

    // Save to Firestore
    await this.saveEntry(entry);

    // Index to vector store for semantic search
    if (embedding) {
      await this.indexEntry(entry, embedding);
    }

    // Update stats
    await this.updateStats(userId, entry);

    // Generate insights asynchronously
    void this.generateInsightsForEntry(userId, entry);

    // Invalidate cache
    this.statsCache.delete(userId);

    log.info({ userId, entryId: id, source: data.source }, '📝 Chronicle entry created');
    return entry;
  }

  /**
   * Get all entries for a user
   */
  async getEntries(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      source?: ChronicleEntrySource;
      startDate?: Date;
      endDate?: Date;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<ChronicleEntry[]> {
    const { limit = 50, offset = 0, source, startDate, endDate, sortOrder = 'desc' } = options;

    const db = getFirestoreDb();
    if (!db) {
      log.warn({ userId }, 'Firestore unavailable');
      return [];
    }

    try {
      let query = db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_entries')
        .orderBy('createdAt', sortOrder);

      if (source) {
        query = query.where('source', '==', source);
      }

      if (startDate) {
        query = query.where('createdAt', '>=', startDate);
      }

      if (endDate) {
        query = query.where('createdAt', '<=', endDate);
      }

      query = query.limit(limit).offset(offset);

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
        } as ChronicleEntry;
      });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get entries');
      return [];
    }
  }

  /**
   * Get a single entry by ID
   */
  async getEntry(userId: string, entryId: string): Promise<ChronicleEntry | null> {
    const db = getFirestoreDb();
    if (!db) return null;

    try {
      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_entries')
        .doc(entryId)
        .get();

      if (!doc.exists) return null;

      const data = doc.data()!;
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
      } as ChronicleEntry;
    } catch (error) {
      log.error({ error: String(error), userId, entryId }, 'Failed to get entry');
      return null;
    }
  }

  /**
   * Search entries semantically
   */
  async searchEntries(
    userId: string,
    query: string,
    limit = 10
  ): Promise<Array<ChronicleEntry & { score: number }>> {
    try {
      const vectorStore = getFirestoreVectorStore();

      // Search vector store
      const results = await vectorStore.search(query, {
        topK: limit,
        filter: {
          userId,
          source: 'chronicle',
        },
      });

      // Load full entries
      const entries: Array<ChronicleEntry & { score: number }> = [];
      for (const result of results) {
        const entryId = result.document?.metadata?.entryId as string;
        if (entryId) {
          const entry = await this.getEntry(userId, entryId);
          if (entry) {
            entries.push({ ...entry, score: result.score ?? 0 });
          }
        }
      }

      return entries;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Semantic search failed');

      // Fallback to text search
      const entries = await this.getEntries(userId, { limit: 100 });
      const lowerQuery = query.toLowerCase();

      return entries
        .filter((e) => e.content.toLowerCase().includes(lowerQuery))
        .slice(0, limit)
        .map((e) => ({ ...e, score: 0.5 }));
    }
  }

  // ============================================================================
  // INSIGHT OPERATIONS
  // ============================================================================

  /**
   * Get insights for a user
   */
  async getInsights(
    userId: string,
    options: {
      limit?: number;
      type?: ChronicleInsightType;
      includeExpired?: boolean;
      includeDismissed?: boolean;
    } = {}
  ): Promise<ChronicleInsight[]> {
    const { limit = 20, type, includeExpired = false, includeDismissed = false } = options;

    const db = getFirestoreDb();
    if (!db) return this.generateDefaultInsights(userId);

    try {
      let query = db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_insights')
        .orderBy('createdAt', 'desc');

      if (type) {
        query = query.where('type', '==', type);
      }

      if (!includeDismissed) {
        query = query.where('dismissedAt', '==', null);
      }

      query = query.limit(limit);

      const snapshot = await query.get();

      const insights = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
          surfacedAt: data.surfacedAt?.toDate?.(),
          dismissedAt: data.dismissedAt?.toDate?.(),
          expiresAt: data.expiresAt?.toDate?.(),
        } as ChronicleInsight;
      });

      // Filter expired if needed
      if (!includeExpired) {
        const now = new Date();
        return insights.filter((i) => !i.expiresAt || i.expiresAt > now);
      }

      return insights;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get insights');
      return this.generateDefaultInsights(userId);
    }
  }

  /**
   * Dismiss an insight
   */
  async dismissInsight(userId: string, insightId: string): Promise<boolean> {
    const db = getFirestoreDb();
    if (!db) return false;

    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_insights')
        .doc(insightId)
        .update(cleanForFirestore({ dismissedAt: new Date() }));

      return true;
    } catch (error) {
      log.error({ error: String(error), userId, insightId }, 'Failed to dismiss insight');
      return false;
    }
  }

  // ============================================================================
  // STATS OPERATIONS
  // ============================================================================

  /**
   * Get chronicle stats with caching
   */
  async getStats(userId: string): Promise<ChronicleStats> {
    // Check cache
    const cached = this.statsCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.stats;
    }

    const db = getFirestoreDb();
    if (!db) return this.getDefaultStats(userId);

    try {
      // Try to load from Firestore
      const statsDoc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_stats')
        .doc('current')
        .get();

      if (statsDoc.exists) {
        const data = statsDoc.data()!;
        const stats: ChronicleStats = {
          ...data,
          userId,
          lastEntryDate: data.lastEntryDate?.toDate?.() ?? null,
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
        } as ChronicleStats;

        this.statsCache.set(userId, { stats, fetchedAt: Date.now() });
        return stats;
      }

      // Calculate from entries
      const stats = await this.calculateStats(userId);
      this.statsCache.set(userId, { stats, fetchedAt: Date.now() });
      return stats;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get stats');
      return this.getDefaultStats(userId);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async saveEntry(entry: ChronicleEntry): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      log.warn({ userId: entry.userId }, 'Firestore unavailable, entry not persisted');
      return;
    }

    try {
      // Don't store embedding in Firestore (stored in vector store)
      const entryWithoutEmbedding = { ...entry };
      delete entryWithoutEmbedding.embedding;

      await db
        .collection('bogle_users')
        .doc(entry.userId)
        .collection('chronicle_entries')
        .doc(entry.id)
        .set(cleanForFirestore(entryWithoutEmbedding));
    } catch (error) {
      log.error({ error: String(error), userId: entry.userId }, 'Failed to save entry');
      throw error;
    }
  }

  private async indexEntry(entry: ChronicleEntry, embedding: number[]): Promise<void> {
    try {
      const vectorStore = getFirestoreVectorStore();

      const text = `Chronicle entry: ${entry.content}. ${
        entry.themes?.length ? `Themes: ${entry.themes.join(', ')}. ` : ''
      }${entry.mood ? `Mood: ${entry.mood.label}. ` : ''}`;

      await vectorStore.addDocument({
        id: `chronicle_${entry.userId}_${entry.id}`,
        text,
        embedding,
        metadata: {
          userId: entry.userId,
          source: 'chronicle',
          entryId: entry.id,
          entrySource: entry.source,
          mood: entry.mood?.id,
          themes: entry.themes,
          timestamp: entry.createdAt, // Date object
        },
      });

      log.debug({ userId: entry.userId, entryId: entry.id }, 'Entry indexed');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to index entry (non-critical)');
    }
  }

  private async updateStats(userId: string, newEntry: ChronicleEntry): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      const statsRef = db
        .collection('bogle_users')
        .doc(userId)
        .collection('chronicle_stats')
        .doc('current');

      const statsDoc = await statsRef.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingData = statsDoc.exists ? (statsDoc.data() as any) : {};

      // Calculate streak - Firestore returns Timestamp, convert to Date
      const lastEntryDate = existingData.lastEntryDate?.toDate?.() as Date | undefined;
      const existing: Partial<ChronicleStats> = {
        ...existingData,
        lastEntryDate: lastEntryDate || null,
      };
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let currentStreak = existing.currentStreak || 0;

      if (lastEntryDate) {
        const lastDate = new Date(lastEntryDate);
        lastDate.setHours(0, 0, 0, 0);

        const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) {
          // Same day, streak unchanged
        } else if (daysDiff === 1) {
          // Consecutive day, increment streak
          currentStreak++;
        } else {
          // Gap, reset streak
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }

      const longestStreak = Math.max(existing.longestStreak || 0, currentStreak);

      // Update mood distribution
      const moodDistribution = { ...(existing.moodDistribution || {}) };
      if (newEntry.mood?.id) {
        moodDistribution[newEntry.mood.id] = (moodDistribution[newEntry.mood.id] || 0) + 1;
      }

      // Update counts
      const totalEntries = (existing.totalEntries || 0) + 1;
      const textEntries = (existing.textEntries || 0) + (newEntry.source === 'text' ? 1 : 0);
      const voiceEntries = (existing.voiceEntries || 0) + (newEntry.source === 'voice' ? 1 : 0);

      const updatedStats: Partial<ChronicleStats> = {
        totalEntries,
        textEntries,
        voiceEntries,
        currentStreak,
        longestStreak,
        lastEntryDate: newEntry.createdAt,
        moodDistribution,
        updatedAt: new Date(),
      };

      await statsRef.set(cleanForFirestore(updatedStats), { merge: true });

      // Invalidate cache
      this.statsCache.delete(userId);
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to update stats');
    }
  }

  private async generateInsightsForEntry(userId: string, entry: ChronicleEntry): Promise<void> {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      const stats = await this.getStats(userId);
      const insights: ChronicleInsight[] = [];
      const now = new Date();

      // Streak milestone insights
      const streakMilestones = [3, 7, 14, 30, 50, 100];
      if (streakMilestones.includes(stats.currentStreak)) {
        insights.push({
          id: `streak_${stats.currentStreak}_${Date.now()}`,
          userId,
          type: 'streak',
          title: `${stats.currentStreak} Day Streak!`,
          description: `You've journaled for ${stats.currentStreak} days in a row. That's real commitment to self-reflection.`,
          icon: 'flame',
          value: stats.currentStreak,
          priority: 'high',
          createdAt: now,
        });
      }

      // First entry milestone
      if (stats.totalEntries === 1) {
        insights.push({
          id: `first_entry_${Date.now()}`,
          userId,
          type: 'milestone',
          title: 'Your Chronicle Begins',
          description:
            'You took the first step in documenting your story. Every great chronicle starts with a single entry.',
          icon: 'star',
          priority: 'high',
          createdAt: now,
        });
      }

      // Entry count milestones
      const entryMilestones = [10, 25, 50, 100, 250, 500];
      if (entryMilestones.includes(stats.totalEntries)) {
        insights.push({
          id: `entries_${stats.totalEntries}_${Date.now()}`,
          userId,
          type: 'milestone',
          title: `${stats.totalEntries} Entries`,
          description: `You've written ${stats.totalEntries} entries. Your chronicle is growing into something meaningful.`,
          icon: 'book',
          value: stats.totalEntries,
          priority: 'medium',
          createdAt: now,
        });
      }

      // Save insights
      for (const insight of insights) {
        await db
          .collection('bogle_users')
          .doc(userId)
          .collection('chronicle_insights')
          .doc(insight.id)
          .set(cleanForFirestore(insight));
      }

      if (insights.length > 0) {
        log.debug({ userId, count: insights.length }, 'Generated insights for entry');
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to generate insights');
    }
  }

  private extractThemes(content: string): string[] {
    // Simple theme extraction - could be enhanced with NLP
    const themes: string[] = [];
    const lowerContent = content.toLowerCase();

    const themeKeywords: Record<string, string[]> = {
      gratitude: ['grateful', 'thankful', 'appreciate', 'blessed'],
      stress: ['stressed', 'overwhelmed', 'anxious', 'worry', 'pressure'],
      work: ['work', 'job', 'career', 'meeting', 'project', 'boss', 'colleague'],
      relationships: ['family', 'friend', 'partner', 'love', 'relationship'],
      health: ['health', 'exercise', 'sleep', 'tired', 'energy', 'sick'],
      growth: ['learned', 'realized', 'growing', 'progress', 'improve'],
      goals: ['goal', 'dream', 'plan', 'future', 'want to', 'hope to'],
      reflection: ['thinking about', 'wondering', 'feel like', 'realized'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some((kw) => lowerContent.includes(kw))) {
        themes.push(theme);
      }
    }

    return themes.slice(0, 5); // Max 5 themes
  }

  private async calculateStats(userId: string): Promise<ChronicleStats> {
    const entries = await this.getEntries(userId, { limit: 1000 });

    if (entries.length === 0) {
      return this.getDefaultStats(userId);
    }

    // Sort by date
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    for (const entry of entries) {
      const entryDate = new Date(entry.createdAt);
      entryDate.setHours(0, 0, 0, 0);

      if (!lastDate) {
        tempStreak = 1;
      } else {
        const daysDiff = Math.floor(
          (lastDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff === 0) {
          // Same day
        } else if (daysDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }

      lastDate = entryDate;
    }

    longestStreak = Math.max(longestStreak, tempStreak);

    // Check if streak is current (today or yesterday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const latestEntry = entries[0];
    const latestDate = new Date(latestEntry.createdAt);
    latestDate.setHours(0, 0, 0, 0);

    const daysSinceLatest = Math.floor(
      (today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    currentStreak = daysSinceLatest <= 1 ? tempStreak : 0;

    // Calculate mood distribution
    const moodDistribution: Record<string, number> = {};
    let totalMoodScore = 0;
    let moodCount = 0;

    for (const entry of entries) {
      if (entry.mood?.id) {
        moodDistribution[entry.mood.id] = (moodDistribution[entry.mood.id] || 0) + 1;
        totalMoodScore += entry.mood.score;
        moodCount++;
      }
    }

    const averageMoodScore = moodCount > 0 ? totalMoodScore / moodCount : 5;

    // Calculate theme counts
    const themeCounts: Record<string, number> = {};
    for (const entry of entries) {
      for (const theme of entry.themes || []) {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      }
    }

    const topThemes = Object.entries(themeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));

    // Calculate weekly/monthly counts
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const entriesThisWeek = entries.filter((e) => e.createdAt >= oneWeekAgo).length;
    const entriesThisMonth = entries.filter((e) => e.createdAt >= oneMonthAgo).length;

    return {
      userId,
      totalEntries: entries.length,
      textEntries: entries.filter((e) => e.source === 'text').length,
      voiceEntries: entries.filter((e) => e.source === 'voice').length,
      currentStreak,
      longestStreak,
      lastEntryDate: entries[0]?.createdAt || null,
      averageMoodScore,
      moodDistribution,
      moodTrend: 'stable', // Would need more analysis
      topThemes,
      entriesThisWeek,
      entriesThisMonth,
      updatedAt: new Date(),
    };
  }

  private getDefaultStats(userId: string): ChronicleStats {
    return {
      userId,
      totalEntries: 0,
      textEntries: 0,
      voiceEntries: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastEntryDate: null,
      averageMoodScore: 5,
      moodDistribution: {},
      moodTrend: 'unknown',
      topThemes: [],
      entriesThisWeek: 0,
      entriesThisMonth: 0,
      updatedAt: new Date(),
    };
  }

  private generateDefaultInsights(userId: string): ChronicleInsight[] {
    const now = new Date();
    return [
      {
        id: 'default_start',
        userId,
        type: 'reflection',
        title: 'Begin Your Chronicle',
        description: 'Start documenting your journey. Each entry becomes a chapter in your story.',
        icon: 'pen',
        priority: 'medium',
        actionLabel: 'Write First Entry',
        actionType: 'start_practice',
        createdAt: now,
      },
    ];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let chronicleServiceInstance: ChronicleService | null = null;

export function getChronicleService(): ChronicleService {
  if (!chronicleServiceInstance) {
    chronicleServiceInstance = new ChronicleService();
  }
  return chronicleServiceInstance;
}

export { ChronicleService };
