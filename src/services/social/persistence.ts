/**
 * 🗄️ Social Features Persistence Layer
 *
 * Firestore persistence for Social/Multiplayer data:
 * - User stats & XP
 * - Challenge history
 * - Taste Match sessions
 * - Leaderboard data
 *
 * Falls back to in-memory storage when Firestore is unavailable.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserStats, GameStats } from './leaderboards.js';
import type { Challenge, TasteMatchSession } from './multiplayer-games.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface Firestore {
  collection(path: string): CollectionRef;
  runTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T>;
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
  size: number;
}

interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
  ref: DocumentRef;
}

interface Transaction {
  get(ref: DocumentRef): Promise<DocumentSnapshot>;
  set(ref: DocumentRef, data: unknown, options?: { merge?: boolean }): Transaction;
  update(ref: DocumentRef, data: unknown): Transaction;
}

// ============================================================================
// PERSISTENCE CLASS
// ============================================================================

class SocialPersistence {
  private db: Firestore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // In-memory fallback stores
  private memoryStats = new Map<string, UserStats>();
  private memoryChallenges = new Map<string, Challenge>();
  private memoryTasteMatch = new Map<string, TasteMatchSession>();

  // Collection names
  private readonly COLLECTION_USER_STATS = 'social_user_stats';
  private readonly COLLECTION_CHALLENGES = 'social_challenges';
  private readonly COLLECTION_TASTE_MATCH = 'social_taste_match';
  private readonly COLLECTION_LEADERBOARD = 'social_leaderboard';

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
      await this.db.collection(this.COLLECTION_USER_STATS).limit(1).get();

      this.initialized = true;
      log.info('✅ Social persistence initialized with Firestore');
    } catch (error) {
      log.warn(
        { error: String(error) },
        '⚠️ Firestore not available for Social, using in-memory fallback'
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
  // USER STATS
  // ========================================

  /**
   * Save user stats
   */
  async saveUserStats(userId: string, stats: UserStats): Promise<void> {
    await this.ensureInitialized();

    // Convert dates to ISO strings for Firestore
    const firestoreStats = {
      ...stats,
      lastPlayedAt: stats.lastPlayedAt?.toISOString() || null,
      createdAt: stats.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
      // Convert gameStats dates
      gameStats: Object.fromEntries(
        Object.entries(stats.gameStats).map(([key, gs]) => [
          key,
          {
            ...gs,
            lastPlayedAt: gs.lastPlayedAt?.toISOString() || null,
          },
        ])
      ),
    };

    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION_USER_STATS)
          .doc(userId)
          .set(cleanForFirestore(firestoreStats), { merge: true });
        log.debug({ userId, level: stats.level }, '💾 User stats saved');
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save user stats');
        this.memoryStats.set(userId, stats);
      }
    } else {
      this.memoryStats.set(userId, stats);
    }
  }

  /**
   * Load user stats
   */
  async loadUserStats(userId: string): Promise<UserStats | null> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION_USER_STATS).doc(userId).get();

        if (doc.exists) {
          const data = doc.data() as Record<string, unknown>;
          // Convert ISO strings back to Dates
          return {
            ...data,
            lastPlayedAt: data.lastPlayedAt ? new Date(data.lastPlayedAt as string) : null,
            createdAt: new Date(data.createdAt as string),
            updatedAt: new Date(data.updatedAt as string),
            gameStats: Object.fromEntries(
              Object.entries(data.gameStats as Record<string, unknown>).map(([key, gs]) => {
                const gameStats = gs as Record<string, unknown>;
                return [
                  key,
                  {
                    ...gameStats,
                    lastPlayedAt: gameStats.lastPlayedAt
                      ? new Date(gameStats.lastPlayedAt as string)
                      : null,
                  },
                ];
              })
            ),
          } as UserStats;
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load user stats');
      }
    }

    return this.memoryStats.get(userId) || null;
  }

  /**
   * Get top users for leaderboard
   */
  async getTopUsers(
    limit: number = 100,
    orderByField: string = 'totalScore'
  ): Promise<UserStats[]> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const snapshot = await this.db
          .collection(this.COLLECTION_USER_STATS)
          .orderBy(orderByField, 'desc')
          .limit(limit)
          .get();

        const users: UserStats[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, unknown>;
          users.push({
            ...data,
            lastPlayedAt: data.lastPlayedAt ? new Date(data.lastPlayedAt as string) : null,
            createdAt: new Date(data.createdAt as string),
            updatedAt: new Date(data.updatedAt as string),
            gameStats: data.gameStats as Record<string, GameStats>,
          } as UserStats);
        });
        return users;
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to get top users');
      }
    }

    // Fallback: sort in-memory
    return Array.from(this.memoryStats.values())
      .sort((a, b) => {
        const aVal = (a as unknown as Record<string, number>)[orderByField] ?? 0;
        const bVal = (b as unknown as Record<string, number>)[orderByField] ?? 0;
        return bVal - aVal;
      })
      .slice(0, limit);
  }

  // ========================================
  // CHALLENGES
  // ========================================

  /**
   * Save a challenge
   */
  async saveChallenge(challenge: Challenge): Promise<void> {
    await this.ensureInitialized();

    // Convert dates to ISO strings
    const firestoreChallenge = {
      ...challenge,
      createdAt: challenge.createdAt.toISOString(),
      expiresAt: challenge.expiresAt.toISOString(),
      acceptedAt: challenge.acceptedAt?.toISOString() || null,
      completedAt: challenge.completedAt?.toISOString() || null,
    };

    if (this.db) {
      try {
        await this.db
          .collection(this.COLLECTION_CHALLENGES)
          .doc(challenge.id)
          .set(cleanForFirestore(firestoreChallenge));
        log.debug({ challengeId: challenge.id }, '💾 Challenge saved');
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to save challenge');
        this.memoryChallenges.set(challenge.id, challenge);
      }
    } else {
      this.memoryChallenges.set(challenge.id, challenge);
    }
  }

  /**
   * Load a challenge
   */
  async loadChallenge(challengeId: string): Promise<Challenge | null> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION_CHALLENGES).doc(challengeId).get();

        if (doc.exists) {
          const data = doc.data() as Record<string, unknown>;
          return {
            ...data,
            createdAt: new Date(data.createdAt as string),
            expiresAt: new Date(data.expiresAt as string),
            acceptedAt: data.acceptedAt ? new Date(data.acceptedAt as string) : undefined,
            completedAt: data.completedAt ? new Date(data.completedAt as string) : undefined,
          } as Challenge;
        }
      } catch (error) {
        log.error({ error: String(error), challengeId }, 'Failed to load challenge');
      }
    }

    return this.memoryChallenges.get(challengeId) || null;
  }

  /**
   * Get pending challenges for a user
   */
  async getPendingChallenges(userId: string): Promise<Challenge[]> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const snapshot = await this.db
          .collection(this.COLLECTION_CHALLENGES)
          .where('challengeeId', '==', userId)
          .where('status', '==', 'pending')
          .orderBy('createdAt', 'desc')
          .get();

        const challenges: Challenge[] = [];
        snapshot.forEach((doc: DocumentSnapshot) => {
          const data = doc.data() as Record<string, unknown>;
          if (data) {
            challenges.push({
              ...data,
              createdAt: new Date(data.createdAt as string),
              expiresAt: new Date(data.expiresAt as string),
            } as Challenge);
          }
        });
        return challenges.filter((c) => c.expiresAt > new Date());
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get pending challenges');
      }
    }

    // Fallback
    return Array.from(this.memoryChallenges.values())
      .filter(
        (c) => c.challengeeId === userId && c.status === 'pending' && c.expiresAt > new Date()
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get challenge history for a user
   */
  async getChallengeHistory(userId: string, limit: number = 20): Promise<Challenge[]> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        // Get challenges where user is challenger or challengee
        const [asChallenger, asChallengee] = await Promise.all([
          this.db
            .collection(this.COLLECTION_CHALLENGES)
            .where('challengerId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get(),
          this.db
            .collection(this.COLLECTION_CHALLENGES)
            .where('challengeeId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get(),
        ]);

        const challenges: Challenge[] = [];
        const seen = new Set<string>();

        [asChallenger, asChallengee].forEach((snapshot) => {
          snapshot.forEach((doc) => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              const data = doc.data() as Record<string, unknown>;
              challenges.push({
                ...data,
                createdAt: new Date(data.createdAt as string),
                expiresAt: new Date(data.expiresAt as string),
                acceptedAt: data.acceptedAt ? new Date(data.acceptedAt as string) : undefined,
                completedAt: data.completedAt ? new Date(data.completedAt as string) : undefined,
              } as Challenge);
            }
          });
        });

        return challenges
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit);
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get challenge history');
      }
    }

    // Fallback
    return Array.from(this.memoryChallenges.values())
      .filter((c) => c.challengerId === userId || c.challengeeId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ========================================
  // TASTE MATCH
  // ========================================

  /**
   * Save Taste Match session
   */
  async saveTasteMatchSession(session: TasteMatchSession): Promise<void> {
    await this.ensureInitialized();

    // Convert dates
    const firestoreSession = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() || null,
      participants: session.participants.map((p) => ({
        ...p,
        joinedAt: p.joinedAt.toISOString(),
      })),
    };

    if (this.db) {
      try {
        await this.db.collection(this.COLLECTION_TASTE_MATCH).doc(session.id).set(cleanForFirestore(firestoreSession));
        log.debug({ sessionId: session.id }, '💾 Taste Match session saved');
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to save Taste Match session');
        this.memoryTasteMatch.set(session.id, session);
      }
    } else {
      this.memoryTasteMatch.set(session.id, session);
    }
  }

  /**
   * Load Taste Match session
   */
  async loadTasteMatchSession(sessionId: string): Promise<TasteMatchSession | null> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const doc = await this.db.collection(this.COLLECTION_TASTE_MATCH).doc(sessionId).get();

        if (doc.exists) {
          const data = doc.data() as Record<string, unknown>;
          return {
            ...data,
            createdAt: new Date(data.createdAt as string),
            completedAt: data.completedAt ? new Date(data.completedAt as string) : undefined,
            participants: (data.participants as Array<Record<string, unknown>>).map((p) => ({
              ...p,
              joinedAt: new Date(p.joinedAt as string),
            })),
          } as unknown as TasteMatchSession;
        }
      } catch (error) {
        log.error({ error: String(error), sessionId }, 'Failed to load Taste Match session');
      }
    }

    return this.memoryTasteMatch.get(sessionId) || null;
  }

  // ========================================
  // ATOMIC OPERATIONS
  // ========================================

  /**
   * Atomically increment user XP and update level
   */
  async incrementXP(
    userId: string,
    xpAmount: number,
    calculateLevel: (xp: number) => number
  ): Promise<UserStats | null> {
    await this.ensureInitialized();

    if (this.db) {
      try {
        const result = await this.db.runTransaction(async (transaction) => {
          const docRef = this.db!.collection(this.COLLECTION_USER_STATS).doc(userId);
          const doc = await transaction.get(docRef);

          if (!doc.exists) {
            return null;
          }

          const data = doc.data() as Record<string, unknown>;
          const currentXP = (data.totalXP as number) || 0;
          const newXP = currentXP + xpAmount;
          const newLevel = calculateLevel(newXP);

          transaction.update(docRef, {
            totalXP: newXP,
            level: newLevel,
            updatedAt: new Date().toISOString(),
          });

          return {
            ...data,
            totalXP: newXP,
            level: newLevel,
          } as unknown as UserStats;
        });

        return result;
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to increment XP atomically');
      }
    }

    // Fallback: non-atomic
    const stats = this.memoryStats.get(userId);
    if (stats) {
      stats.totalXP += xpAmount;
      stats.level = calculateLevel(stats.totalXP);
      return stats;
    }
    return null;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SocialPersistence | null = null;

export function getSocialPersistence(): SocialPersistence {
  if (!instance) {
    instance = new SocialPersistence();
  }
  return instance;
}

export { SocialPersistence };
