/**
 * Mood Tracker
 *
 * Tracks the agent's mood throughout a conversation.
 * Mood influences which humanization effects are appropriate.
 *
 * Now with Firestore persistence for emotional trajectory analysis.
 *
 * @module @ferni/conversation/deep-humanization/mood-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { getDb } from '../../utils/safe-firestore.js';
import type { ConversationMood } from './types.js';

const log = createLogger({ module: 'MoodTracker' });

// ============================================================================
// FIRESTORE PERSISTENCE FOR EMOTIONAL TRAJECTORY
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const EMOTIONAL_TRAJECTORY_COLLECTION = 'emotional_trajectory';

/**
 * Get Firestore instance using shared utility
 * Uses centralized getDb() which handles initialization safely
 */
async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  const db = getDb();
  if (!db) {
    log.debug({}, 'getFirestoreDb: Firestore not available from shared utility');
  }
  return db;
}

/**
 * Per-turn emotional snapshot
 */
export interface EmotionalSnapshot {
  turn: number;
  timestamp: string;
  energy: number;
  engagement: number;
  emotionalLoad: number;
  inEmotionalMoment: boolean;
  userEmotion?: string;
  topicWeight?: 'light' | 'medium' | 'heavy';
}

/**
 * Session emotional trajectory
 */
export interface EmotionalTrajectory {
  sessionId: string;
  userId: string;
  personaId: string;
  startedAt: string;
  endedAt?: string;
  snapshots: EmotionalSnapshot[];
  summary?: {
    peakEnergy: number;
    lowestEnergy: number;
    peakEmotionalLoad: number;
    emotionalMomentCount: number;
    dominantEmotion?: string;
    trend: 'improving' | 'declining' | 'stable';
  };
}

// ============================================================================
// MOOD TRACKER
// ============================================================================

export class MoodTracker {
  private mood: ConversationMood;
  private turnCount = 0;

  // Session metadata for persistence
  private sessionId?: string;
  private userId?: string;
  private personaId?: string;
  private startedAt: Date;

  // Per-turn emotional snapshots
  private snapshots: EmotionalSnapshot[] = [];
  private emotionCounts: Map<string, number> = new Map();

  constructor() {
    this.mood = this.getInitialMood();
    this.startedAt = new Date();
  }

  /**
   * Initialize with session metadata for persistence
   */
  initializeSession(sessionId: string, userId: string, personaId: string): void {
    this.sessionId = sessionId;
    this.userId = userId;
    this.personaId = personaId;
    this.startedAt = new Date();
    this.snapshots = [];
    this.emotionCounts.clear();
    log.info({ sessionId, userId, personaId }, '📊 Mood tracker initialized for session');
  }

  private getInitialMood(): ConversationMood {
    return {
      energy: 0.75,
      engagement: 0.7,
      emotionalLoad: 0,
      heavyTopicCount: 0,
      inEmotionalMoment: false,
    };
  }

  /**
   * Update mood based on conversation dynamics
   */
  update(context: {
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    userEngagement?: 'low' | 'medium' | 'high';
    turnCount: number;
  }): void {
    this.turnCount = context.turnCount;

    // Energy drifts down over time, especially with heavy topics
    if (context.topicWeight === 'heavy') {
      this.mood.energy = Math.max(0.4, this.mood.energy - 0.08);
      this.mood.emotionalLoad += 0.15;
      this.mood.heavyTopicCount++;
    } else if (context.topicWeight === 'light') {
      this.mood.energy = Math.min(0.95, this.mood.energy + 0.03);
      this.mood.emotionalLoad = Math.max(0, this.mood.emotionalLoad - 0.05);
    }

    // Natural energy decay over long sessions
    if (context.turnCount > 15) {
      this.mood.energy = Math.max(0.45, this.mood.energy - 0.02);
    }

    // Engagement responds to user engagement
    if (context.userEngagement === 'high') {
      this.mood.engagement = Math.min(0.95, this.mood.engagement + 0.1);
    } else if (context.userEngagement === 'low') {
      this.mood.engagement = Math.max(0.4, this.mood.engagement - 0.05);
    }

    // Track emotional moments
    this.mood.inEmotionalMoment =
      context.userEmotion === 'sadness' ||
      context.userEmotion === 'fear' ||
      context.userEmotion === 'vulnerable';

    log.debug({ mood: this.mood, turn: context.turnCount }, 'Mood updated');

    // Emit mood drift signal to frontend every few turns or on significant changes
    if (context.turnCount % 5 === 0 || this.mood.inEmotionalMoment) {
      void humanizationSignalEmitter.moodDrift({
        energy: this.mood.energy,
        engagement: this.mood.engagement,
        emotionalLoad: this.mood.emotionalLoad,
      });
    }

    // Emit vulnerability signal if in emotional moment
    if (this.mood.inEmotionalMoment && context.userEmotion === 'vulnerable') {
      void humanizationSignalEmitter.vulnerability(0.8);
    }

    // Record emotional snapshot for trajectory analysis
    this.recordSnapshot(context);
  }

  /**
   * Record per-turn emotional snapshot
   */
  private recordSnapshot(context: {
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    turnCount: number;
  }): void {
    const snapshot: EmotionalSnapshot = {
      turn: context.turnCount,
      timestamp: new Date().toISOString(),
      energy: Math.round(this.mood.energy * 100) / 100,
      engagement: Math.round(this.mood.engagement * 100) / 100,
      emotionalLoad: Math.round(this.mood.emotionalLoad * 100) / 100,
      inEmotionalMoment: this.mood.inEmotionalMoment,
      userEmotion: context.userEmotion,
      topicWeight: context.topicWeight,
    };

    this.snapshots.push(snapshot);

    // Track emotion frequency
    if (context.userEmotion) {
      const count = this.emotionCounts.get(context.userEmotion) || 0;
      this.emotionCounts.set(context.userEmotion, count + 1);
    }

    // Limit to last 100 snapshots to prevent memory bloat
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }
  }

  /**
   * Get current mood state
   */
  getMood(): ConversationMood {
    return { ...this.mood };
  }

  /**
   * Check if mood suggests we should be playful
   */
  canBePlayful(): boolean {
    return this.mood.emotionalLoad < 0.4 && this.mood.energy > 0.5;
  }

  /**
   * Check if mood suggests we should be supportive
   */
  needsSupport(): boolean {
    return this.mood.inEmotionalMoment || this.mood.emotionalLoad > 0.5;
  }

  /**
   * Check if energy is high enough for enthusiastic reactions
   */
  hasHighEnergy(): boolean {
    return this.mood.energy > 0.7 && this.mood.engagement > 0.7;
  }

  /**
   * Check if we're in late session (energy naturally lower)
   */
  isLateSession(): boolean {
    return this.turnCount > 15 && this.mood.energy < 0.55;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.mood = this.getInitialMood();
    this.turnCount = 0;
    this.snapshots = [];
    this.emotionCounts.clear();
    this.sessionId = undefined;
    this.userId = undefined;
    this.personaId = undefined;
    this.startedAt = new Date();
  }

  /**
   * Get emotional trajectory for this session
   */
  getTrajectory(): EmotionalTrajectory | null {
    if (!this.sessionId || !this.userId || !this.personaId) {
      return null;
    }

    // Calculate summary
    const summary = this.calculateSummary();

    return {
      sessionId: this.sessionId,
      userId: this.userId,
      personaId: this.personaId,
      startedAt: this.startedAt.toISOString(),
      snapshots: this.snapshots,
      summary,
    };
  }

  /**
   * Calculate summary statistics from snapshots
   */
  private calculateSummary(): EmotionalTrajectory['summary'] {
    if (this.snapshots.length === 0) {
      return undefined;
    }

    const energyValues = this.snapshots.map((s) => s.energy);
    const emotionalLoadValues = this.snapshots.map((s) => s.emotionalLoad);
    const emotionalMomentCount = this.snapshots.filter((s) => s.inEmotionalMoment).length;

    // Find dominant emotion
    let dominantEmotion: string | undefined;
    let maxCount = 0;
    for (const [emotion, count] of this.emotionCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion;
      }
    }

    // Calculate trend from first half vs second half energy
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (this.snapshots.length >= 4) {
      const mid = Math.floor(this.snapshots.length / 2);
      const firstHalfAvg = this.snapshots.slice(0, mid).reduce((sum, s) => sum + s.energy, 0) / mid;
      const secondHalfAvg =
        this.snapshots.slice(mid).reduce((sum, s) => sum + s.energy, 0) /
        (this.snapshots.length - mid);

      const diff = secondHalfAvg - firstHalfAvg;
      if (diff > 0.1) {
        trend = 'improving';
      } else if (diff < -0.1) {
        trend = 'declining';
      }
    }

    return {
      peakEnergy: Math.max(...energyValues),
      lowestEnergy: Math.min(...energyValues),
      peakEmotionalLoad: Math.max(...emotionalLoadValues),
      emotionalMomentCount,
      dominantEmotion,
      trend,
    };
  }

  /**
   * Persist emotional trajectory to Firestore
   */
  async persistTrajectory(): Promise<boolean> {
    const trajectory = this.getTrajectory();
    if (!trajectory) {
      log.warn(
        {
          hasSessionId: !!this.sessionId,
          hasUserId: !!this.userId,
          hasPersonaId: !!this.personaId,
          snapshotCount: this.snapshots.length,
        },
        '📊 SKIP: No trajectory to persist (missing session metadata)'
      );
      return false;
    }

    try {
      const db = await getFirestoreDb();
      if (!db) {
        log.warn('Firestore not available for trajectory persistence');
        return false;
      }

      const { FieldValue } = await import('firebase-admin/firestore');
      const path = `${USERS_COLLECTION}/${trajectory.userId}/${EMOTIONAL_TRAJECTORY_COLLECTION}/${trajectory.sessionId}`;

      const firestoreData = removeUndefined({
        ...trajectory,
        endedAt: new Date().toISOString(),
        persistedAt: FieldValue.serverTimestamp(),
      });

      await db.doc(path).set(firestoreData);

      log.info(
        {
          sessionId: trajectory.sessionId,
          userId: trajectory.userId,
          snapshotCount: trajectory.snapshots.length,
          trend: trajectory.summary?.trend,
        },
        '📊 Emotional trajectory persisted to Firestore'
      );

      return true;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to persist emotional trajectory');
      return false;
    }
  }

  /**
   * Get snapshots for debugging/analysis
   */
  getSnapshots(): EmotionalSnapshot[] {
    return [...this.snapshots];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const trackers = new Map<string, MoodTracker>();

export function getMoodTracker(personaId: string): MoodTracker {
  let tracker = trackers.get(personaId);
  if (!tracker) {
    tracker = new MoodTracker();
    trackers.set(personaId, tracker);
  }
  return tracker;
}

/**
 * Initialize mood tracker with session metadata
 */
export function initializeMoodTracker(
  personaId: string,
  sessionId: string,
  userId: string
): MoodTracker {
  const tracker = getMoodTracker(personaId);
  tracker.initializeSession(sessionId, userId, personaId);
  return tracker;
}

/**
 * Reset mood tracker and persist trajectory to Firestore
 */
export async function resetMoodTrackerWithPersistence(personaId: string): Promise<void> {
  const tracker = trackers.get(personaId);
  if (tracker) {
    // Persist trajectory before resetting
    await tracker.persistTrajectory();
    tracker.reset();
  }
  trackers.delete(personaId);
}

/**
 * Reset mood tracker without persistence (for quick cleanup)
 */
export function resetMoodTracker(personaId: string): void {
  const tracker = trackers.get(personaId);
  if (tracker) {
    tracker.reset();
  }
  trackers.delete(personaId);
}

/**
 * Reset all mood trackers (with optional persistence)
 */
export async function resetAllMoodTrackers(persist = false): Promise<void> {
  if (persist) {
    const persistPromises = Array.from(trackers.values()).map((t) => t.persistTrajectory());
    await Promise.allSettled(persistPromises);
  }
  trackers.clear();
}

/**
 * Get recent emotional trajectories for a user
 */
export async function getRecentTrajectories(
  userId: string,
  limit = 10
): Promise<EmotionalTrajectory[]> {
  try {
    const db = await getFirestoreDb();
    if (!db) return [];

    const path = `${USERS_COLLECTION}/${userId}/${EMOTIONAL_TRAJECTORY_COLLECTION}`;
    const snapshot = await db.collection(path).orderBy('startedAt', 'desc').limit(limit).get();

    return snapshot.docs.map((doc) => doc.data() as EmotionalTrajectory);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to fetch recent trajectories');
    return [];
  }
}
