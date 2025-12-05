/**
 * Engagement Firestore Store
 *
 * Persists daily rituals, streaks, emotional weather, and engagement data to Firestore.
 * Provides the foundation for all engagement features requiring persistence.
 *
 * Collections:
 * - engagement_profiles/{userId} - Main engagement profile
 * - engagement_profiles/{userId}/ritual_streaks/{ritualId} - Individual ritual streaks
 * - engagement_profiles/{userId}/weather_history/{date} - Daily emotional weather
 * - engagement_profiles/{userId}/predictions/{predictionId} - Weekly predictions
 * - engagement_profiles/{userId}/team_huddles/{huddleId} - Team huddle history
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserRitualProfile, RitualStreak, EmotionalWeather } from './daily-rituals.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementProfile {
  userId: string;
  activeRituals: string[];
  totalRitualDays: number;
  longestOverallStreak: number;
  lastEngagementAt: string; // ISO date
  preferences: {
    preferredTime: 'morning' | 'afternoon' | 'evening';
    reminderEnabled: boolean;
    favoritePersona?: string;
  };
  stats: {
    totalSkyChecks: number;
    totalPredictions: number;
    predictionAccuracy: number;
    teamHuddlesAttended: number;
    memoryCallbacksTriggered: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StoredRitualStreak {
  ritualId: string;
  personaId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: string;
  totalCompletions: number;
  streakHistory: Array<{
    startDate: string;
    endDate: string;
    length: number;
  }>;
}

export interface StoredWeatherEntry {
  date: string;
  weather: EmotionalWeather;
  ritualId: string;
  insights?: string[];
}

export interface StoredPrediction {
  id: string;
  weekOf: string;
  predictions: Record<string, number>;
  actuals?: Record<string, number>;
  accuracy?: number;
  createdAt: string;
  completedAt?: string;
}

export interface StoredTeamHuddle {
  id: string;
  participatingPersonas: string[];
  topic: string;
  userHighlights: string[];
  celebratedMilestones: string[];
  occurredAt: string;
}

// ============================================================================
// FIRESTORE INTERFACES
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
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
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
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
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}

// ============================================================================
// ENGAGEMENT STORE
// ============================================================================

export class EngagementStore {
  private db: Firestore | null = null;
  private readonly COLLECTION = 'engagement_profiles';
  private memoryCache = new Map<string, EngagementProfile>();

  /**
   * Initialize Firestore connection
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    try {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as Firestore;
      getLogger().info('Engagement store initialized with Firestore');
    } catch (error) {
      getLogger().warn({ error }, 'Firestore not available, using memory cache');
    }
  }

  /**
   * Get or create engagement profile
   */
  async getProfile(userId: string): Promise<EngagementProfile> {
    // Check memory cache first
    const cached = this.memoryCache.get(userId);
    if (cached) return cached;

    // Try Firestore
    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION).doc(userId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data) {
            const profile = data as unknown as EngagementProfile;
            this.memoryCache.set(userId, profile);
            return profile;
          }
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to fetch engagement profile');
      }
    }

    // Create default profile
    const profile = this.createDefaultProfile(userId);
    await this.saveProfile(profile);
    return profile;
  }

  /**
   * Save engagement profile
   */
  async saveProfile(profile: EngagementProfile): Promise<void> {
    profile.updatedAt = new Date().toISOString();
    this.memoryCache.set(profile.userId, profile);

    if (this.db) {
      try {
        await this.db.collection(this.COLLECTION).doc(profile.userId).set(profile, { merge: true });
      } catch (error) {
        getLogger().warn({ error, userId: profile.userId }, 'Failed to save engagement profile');
      }
    }
  }

  /**
   * Get ritual streak
   */
  async getRitualStreak(userId: string, ritualId: string): Promise<StoredRitualStreak | null> {
    if (this.db) {
      try {
        const doc = await this.db
          .collection(this.COLLECTION)
          .doc(userId)
          .collection('ritual_streaks')
          .doc(ritualId)
          .get();
        if (doc.exists) {
          const data = doc.data();
          if (data) {
            return data as unknown as StoredRitualStreak;
          }
        }
      } catch (error) {
        getLogger().warn({ error, userId, ritualId }, 'Failed to fetch ritual streak');
      }
    }
    return null;
  }

  /**
   * Save ritual streak
   */
  async saveRitualStreak(userId: string, streak: StoredRitualStreak): Promise<void> {
    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION)
          .doc(userId)
          .collection('ritual_streaks')
          .doc(streak.ritualId)
          .set(streak, { merge: true });
      } catch (error) {
        getLogger().warn(
          { error, userId, ritualId: streak.ritualId },
          'Failed to save ritual streak'
        );
      }
    }
  }

  /**
   * Record emotional weather
   */
  async recordWeather(userId: string, entry: StoredWeatherEntry): Promise<void> {
    if (this.db) {
      try {
        const docId = entry.date.split('T')[0]; // Use date as ID for easy lookup
        await this.db
          .collection(this.COLLECTION)
          .doc(userId)
          .collection('weather_history')
          .doc(docId)
          .set(entry, { merge: true });

        // Update profile stats
        const profile = await this.getProfile(userId);
        profile.stats.totalSkyChecks++;
        await this.saveProfile(profile);
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to record weather');
      }
    }
  }

  /**
   * Get weather history
   */
  async getWeatherHistory(userId: string, days = 30): Promise<StoredWeatherEntry[]> {
    if (!this.db) return [];

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const snapshot = await this.db
        .collection(this.COLLECTION)
        .doc(userId)
        .collection('weather_history')
        .where('date', '>=', cutoffStr)
        .orderBy('date', 'desc')
        .limit(days)
        .get();

      return snapshot.docs
        .map((doc) => doc.data())
        .filter((data): data is Record<string, unknown> => data !== undefined)
        .map((data) => data as unknown as StoredWeatherEntry);
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to get weather history');
      return [];
    }
  }

  /**
   * Save prediction
   */
  async savePrediction(userId: string, prediction: StoredPrediction): Promise<void> {
    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION)
          .doc(userId)
          .collection('predictions')
          .doc(prediction.id)
          .set(prediction, { merge: true });

        if (!prediction.completedAt) {
          const profile = await this.getProfile(userId);
          profile.stats.totalPredictions++;
          await this.saveProfile(profile);
        }
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to save prediction');
      }
    }
  }

  /**
   * Get recent predictions
   */
  async getRecentPredictions(userId: string, limit = 10): Promise<StoredPrediction[]> {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection(this.COLLECTION)
        .doc(userId)
        .collection('predictions')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs
        .map((doc) => doc.data())
        .filter((data): data is Record<string, unknown> => data !== undefined)
        .map((data) => data as unknown as StoredPrediction);
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to get predictions');
      return [];
    }
  }

  /**
   * Record team huddle
   */
  async recordTeamHuddle(userId: string, huddle: StoredTeamHuddle): Promise<void> {
    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION)
          .doc(userId)
          .collection('team_huddles')
          .doc(huddle.id)
          .set(huddle);

        const profile = await this.getProfile(userId);
        profile.stats.teamHuddlesAttended++;
        await this.saveProfile(profile);
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to record team huddle');
      }
    }
  }

  /**
   * Get all ritual streaks for a user
   */
  async getAllStreaks(userId: string): Promise<StoredRitualStreak[]> {
    if (!this.db) return [];

    try {
      const snapshot = await this.db
        .collection(this.COLLECTION)
        .doc(userId)
        .collection('ritual_streaks')
        .get();

      return snapshot.docs
        .map((doc) => doc.data())
        .filter((data): data is Record<string, unknown> => data !== undefined)
        .map((data) => data as unknown as StoredRitualStreak);
    } catch (error) {
      getLogger().warn({ error, userId }, 'Failed to get all streaks');
      return [];
    }
  }

  /**
   * Update prediction with actuals
   */
  async updatePredictionActuals(
    userId: string,
    predictionId: string,
    actuals: Record<string, number>
  ): Promise<{ accuracy: number } | null> {
    if (!this.db) return null;

    try {
      const doc = await this.db
        .collection(this.COLLECTION)
        .doc(userId)
        .collection('predictions')
        .doc(predictionId)
        .get();

      if (!doc.exists) return null;

      const data = doc.data();
      if (!data) return null;
      const prediction = data as unknown as StoredPrediction;

      // Calculate accuracy
      let totalDiff = 0;
      let count = 0;
      for (const [key, actual] of Object.entries(actuals)) {
        if (prediction.predictions[key] !== undefined) {
          const predicted = prediction.predictions[key];
          totalDiff += Math.abs(predicted - actual) / Math.max(predicted, actual, 1);
          count++;
        }
      }
      const accuracy = count > 0 ? Math.round((1 - totalDiff / count) * 100) : 0;

      // Update prediction
      await this.db
        .collection(this.COLLECTION)
        .doc(userId)
        .collection('predictions')
        .doc(predictionId)
        .set(
          {
            actuals,
            accuracy,
            completedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      // Update profile accuracy
      const profile = await this.getProfile(userId);
      const predictions = await this.getRecentPredictions(userId, 20);
      const completedPredictions = predictions.filter((p) => p.accuracy !== undefined);
      if (completedPredictions.length > 0) {
        profile.stats.predictionAccuracy = Math.round(
          completedPredictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) /
            completedPredictions.length
        );
        await this.saveProfile(profile);
      }

      return { accuracy };
    } catch (error) {
      getLogger().warn({ error, userId, predictionId }, 'Failed to update prediction actuals');
      return null;
    }
  }

  /**
   * Create default profile
   */
  private createDefaultProfile(userId: string): EngagementProfile {
    const now = new Date().toISOString();
    return {
      userId,
      activeRituals: [],
      totalRitualDays: 0,
      longestOverallStreak: 0,
      lastEngagementAt: now,
      preferences: {
        preferredTime: 'morning',
        reminderEnabled: false,
      },
      stats: {
        totalSkyChecks: 0,
        totalPredictions: 0,
        predictionAccuracy: 0,
        teamHuddlesAttended: 0,
        memoryCallbacksTriggered: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Convert to UserRitualProfile format for backward compatibility
   */
  async toRitualProfile(userId: string): Promise<UserRitualProfile> {
    const profile = await this.getProfile(userId);
    const streaks = await this.getAllStreaks(userId);
    const weather = await this.getWeatherHistory(userId, 90);

    const streaksMap: Record<string, RitualStreak> = {};
    for (const streak of streaks) {
      streaksMap[streak.ritualId] = {
        ritualId: streak.ritualId,
        userId,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastCompletedAt: new Date(streak.lastCompletedAt),
        totalCompletions: streak.totalCompletions,
        streakHistory: streak.streakHistory.map((h) => ({
          startDate: new Date(h.startDate),
          endDate: new Date(h.endDate),
          length: h.length,
        })),
      };
    }

    return {
      userId,
      activeRituals: profile.activeRituals,
      streaks: streaksMap,
      emotionalWeatherHistory: weather.map((w) => ({
        date: new Date(w.date),
        weather: w.weather,
      })),
      weeklyInsights: [],
      lastRitualDate: new Date(profile.lastEngagementAt),
      totalRitualDays: profile.totalRitualDays,
      preferences: profile.preferences,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engagementStore: EngagementStore | null = null;

export async function getEngagementStore(): Promise<EngagementStore> {
  if (!engagementStore) {
    engagementStore = new EngagementStore();
    await engagementStore.initialize();
  }
  return engagementStore;
}

export function resetEngagementStore(): void {
  engagementStore = null;
}

export default EngagementStore;
