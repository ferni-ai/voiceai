/**
 * Maya Gamification Store
 * 
 * Dedicated Firestore-backed storage for Maya's gamification system.
 * Uses subcollections for better querying and scalability:
 * 
 * users/{userId}/
 *   maya_gamification/
 *     profile (single doc)
 *     badges/{badgeId}
 *     challenges/{challengeId}
 *     achievements/{achievementId}
 *     mood_logs/{logId}
 *     behavior_tools/{toolId}
 * 
 * maya_leaderboards/
 *   global/
 *     weekly_xp
 *     monthly_xp
 *     all_time_xp
 *   by_domain/{domainId}
 */

import { log } from '@livekit/agents';
import { z } from 'zod';
import { Firestore, FieldValue, Query, DocumentData } from '@google-cloud/firestore';

const getLogger = () => log();

// ============================================================================
// ZOD SCHEMAS - Data Validation
// ============================================================================

// Badge earned by user
export const EarnedBadgeSchema = z.object({
  id: z.string(),
  badgeId: z.string(),
  userId: z.string(),
  earnedAt: z.string().datetime(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
  category: z.string(),
  xpAwarded: z.number().default(50),
});
export type EarnedBadge = z.infer<typeof EarnedBadgeSchema>;

// User's gamification profile
export const GamificationProfileSchema = z.object({
  userId: z.string(),
  totalXP: z.number().min(0).default(0),
  level: z.number().min(1).default(1),
  currentTitle: z.string().default('newcomer'),
  titleTier: z.number().min(1).max(10).default(1),
  
  // Counts (for quick access without aggregations)
  badgeCount: z.number().default(0),
  challengesCompleted: z.number().default(0),
  
  // Stats
  stats: z.object({
    totalHabitsCreated: z.number().default(0),
    totalCompletions: z.number().default(0),
    longestStreak: z.number().default(0),
    currentStreak: z.number().default(0),
    domainsExplored: z.array(z.string()).default([]),
    behaviorToolsUsed: z.array(z.string()).default([]),
    comebacks: z.number().default(0),
    weeklyReflections: z.number().default(0),
  }),
  
  // Preferences
  preferences: z.object({
    showOnLeaderboard: z.boolean().default(true),
    displayName: z.string().optional(), // For leaderboard (privacy)
    shareProgress: z.boolean().default(false),
  }).default({
    showOnLeaderboard: true,
    shareProgress: false,
  }),
  
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});
export type GamificationProfile = z.infer<typeof GamificationProfileSchema>;

// Challenge progress
export const ChallengeProgressSchema = z.object({
  id: z.string(),
  challengeType: z.string(),
  userId: z.string(),
  status: z.enum(['active', 'completed', 'abandoned']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  currentDay: z.number().min(0),
  totalDays: z.number().default(30),
  completedDays: z.array(z.number()),
  skippedDays: z.array(z.number()).default([]),
  actions: z.record(z.string(), z.any()).default({}),
  notes: z.string().optional(),
  xpEarned: z.number().default(0),
});
export type ChallengeProgress = z.infer<typeof ChallengeProgressSchema>;

// Behavior tool usage
export const BehaviorToolUsageSchema = z.object({
  id: z.string(),
  toolType: z.enum([
    'four_tendencies',
    'identity_shift',
    'habit_break',
    'environment_design',
    'temptation_bundle',
    'setback_recovery',
    'accountability',
    'habit_audit',
    'circle_of_influence'
  ]),
  userId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: z.record(z.string(), z.any()), // Tool-specific data
  status: z.enum(['active', 'completed', 'paused']).default('active'),
});
export type BehaviorToolUsage = z.infer<typeof BehaviorToolUsageSchema>;

// Mood log entry
export const MoodLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: z.string().datetime(),
  mood: z.number().min(1).max(10),
  energy: z.number().min(1).max(10),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  correlations: z.record(z.string(), z.any()).optional(),
});
export type MoodLog = z.infer<typeof MoodLogSchema>;

// Leaderboard entry
export const LeaderboardEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  xp: z.number(),
  level: z.number(),
  title: z.string(),
  titleEmoji: z.string(),
  badgeCount: z.number(),
  rank: z.number().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  lastUpdated: z.string().datetime(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// Export data (for backup)
export const GamificationExportSchema = z.object({
  version: z.string().default('1.0'),
  exportedAt: z.string().datetime(),
  userId: z.string(),
  profile: GamificationProfileSchema,
  badges: z.array(EarnedBadgeSchema),
  challenges: z.array(ChallengeProgressSchema),
  behaviorTools: z.array(BehaviorToolUsageSchema),
  moodLogs: z.array(MoodLogSchema),
});
export type GamificationExport = z.infer<typeof GamificationExportSchema>;

// ============================================================================
// MAYA GAMIFICATION STORE CLASS
// ============================================================================

class MayaGamificationStore {
  private db: Firestore | null = null;
  private initialized = false;
  
  // Cache for hot data
  private profileCache: Map<string, { data: GamificationProfile; expires: number }> = new Map();
  private readonly CACHE_TTL = 60 * 1000; // 1 minute cache

  // Collection paths
  private readonly USERS_COLLECTION = 'users';
  private readonly GAMIFICATION_SUBCOLLECTION = 'maya_gamification';
  private readonly LEADERBOARD_COLLECTION = 'maya_leaderboards';
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.db = new Firestore();
      this.initialized = true;
      getLogger().info('🎮 Maya Gamification Store initialized');
    } catch (error) {
      getLogger().warn({ error }, 'Firestore not available for gamification store');
      this.db = null;
    }
  }

  private async ensureInitialized(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.db !== null;
  }

  // ============================================================================
  // PROFILE OPERATIONS
  // ============================================================================

  /**
   * Get or create a user's gamification profile
   */
  async getProfile(userId: string): Promise<GamificationProfile> {
    // Check cache first
    const cached = this.profileCache.get(userId);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    if (!await this.ensureInitialized() || !this.db) {
      return this.createDefaultProfile(userId);
    }

    try {
      const docRef = this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('profile');
      
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data() as GamificationProfile;
        const validated = GamificationProfileSchema.parse(data);
        this.cacheProfile(userId, validated);
        return validated;
      }
      
      // Create new profile
      const newProfile = this.createDefaultProfile(userId);
      await docRef.set(newProfile);
      this.cacheProfile(userId, newProfile);
      
      getLogger().info({ userId }, '🎮 Created new gamification profile');
      return newProfile;
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get gamification profile');
      return this.createDefaultProfile(userId);
    }
  }

  /**
   * Update a user's gamification profile
   */
  async updateProfile(userId: string, updates: Partial<GamificationProfile>): Promise<GamificationProfile> {
    const profile = await this.getProfile(userId);
    
    const updatedProfile: GamificationProfile = {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    
    // Validate
    const validated = GamificationProfileSchema.parse(updatedProfile);

    if (await this.ensureInitialized() && this.db) {
      try {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('profile')
          .set(validated);
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to save gamification profile');
      }
    }
    
    this.cacheProfile(userId, validated);
    return validated;
  }

  /**
   * Add XP to a user's profile
   */
  async addXP(userId: string, amount: number, reason: string): Promise<{ newTotal: number; leveledUp: boolean; newLevel: number }> {
    const profile = await this.getProfile(userId);
    const oldLevel = profile.level;
    
    const newTotalXP = profile.totalXP + amount;
    const newLevel = this.calculateLevel(newTotalXP);
    const leveledUp = newLevel > oldLevel;
    
    await this.updateProfile(userId, {
      totalXP: newTotalXP,
      level: newLevel,
    });
    
    getLogger().info({ userId, amount, reason, newTotal: newTotalXP, leveledUp }, '⭐ XP added');
    
    return { newTotal: newTotalXP, leveledUp, newLevel };
  }

  // ============================================================================
  // BADGE OPERATIONS (Subcollection)
  // ============================================================================

  /**
   * Award a badge to a user
   */
  async awardBadge(userId: string, badge: Omit<EarnedBadge, 'id' | 'earnedAt'>): Promise<EarnedBadge> {
    const earnedBadge: EarnedBadge = {
      ...badge,
      id: `badge_${badge.badgeId}_${Date.now()}`,
      earnedAt: new Date().toISOString(),
    };
    
    // Validate
    const validated = EarnedBadgeSchema.parse(earnedBadge);

    if (await this.ensureInitialized() && this.db) {
      try {
        // Save to subcollection
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('badges')
          .collection('items')
          .doc(validated.badgeId)
          .set(validated);
        
        // Update badge count in profile
        const profile = await this.getProfile(userId);
        await this.updateProfile(userId, {
          badgeCount: profile.badgeCount + 1,
        });
        
        // Award XP for badge
        await this.addXP(userId, validated.xpAwarded, `Earned badge: ${validated.badgeId}`);
        
        getLogger().info({ userId, badgeId: badge.badgeId }, '🏅 Badge awarded');
      } catch (error) {
        getLogger().error({ error, userId, badgeId: badge.badgeId }, 'Failed to award badge');
      }
    }
    
    return validated;
  }

  /**
   * Get all badges for a user
   */
  async getUserBadges(userId: string): Promise<EarnedBadge[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('badges')
        .collection('items')
        .orderBy('earnedAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => EarnedBadgeSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get user badges');
      return [];
    }
  }

  /**
   * Query badges by rarity
   */
  async getBadgesByRarity(userId: string, rarity: EarnedBadge['rarity']): Promise<EarnedBadge[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('badges')
        .collection('items')
        .where('rarity', '==', rarity)
        .get();
      
      return snapshot.docs.map(doc => EarnedBadgeSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId, rarity }, 'Failed to query badges by rarity');
      return [];
    }
  }

  /**
   * Check if user has a specific badge
   */
  async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    if (!await this.ensureInitialized() || !this.db) {
      return false;
    }

    try {
      const doc = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('badges')
        .collection('items')
        .doc(badgeId)
        .get();
      
      return doc.exists;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // CHALLENGE OPERATIONS (Subcollection)
  // ============================================================================

  /**
   * Start a new challenge
   */
  async startChallenge(userId: string, challenge: Omit<ChallengeProgress, 'id' | 'startDate' | 'status'>): Promise<ChallengeProgress> {
    const newChallenge: ChallengeProgress = {
      ...challenge,
      id: `challenge_${challenge.challengeType}_${Date.now()}`,
      startDate: new Date().toISOString(),
      status: 'active',
    };
    
    const validated = ChallengeProgressSchema.parse(newChallenge);

    if (await this.ensureInitialized() && this.db) {
      try {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('challenges')
          .collection('items')
          .doc(validated.id)
          .set(validated);
        
        getLogger().info({ userId, challengeType: challenge.challengeType }, '🎯 Challenge started');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to start challenge');
      }
    }
    
    return validated;
  }

  /**
   * Update challenge progress
   */
  async updateChallenge(userId: string, challengeId: string, updates: Partial<ChallengeProgress>): Promise<ChallengeProgress | null> {
    if (!await this.ensureInitialized() || !this.db) {
      return null;
    }

    try {
      const docRef = this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('challenges')
        .collection('items')
        .doc(challengeId);
      
      const doc = await docRef.get();
      if (!doc.exists) return null;
      
      const current = ChallengeProgressSchema.parse(doc.data());
      const updated = ChallengeProgressSchema.parse({ ...current, ...updates });
      
      await docRef.set(updated);
      
      // If completed, update profile and award XP
      if (updates.status === 'completed' && current.status !== 'completed') {
        const profile = await this.getProfile(userId);
        await this.updateProfile(userId, {
          challengesCompleted: profile.challengesCompleted + 1,
        });
        await this.addXP(userId, 500, `Completed ${current.challengeType} challenge`);
      }
      
      return updated;
    } catch (error) {
      getLogger().error({ error, userId, challengeId }, 'Failed to update challenge');
      return null;
    }
  }

  /**
   * Get active challenges for a user
   */
  async getActiveChallenges(userId: string): Promise<ChallengeProgress[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('challenges')
        .collection('items')
        .where('status', '==', 'active')
        .get();
      
      return snapshot.docs.map(doc => ChallengeProgressSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get active challenges');
      return [];
    }
  }

  /**
   * Get completed challenges for a user
   */
  async getCompletedChallenges(userId: string): Promise<ChallengeProgress[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('challenges')
        .collection('items')
        .where('status', '==', 'completed')
        .orderBy('endDate', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ChallengeProgressSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get completed challenges');
      return [];
    }
  }

  // ============================================================================
  // BEHAVIOR TOOL OPERATIONS (Subcollection)
  // ============================================================================

  /**
   * Save behavior tool usage
   */
  async saveBehaviorTool(userId: string, tool: Omit<BehaviorToolUsage, 'id' | 'createdAt' | 'updatedAt'>): Promise<BehaviorToolUsage> {
    const newTool: BehaviorToolUsage = {
      ...tool,
      id: `tool_${tool.toolType}_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const validated = BehaviorToolUsageSchema.parse(newTool);

    if (await this.ensureInitialized() && this.db) {
      try {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('behavior_tools')
          .collection('items')
          .doc(validated.id)
          .set(validated);
        
        // Update profile stats
        const profile = await this.getProfile(userId);
        if (!profile.stats.behaviorToolsUsed.includes(tool.toolType)) {
          await this.updateProfile(userId, {
            stats: {
              ...profile.stats,
              behaviorToolsUsed: [...profile.stats.behaviorToolsUsed, tool.toolType],
            },
          });
          // Award XP for using a new behavior science tool
          await this.addXP(userId, 30, `Used ${tool.toolType} tool`);
        }
        
        getLogger().info({ userId, toolType: tool.toolType }, '🔬 Behavior tool saved');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to save behavior tool');
      }
    }
    
    return validated;
  }

  /**
   * Get behavior tools by type
   */
  async getBehaviorToolsByType(userId: string, toolType: BehaviorToolUsage['toolType']): Promise<BehaviorToolUsage[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('behavior_tools')
        .collection('items')
        .where('toolType', '==', toolType)
        .orderBy('createdAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => BehaviorToolUsageSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId, toolType }, 'Failed to get behavior tools');
      return [];
    }
  }

  // ============================================================================
  // MOOD LOG OPERATIONS (Subcollection)
  // ============================================================================

  /**
   * Log mood entry
   */
  async logMood(userId: string, mood: Omit<MoodLog, 'id'>): Promise<MoodLog> {
    const newLog: MoodLog = {
      ...mood,
      id: `mood_${Date.now()}`,
    };
    
    const validated = MoodLogSchema.parse(newLog);

    if (await this.ensureInitialized() && this.db) {
      try {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('mood_logs')
          .collection('items')
          .doc(validated.id)
          .set(validated);
        
        getLogger().debug({ userId, mood: mood.mood, energy: mood.energy }, '📊 Mood logged');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to log mood');
      }
    }
    
    return validated;
  }

  /**
   * Get mood logs for date range
   */
  async getMoodLogs(userId: string, startDate: Date, endDate: Date): Promise<MoodLog[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION)
        .doc('mood_logs')
        .collection('items')
        .where('date', '>=', startDate.toISOString())
        .where('date', '<=', endDate.toISOString())
        .orderBy('date', 'desc')
        .get();
      
      return snapshot.docs.map(doc => MoodLogSchema.parse(doc.data()));
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to get mood logs');
      return [];
    }
  }

  // ============================================================================
  // LEADERBOARD OPERATIONS
  // ============================================================================

  /**
   * Update user's leaderboard entry
   */
  async updateLeaderboardEntry(userId: string): Promise<void> {
    if (!await this.ensureInitialized() || !this.db) {
      return;
    }

    const profile = await this.getProfile(userId);
    
    // Check if user opts into leaderboard
    if (!profile.preferences.showOnLeaderboard) {
      return;
    }

    const now = new Date();
    const weekStart = this.getWeekStart(now);
    const monthStart = this.getMonthStart(now);

    const entry: LeaderboardEntry = {
      id: userId,
      userId,
      displayName: profile.preferences.displayName || `Player${userId.slice(-4)}`,
      xp: profile.totalXP,
      level: profile.level,
      title: profile.currentTitle,
      titleEmoji: this.getTitleEmoji(profile.currentTitle),
      badgeCount: profile.badgeCount,
      periodStart: weekStart.toISOString(),
      periodEnd: now.toISOString(),
      lastUpdated: now.toISOString(),
    };

    try {
      // Update weekly leaderboard
      await this.db
        .collection(this.LEADERBOARD_COLLECTION)
        .doc('weekly')
        .collection('entries')
        .doc(userId)
        .set(entry);

      // Update monthly leaderboard
      await this.db
        .collection(this.LEADERBOARD_COLLECTION)
        .doc('monthly')
        .collection('entries')
        .doc(userId)
        .set({ ...entry, periodStart: monthStart.toISOString() });

      // Update all-time leaderboard
      await this.db
        .collection(this.LEADERBOARD_COLLECTION)
        .doc('all_time')
        .collection('entries')
        .doc(userId)
        .set(entry);

    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to update leaderboard');
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    period: 'weekly' | 'monthly' | 'all_time',
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    if (!await this.ensureInitialized() || !this.db) {
      return [];
    }

    try {
      const snapshot = await this.db
        .collection(this.LEADERBOARD_COLLECTION)
        .doc(period)
        .collection('entries')
        .orderBy('xp', 'desc')
        .limit(limit)
        .get();
      
      const entries = snapshot.docs.map((doc, index) => ({
        ...LeaderboardEntrySchema.parse(doc.data()),
        rank: index + 1,
      }));
      
      return entries;
    } catch (error) {
      getLogger().error({ error, period }, 'Failed to get leaderboard');
      return [];
    }
  }

  /**
   * Get user's rank on leaderboard
   */
  async getUserRank(userId: string, period: 'weekly' | 'monthly' | 'all_time'): Promise<number | null> {
    if (!await this.ensureInitialized() || !this.db) {
      return null;
    }

    try {
      const profile = await this.getProfile(userId);
      
      // Count users with more XP
      const snapshot = await this.db
        .collection(this.LEADERBOARD_COLLECTION)
        .doc(period)
        .collection('entries')
        .where('xp', '>', profile.totalXP)
        .count()
        .get();
      
      return snapshot.data().count + 1;
    } catch (error) {
      getLogger().error({ error, userId, period }, 'Failed to get user rank');
      return null;
    }
  }

  /**
   * Set user's leaderboard preferences
   */
  async setLeaderboardPreferences(
    userId: string,
    preferences: {
      showOnLeaderboard?: boolean;
      displayName?: string;
      shareProgress?: boolean;
    }
  ): Promise<void> {
    const profile = await this.getProfile(userId);
    await this.updateProfile(userId, {
      preferences: {
        ...profile.preferences,
        ...preferences,
      },
    });

    // If opting out, remove from leaderboards
    if (preferences.showOnLeaderboard === false && this.db) {
      try {
        await Promise.all([
          this.db.collection(this.LEADERBOARD_COLLECTION).doc('weekly').collection('entries').doc(userId).delete(),
          this.db.collection(this.LEADERBOARD_COLLECTION).doc('monthly').collection('entries').doc(userId).delete(),
          this.db.collection(this.LEADERBOARD_COLLECTION).doc('all_time').collection('entries').doc(userId).delete(),
        ]);
        getLogger().info({ userId }, 'Removed from leaderboards');
      } catch (error) {
        getLogger().warn({ error, userId }, 'Failed to remove from leaderboards');
      }
    }
  }

  // ============================================================================
  // BACKUP / EXPORT / IMPORT
  // ============================================================================

  /**
   * Export all gamification data for a user
   */
  async exportUserData(userId: string): Promise<GamificationExport> {
    const profile = await this.getProfile(userId);
    const badges = await this.getUserBadges(userId);
    
    // Get all challenges
    let challenges: ChallengeProgress[] = [];
    if (await this.ensureInitialized() && this.db) {
      try {
        const snapshot = await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('challenges')
          .collection('items')
          .get();
        challenges = snapshot.docs.map(doc => ChallengeProgressSchema.parse(doc.data()));
      } catch {
        // Ignore errors, return empty
      }
    }

    // Get all behavior tools
    let behaviorTools: BehaviorToolUsage[] = [];
    if (this.db) {
      try {
        const snapshot = await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('behavior_tools')
          .collection('items')
          .get();
        behaviorTools = snapshot.docs.map(doc => BehaviorToolUsageSchema.parse(doc.data()));
      } catch {
        // Ignore
      }
    }

    // Get all mood logs (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const moodLogs = await this.getMoodLogs(userId, ninetyDaysAgo, new Date());

    const exportData: GamificationExport = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId,
      profile,
      badges,
      challenges,
      behaviorTools,
      moodLogs,
    };

    // Validate export
    return GamificationExportSchema.parse(exportData);
  }

  /**
   * Import gamification data for a user (restore from backup)
   */
  async importUserData(userId: string, data: GamificationExport, options: {
    overwrite?: boolean;
    mergeProfile?: boolean;
  } = {}): Promise<{ success: boolean; imported: { badges: number; challenges: number; behaviorTools: number; moodLogs: number } }> {
    // Validate import data
    const validated = GamificationExportSchema.parse(data);
    
    if (!await this.ensureInitialized() || !this.db) {
      return { success: false, imported: { badges: 0, challenges: 0, behaviorTools: 0, moodLogs: 0 } };
    }

    const imported = { badges: 0, challenges: 0, behaviorTools: 0, moodLogs: 0 };

    try {
      // Import profile
      if (options.mergeProfile) {
        const currentProfile = await this.getProfile(userId);
        await this.updateProfile(userId, {
          totalXP: Math.max(currentProfile.totalXP, validated.profile.totalXP),
          stats: {
            ...currentProfile.stats,
            longestStreak: Math.max(currentProfile.stats.longestStreak, validated.profile.stats.longestStreak),
            totalCompletions: Math.max(currentProfile.stats.totalCompletions, validated.profile.stats.totalCompletions),
            domainsExplored: [...new Set([...currentProfile.stats.domainsExplored, ...validated.profile.stats.domainsExplored])],
            behaviorToolsUsed: [...new Set([...currentProfile.stats.behaviorToolsUsed, ...validated.profile.stats.behaviorToolsUsed])],
          },
        });
      } else if (options.overwrite) {
        await this.updateProfile(userId, validated.profile);
      }

      // Import badges
      for (const badge of validated.badges) {
        const exists = await this.hasBadge(userId, badge.badgeId);
        if (!exists || options.overwrite) {
          await this.db
            .collection(this.USERS_COLLECTION)
            .doc(userId)
            .collection(this.GAMIFICATION_SUBCOLLECTION)
            .doc('badges')
            .collection('items')
            .doc(badge.badgeId)
            .set({ ...badge, userId });
          imported.badges++;
        }
      }

      // Import challenges
      for (const challenge of validated.challenges) {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('challenges')
          .collection('items')
          .doc(challenge.id)
          .set({ ...challenge, userId });
        imported.challenges++;
      }

      // Import behavior tools
      for (const tool of validated.behaviorTools) {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('behavior_tools')
          .collection('items')
          .doc(tool.id)
          .set({ ...tool, userId });
        imported.behaviorTools++;
      }

      // Import mood logs
      for (const log of validated.moodLogs) {
        await this.db
          .collection(this.USERS_COLLECTION)
          .doc(userId)
          .collection(this.GAMIFICATION_SUBCOLLECTION)
          .doc('mood_logs')
          .collection('items')
          .doc(log.id)
          .set({ ...log, userId });
        imported.moodLogs++;
      }

      getLogger().info({ userId, imported }, '📥 Gamification data imported');
      return { success: true, imported };
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to import gamification data');
      return { success: false, imported };
    }
  }

  /**
   * Delete all gamification data for a user
   */
  async deleteUserData(userId: string): Promise<boolean> {
    if (!await this.ensureInitialized() || !this.db) {
      return false;
    }

    try {
      const batch = this.db.batch();
      const userGamificationRef = this.db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection(this.GAMIFICATION_SUBCOLLECTION);

      // Delete profile
      batch.delete(userGamificationRef.doc('profile'));

      // Delete from subcollections (Firestore doesn't automatically delete subcollection docs)
      const subcollections = ['badges', 'challenges', 'behavior_tools', 'mood_logs'];
      for (const subcol of subcollections) {
        const snapshot = await userGamificationRef.doc(subcol).collection('items').get();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
      }

      // Remove from leaderboards
      batch.delete(this.db.collection(this.LEADERBOARD_COLLECTION).doc('weekly').collection('entries').doc(userId));
      batch.delete(this.db.collection(this.LEADERBOARD_COLLECTION).doc('monthly').collection('entries').doc(userId));
      batch.delete(this.db.collection(this.LEADERBOARD_COLLECTION).doc('all_time').collection('entries').doc(userId));

      await batch.commit();
      
      // Clear cache
      this.profileCache.delete(userId);
      
      getLogger().info({ userId }, '🗑️ Gamification data deleted');
      return true;
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to delete gamification data');
      return false;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private createDefaultProfile(userId: string): GamificationProfile {
    const now = new Date().toISOString();
    return {
      userId,
      totalXP: 0,
      level: 1,
      currentTitle: 'newcomer',
      titleTier: 1,
      badgeCount: 0,
      challengesCompleted: 0,
      stats: {
        totalHabitsCreated: 0,
        totalCompletions: 0,
        longestStreak: 0,
        currentStreak: 0,
        domainsExplored: [],
        behaviorToolsUsed: [],
        comebacks: 0,
        weeklyReflections: 0,
      },
      preferences: {
        showOnLeaderboard: true,
        shareProgress: false,
      },
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };
  }

  private cacheProfile(userId: string, profile: GamificationProfile): void {
    this.profileCache.set(userId, {
      data: profile,
      expires: Date.now() + this.CACHE_TTL,
    });
  }

  private calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    return new Date(d.setDate(diff));
  }

  private getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getTitleEmoji(title: string): string {
    const emojis: Record<string, string> = {
      newcomer: '🌱',
      habit_seeker: '🔍',
      habit_starter: '🚀',
      habit_builder: '🏗️',
      habit_practitioner: '🎯',
      habit_journeyman: '🛤️',
      habit_expert: '⭐',
      habit_master: '🏆',
      habit_sage: '🧙',
      habit_legend: '👑',
    };
    return emojis[title] || '🌱';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let storeInstance: MayaGamificationStore | null = null;

export function getMayaGamificationStore(): MayaGamificationStore {
  if (!storeInstance) {
    storeInstance = new MayaGamificationStore();
  }
  return storeInstance;
}

export async function initializeMayaGamificationStore(): Promise<MayaGamificationStore> {
  const store = getMayaGamificationStore();
  await store.initialize();
  return store;
}

export default MayaGamificationStore;

