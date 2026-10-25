/**
 * Celebration Momentum Tracker
 *
 * Tracks patterns of wins and effort over time, recognizing
 * streaks, themes, and building positive momentum.
 *
 * Philosophy: Progress isn't linear, but patterns emerge.
 * Recognizing momentum reinforces positive change.
 *
 * Features:
 * - Win streaks (consecutive wins)
 * - Win themes (patterns in win types)
 * - Momentum score (recent positive activity)
 * - Effort recognition (consistency over time)
 * - Comeback detection (recovery after struggles)
 *
 * PERSISTENCE: Momentum profiles are persisted to Firestore.
 *
 * @module CelebrationMomentum
 */

import { createLogger } from '../../utils/safe-logger.js';
import { indexSmallWin } from '../data-layer/integrations/trust-integration.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  formatWinType,
  generateSSML,
  getStreakMessage,
  getThemeMessage,
} from './celebration-momentum-copy.js';
import { recordedWhileHeld, withoutHeld } from './held-window.js';

const log = createLogger({ module: 'CelebrationMomentum' });

// ============================================================================
// TYPES
// ============================================================================

export type WinType =
  | 'followed_through'
  | 'courage_moment'
  | 'self_care'
  | 'boundary_held'
  | 'hard_conversation'
  | 'showed_up'
  | 'tried_new_thing'
  | 'asked_for_help'
  | 'effort_made'
  | 'consistency'
  | 'breakthrough';

export interface TrackedWin {
  id: string;
  type: WinType;
  description: string;
  detectedAt: Date;
  celebrated: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  context?: string;
  tags: string[];
}

export interface WinStreak {
  id: string;
  type: 'daily' | 'weekly' | 'type_specific';
  count: number;
  startDate: Date;
  lastWinDate: Date;
  winType?: WinType; // For type-specific streaks
  active: boolean;
  celebrated: boolean;
}

export interface WinTheme {
  type: WinType;
  count: number;
  percentage: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  lastSeen: Date;
}

export interface MomentumProfile {
  userId: string;
  wins: TrackedWin[];
  streaks: WinStreak[];
  themes: WinTheme[];

  // Momentum metrics
  momentumScore: number; // 0-100
  momentumTrend: 'building' | 'stable' | 'declining';

  // Effort tracking
  consistencyScore: number; // 0-100
  totalWins: number;
  winsThisWeek: number;
  winsThisMonth: number;

  // Special states
  comebackDetected: boolean;
  breakthroughMoment: boolean;

  lastUpdated: Date;
}

export interface CelebrationSuggestion {
  type: 'streak' | 'milestone' | 'theme' | 'momentum' | 'comeback' | 'breakthrough';
  message: string;
  intensity: 'subtle' | 'warm' | 'enthusiastic';
  ssml: string;
}

// ============================================================================
// STREAK DEFINITIONS
// ============================================================================

const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 100];

const MOMENTUM_WEIGHTS: Record<WinType, number> = {
  followed_through: 1.2, // Reliable = momentum builder
  courage_moment: 1.5, // Big impact
  self_care: 1.0,
  boundary_held: 1.3, // Hard but important
  hard_conversation: 1.4,
  showed_up: 1.0,
  tried_new_thing: 1.3,
  asked_for_help: 1.2,
  effort_made: 0.8,
  consistency: 1.1,
  breakthrough: 2.0, // Major impact
};

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface PersistedMomentumProfile {
  userId: string;
  wins: Array<Omit<TrackedWin, 'detectedAt'> & { detectedAt: string }>;
  streaks: Array<
    Omit<WinStreak, 'startDate' | 'lastWinDate'> & { startDate: string; lastWinDate: string }
  >;
  themes: Array<Omit<WinTheme, 'lastSeen'> & { lastSeen: string }>;
  momentumScore: number;
  momentumTrend: 'building' | 'stable' | 'declining';
  consistencyScore: number;
  totalWins: number;
  winsThisWeek: number;
  winsThisMonth: number;
  comebackDetected: boolean;
  breakthroughMoment: boolean;
  lastUpdated: string;
}

function serializeProfile(profile: MomentumProfile): PersistedMomentumProfile {
  return {
    ...profile,
    wins: profile.wins.map((w) => ({ ...w, detectedAt: w.detectedAt.toISOString() })),
    streaks: profile.streaks.map((s) => ({
      ...s,
      startDate: s.startDate.toISOString(),
      lastWinDate: s.lastWinDate.toISOString(),
    })),
    themes: profile.themes.map((t) => ({ ...t, lastSeen: t.lastSeen.toISOString() })),
    lastUpdated: profile.lastUpdated.toISOString(),
  };
}

function deserializeProfile(data: PersistedMomentumProfile): MomentumProfile {
  return {
    ...data,
    wins: data.wins.map((w) => ({ ...w, detectedAt: new Date(w.detectedAt) })),
    streaks: data.streaks.map((s) => ({
      ...s,
      startDate: new Date(s.startDate),
      lastWinDate: new Date(s.lastWinDate),
    })),
    themes: data.themes.map((t) => ({ ...t, lastSeen: new Date(t.lastSeen) })),
    lastUpdated: new Date(data.lastUpdated),
  };
}

// Storage: in-memory cache backed by Firestore, read back at session start (reload-before-save.ts)
const momentumProfiles = new Map<string, MomentumProfile>();
const loadedUsers = new Set<string>();
/** MINOR_CARE (purgeHeldUser): forget one user. */
export function forgetMomentumUser(userId: string): void {
  for (const m of [momentumProfiles, loadedUsers]) m.delete(userId);
  persistence?.clearCache(userId); // its unflushed copy too, or the next read brings it back
}

let persistence: PersistenceStore<PersistedMomentumProfile> | null = null;

function getPersistence(): PersistenceStore<PersistedMomentumProfile> {
  if (!persistence) {
    persistence = createPersistenceStore<PersistedMomentumProfile>({
      collection: 'celebration_momentum',
      documentId: 'profile',
      syncIntervalMs: 3000,
    });
  }
  return persistence;
}

/** Read a user's stored profile back (once). Rejects on a failed read: they stay unwritable. */
export async function loadMomentumUser(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;
  try {
    const stored = await getPersistence().load(userId, { strict: 'read' });
    const data = stored && (withoutHeldWins(userId, stored) ?? stored); // MINOR_CARE
    if (data) momentumProfiles.set(userId, deserializeProfile(data));
    loadedUsers.add(userId);
    if (data !== stored) persistProfile(userId); // the stored doc, without them
    log.debug({ userId }, 'Loaded momentum profile from persistence');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load momentum profile');
    throw error;
  }
}

/**
 * MINOR_CARE: a stored profile minus the wins a purged held call recorded (held-window.ts), with
 * the counts, streaks, themes and score worked out again from the rest; null when none was.
 */
export function withoutHeldWins(
  userId: string,
  data: PersistedMomentumProfile
): PersistedMomentumProfile | null {
  const profile = deserializeProfile(data);
  const wins = withoutHeld(userId, profile.wins, (w) => w.detectedAt);
  if (wins === profile.wins) return null;
  const held = profile.wins.filter((w) => !wins.includes(w));
  const during = (at: Date) => recordedWhileHeld(userId, at);
  const day = 24 * 60 * 60 * 1000;
  profile.wins = wins;
  profile.totalWins = Math.max(wins.length, profile.totalWins - held.length);
  profile.winsThisWeek = wins.filter((w) => Date.now() - w.detectedAt.getTime() <= 7 * day).length;
  profile.winsThisMonth = wins.filter(
    (w) => Date.now() - w.detectedAt.getTime() <= 30 * day
  ).length;
  // A streak a held win started goes; one it extended loses what it added (updateStreaks)
  const started = profile.streaks.filter((s) => during(s.startDate));
  profile.streaks = profile.streaks.filter((s) => !during(s.startDate));
  for (const s of profile.streaks.filter((s) => during(s.lastWinDate))) {
    const since = wins.filter((w) => w.detectedAt >= s.startDate);
    const ofType = since.filter((w) => s.type !== 'type_specific' || w.type === s.winType);
    const added = s.type === 'type_specific' ? held.filter((w) => w.type === s.winType).length : 1;
    s.count = Math.max(1, s.count - added);
    s.lastWinDate = ofType.at(-1)?.detectedAt ?? s.startDate;
  }
  // A held win that broke the daily streak started a new one: the broken one was the latest
  if (started.some((s) => s.type === 'daily' && s.active) && !profile.streaks.some(isDaily)) {
    const broken = profile.streaks.filter((s) => s.type === 'daily').at(-1);
    if (broken) broken.active = true;
  }
  updateThemes(profile);
  calculateMomentum(profile);
  detectSpecialStates(profile);
  return serializeProfile(profile);
}
const isDaily = (s: WinStreak): boolean => s.type === 'daily' && s.active;

function persistProfile(userId: string): void {
  const profile = momentumProfiles.get(userId);
  if (profile && loadedUsers.has(userId)) {
    getPersistence().set(userId, serializeProfile(profile));
  }
}

/** Flush persistence */
export async function flushCelebrationMomentumPersistence(): Promise<void> {
  await getPersistence().flush();
  log.info('Celebration momentum persistence flushed');
}

/**
 * Shutdown celebration momentum service
 */
export async function shutdownCelebrationMomentum(): Promise<void> {
  await flushCelebrationMomentumPersistence();
  // Clear state for clean restart
  loadedUsers.clear();
  momentumProfiles.clear();
  log.info('Celebration momentum service shutdown complete');
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a new win
 */
export function recordWin(
  userId: string,
  win: Omit<TrackedWin, 'id' | 'detectedAt' | 'celebrated'>
): TrackedWin {
  const profile = getOrCreateProfile(userId);

  const trackedWin: TrackedWin = {
    ...win,
    id: `win-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    detectedAt: new Date(),
    celebrated: false,
  };

  profile.wins.push(trackedWin);
  profile.totalWins++;

  // Index to semantic memory
  indexSmallWin(userId, {
    id: trackedWin.id,
    win: trackedWin.description,
    effort: trackedWin.type,
  });

  // Update counts
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  profile.winsThisWeek = profile.wins.filter((w) => w.detectedAt >= weekAgo).length;
  profile.winsThisMonth = profile.wins.filter((w) => w.detectedAt >= monthAgo).length;

  // Update streaks
  updateStreaks(profile, trackedWin);

  // Update themes
  updateThemes(profile);

  // Calculate momentum
  calculateMomentum(profile);

  // Check for special states
  detectSpecialStates(profile);

  profile.lastUpdated = new Date();
  persistProfile(userId);

  log.info(
    {
      userId,
      winId: trackedWin.id,
      type: trackedWin.type,
      momentum: profile.momentumScore,
    },
    '🎯 Win recorded'
  );

  // Memory Lane: Capture celebration as potential memory (non-blocking)
  void (async () => {
    try {
      const { captureCelebration } = await import('../memory-lane/real-time-collector.js');
      void captureCelebration({
        userId,
        celebrationId: trackedWin.id,
        description: trackedWin.description,
        type: trackedWin.type,
      });
    } catch {
      // Memory capture is optional
    }
  })();

  return trackedWin;
}

/**
 * Update streaks based on new win
 */
function updateStreaks(profile: MomentumProfile, win: TrackedWin): void {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Daily streak
  let dailyStreak = profile.streaks.find((s) => s.type === 'daily' && s.active);

  if (dailyStreak) {
    const lastWinDay = new Date(
      dailyStreak.lastWinDate.getFullYear(),
      dailyStreak.lastWinDate.getMonth(),
      dailyStreak.lastWinDate.getDate()
    );

    const daysSinceLastWin = Math.floor(
      (today.getTime() - lastWinDay.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (daysSinceLastWin === 0) {
      // Same day, don't increment
    } else if (daysSinceLastWin === 1) {
      // Consecutive day
      dailyStreak.count++;
      dailyStreak.lastWinDate = now;
    } else {
      // Streak broken
      dailyStreak.active = false;
      // Start new streak
      dailyStreak = undefined;
    }
  }

  if (!dailyStreak) {
    profile.streaks.push({
      id: `streak-daily-${Date.now()}`,
      type: 'daily',
      count: 1,
      startDate: now,
      lastWinDate: now,
      active: true,
      celebrated: false,
    });
  }

  // Type-specific streak
  const typeStreak = profile.streaks.find(
    (s) => s.type === 'type_specific' && s.winType === win.type && s.active
  );

  if (typeStreak) {
    typeStreak.count++;
    typeStreak.lastWinDate = now;
  } else {
    // Check if there was a previous inactive streak of this type
    const prevStreak = profile.streaks.find(
      (s) => s.type === 'type_specific' && s.winType === win.type && !s.active
    );

    if (prevStreak) {
      // Start fresh
      profile.streaks.push({
        id: `streak-${win.type}-${Date.now()}`,
        type: 'type_specific',
        winType: win.type,
        count: 1,
        startDate: now,
        lastWinDate: now,
        active: true,
        celebrated: false,
      });
    } else {
      // First of this type
      profile.streaks.push({
        id: `streak-${win.type}-${Date.now()}`,
        type: 'type_specific',
        winType: win.type,
        count: 1,
        startDate: now,
        lastWinDate: now,
        active: true,
        celebrated: false,
      });
    }
  }
}

/**
 * Update win themes
 */
function updateThemes(profile: MomentumProfile): void {
  const typeCounts = new Map<WinType, number>();
  const recentWins = profile.wins.slice(-50); // Last 50 wins

  for (const win of recentWins) {
    typeCounts.set(win.type, (typeCounts.get(win.type) || 0) + 1);
  }

  const total = recentWins.length || 1;

  profile.themes = Array.from(typeCounts.entries())
    .map(([type, count]) => {
      const prevTheme = profile.themes.find((t) => t.type === type);
      const prevPercentage = prevTheme?.percentage || 0;
      const newPercentage = (count / total) * 100;

      let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      if (newPercentage > prevPercentage + 5) trend = 'increasing';
      else if (newPercentage < prevPercentage - 5) trend = 'decreasing';

      return {
        type,
        count,
        percentage: newPercentage,
        trend,
        lastSeen:
          profile.wins.filter((w) => w.type === type).slice(-1)[0]?.detectedAt || new Date(),
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate momentum score
 */
function calculateMomentum(profile: MomentumProfile): void {
  const now = Date.now();

  // Recent wins with decay
  let score = 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  for (const win of profile.wins) {
    const age = now - win.detectedAt.getTime();
    const decayFactor = Math.max(0, 1 - age / (4 * weekMs)); // Full decay over 4 weeks
    const typeWeight = MOMENTUM_WEIGHTS[win.type] || 1;
    const difficultyBonus = win.difficulty === 'hard' ? 1.3 : win.difficulty === 'medium' ? 1.1 : 1;

    score += 5 * typeWeight * difficultyBonus * decayFactor;
  }

  // Streak bonuses
  for (const streak of profile.streaks) {
    if (streak.active && streak.count >= 3) {
      score += streak.count * 2;
    }
  }

  // Cap at 100
  profile.momentumScore = Math.min(100, Math.round(score));

  // Determine trend
  // Would compare to previous score in production
  if (profile.winsThisWeek > 3) {
    profile.momentumTrend = 'building';
  } else if (profile.winsThisWeek === 0) {
    profile.momentumTrend = 'declining';
  } else {
    profile.momentumTrend = 'stable';
  }
}

/**
 * Detect special states
 */
function detectSpecialStates(profile: MomentumProfile): void {
  // Comeback detection - wins after period of none
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  const recentWins = profile.wins.filter((w) => w.detectedAt >= twoWeeksAgo).length;
  const priorWins = profile.wins.filter(
    (w) => w.detectedAt >= threeWeeksAgo && w.detectedAt < twoWeeksAgo
  ).length;

  profile.comebackDetected = priorWins === 0 && recentWins >= 2;

  // Breakthrough - multiple wins of a difficult type
  const hardWinsRecent = profile.wins.filter(
    (w) => w.detectedAt >= twoWeeksAgo && w.difficulty === 'hard'
  ).length;

  profile.breakthroughMoment = hardWinsRecent >= 3;
}

/**
 * Get or create profile
 */
function getOrCreateProfile(userId: string): MomentumProfile {
  let profile = momentumProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      wins: [],
      streaks: [],
      themes: [],
      momentumScore: 0,
      momentumTrend: 'stable',
      consistencyScore: 0,
      totalWins: 0,
      winsThisWeek: 0,
      winsThisMonth: 0,
      comebackDetected: false,
      breakthroughMoment: false,
      lastUpdated: new Date(),
    };
    momentumProfiles.set(userId, profile);
  }

  return profile;
}

// ============================================================================
// CELEBRATION GENERATION
// ============================================================================

/**
 * Generate celebration suggestions
 */
export function generateCelebrations(userId: string): CelebrationSuggestion[] {
  const profile = momentumProfiles.get(userId);
  if (!profile) return [];

  const suggestions: CelebrationSuggestion[] = [];

  // Streak milestones
  for (const streak of profile.streaks) {
    if (streak.active && !streak.celebrated) {
      for (const milestone of STREAK_MILESTONES) {
        if (streak.count === milestone) {
          suggestions.push({
            type: 'streak',
            message: getStreakMessage(streak),
            intensity: milestone >= 7 ? 'enthusiastic' : 'warm',
            ssml: generateSSML(getStreakMessage(streak), 'excited'),
          });
          break;
        }
      }
    }
  }

  // Momentum celebration
  if (profile.momentumScore >= 70 && profile.momentumTrend === 'building') {
    suggestions.push({
      type: 'momentum',
      message: "You're really building something here. I can feel the momentum.",
      intensity: 'warm',
      ssml: generateSSML("You're really building something here. I can feel the momentum.", 'warm'),
    });
  }

  // Comeback celebration
  if (profile.comebackDetected) {
    suggestions.push({
      type: 'comeback',
      message: "I've noticed you're back at it. That takes real strength.",
      intensity: 'warm',
      ssml: generateSSML("I've noticed you're back at it. That takes real strength.", 'caring'),
    });
  }

  // Breakthrough celebration
  if (profile.breakthroughMoment) {
    suggestions.push({
      type: 'breakthrough',
      message: "Something's shifting. You're tackling the hard stuff now.",
      intensity: 'enthusiastic',
      ssml: generateSSML("Something's shifting. You're tackling the hard stuff now.", 'excited'),
    });
  }

  // Theme celebration
  const topTheme = profile.themes[0];
  if (topTheme && topTheme.count >= 5 && topTheme.trend === 'increasing') {
    suggestions.push({
      type: 'theme',
      message: getThemeMessage(topTheme.type, topTheme.count),
      intensity: 'warm',
      ssml: generateSSML(getThemeMessage(topTheme.type, topTheme.count), 'warm'),
    });
  }

  return suggestions;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get momentum profile
 */
export function getMomentumProfile(userId: string): MomentumProfile | null {
  return momentumProfiles.get(userId) || null;
}

/**
 * Get active streaks
 */
export function getActiveStreaks(userId: string): WinStreak[] {
  const profile = momentumProfiles.get(userId);
  if (!profile) return [];

  return profile.streaks.filter((s) => s.active);
}

/**
 * Get momentum summary for context
 */
export function getMomentumSummary(userId: string): string | null {
  const profile = momentumProfiles.get(userId);
  if (!profile || profile.totalWins === 0) return null;

  const parts: string[] = [];

  // Momentum state
  if (profile.momentumScore >= 70) {
    parts.push(`Strong momentum (${profile.momentumScore}%)`);
  } else if (profile.momentumScore >= 40) {
    parts.push(`Building momentum (${profile.momentumScore}%)`);
  }

  // Active streaks
  const activeStreaks = profile.streaks.filter((s) => s.active && s.count >= 3);
  if (activeStreaks.length > 0) {
    const best = activeStreaks.sort((a, b) => b.count - a.count)[0];
    parts.push(`${best.count}-win streak`);
  }

  // Special states
  if (profile.comebackDetected) {
    parts.push('comeback mode');
  }
  if (profile.breakthroughMoment) {
    parts.push('breakthrough period');
  }

  // Top theme
  if (profile.themes.length > 0 && profile.themes[0].trend === 'increasing') {
    parts.push(`focus: ${formatWinType(profile.themes[0].type)}`);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
}

/**
 * Mark celebration as shown
 */
export function markCelebrationShown(userId: string, streakId?: string): void {
  const profile = momentumProfiles.get(userId);
  if (!profile) return;

  if (streakId) {
    const streak = profile.streaks.find((s) => s.id === streakId);
    if (streak) streak.celebrated = true;
  }

  // Reset special states after celebrating
  profile.comebackDetected = false;
  profile.breakthroughMoment = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordWin,
  getMomentumProfile,
  getActiveStreaks,
  generateCelebrations,
  getMomentumSummary,
  markCelebrationShown,
};
