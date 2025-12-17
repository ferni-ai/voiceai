/**
 * 🎯 Daily Challenge System
 *
 * Push notification-driven daily engagement with Musical You and Creative You.
 * Each day has a themed challenge designed to keep users coming back.
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Challenges adapt based on user's Musical DNA
 * - Streak bonuses encourage consistency
 * - Social challenges on weekends
 * - Personalized difficulty based on performance
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type ChallengeArea = 'musical' | 'creative' | 'both';

export type ChallengeType =
  // Musical challenges
  | 'speed-round' // Quick Name That Tune
  | 'theme-day' // Songs with specific theme
  | 'wildcard-game' // Random game type
  | 'throwback' // Songs from their birth year/decade
  | 'mood-match' // Find the perfect song for a mood
  | 'decade-dash' // Quick decade guessing
  | 'lyric-lightning' // Fast lyric completion
  // Creative challenges
  | 'watch-discuss' // Watch a video and discuss
  | 'podcast-challenge' // Listen to a podcast clip
  | 'learning-sprint' // Quick learning module
  | 'idea-remix' // Creative combination game
  // Combined
  | 'reflection' // Sunday reflection on the week
  | 'social-share' // Share your progress
  | 'streak-protector'; // Any activity counts

export interface DailyChallenge {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  area: ChallengeArea;
  type: ChallengeType;
  title: string;
  description: string;
  emoji: string;
  duration: number; // estimated minutes
  xpReward: number;
  streakBonus: number;
  difficulty: 'easy' | 'medium' | 'hard';
  gameType?: string; // For game-based challenges
  theme?: string; // For theme-based challenges
  expiresAt: string; // ISO datetime
}

export interface ChallengeProgress {
  challengeId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  score: number;
  xpEarned: number;
  wasStreakProtected: boolean;
}

export interface UserChallengeStats {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  totalChallengesCompleted: number;
  totalXpEarned: number;
  lastCompletedDate?: string;
  completionsByType: Record<ChallengeType, number>;
  favoriteArea: ChallengeArea;
}

// ============================================================================
// CHALLENGE SCHEDULE
// ============================================================================

const WEEKLY_SCHEDULE: Record<
  number,
  {
    area: ChallengeArea;
    type: ChallengeType;
    title: string;
    description: string;
    emoji: string;
    difficulty: 'easy' | 'medium' | 'hard';
    duration: number;
  }
> = {
  0: {
    // Sunday
    area: 'both',
    type: 'reflection',
    title: 'Sunday Reflection',
    description: 'Share the song that defined your week',
    emoji: '🌅',
    difficulty: 'easy',
    duration: 5,
  },
  1: {
    // Monday
    area: 'musical',
    type: 'speed-round',
    title: 'Monday Speed Round',
    description: 'Name 5 songs in 60 seconds!',
    emoji: '⚡',
    difficulty: 'medium',
    duration: 3,
  },
  2: {
    // Tuesday
    area: 'musical',
    type: 'theme-day',
    title: 'Theme Tuesday',
    description: 'Songs with colors in the title',
    emoji: '🎨',
    difficulty: 'medium',
    duration: 5,
  },
  3: {
    // Wednesday
    area: 'musical',
    type: 'wildcard-game',
    title: 'Wildcard Wednesday',
    description: 'Random game type - surprise!',
    emoji: '🃏',
    difficulty: 'medium',
    duration: 5,
  },
  4: {
    // Thursday
    area: 'musical',
    type: 'throwback',
    title: 'Throwback Thursday',
    description: 'Songs from your birth decade',
    emoji: '📼',
    difficulty: 'easy',
    duration: 5,
  },
  5: {
    // Friday
    area: 'musical',
    type: 'mood-match',
    title: 'Friday Vibes',
    description: 'Create the perfect Friday night playlist mood',
    emoji: '🎉',
    difficulty: 'easy',
    duration: 3,
  },
  6: {
    // Saturday
    area: 'both',
    type: 'social-share',
    title: 'Social Saturday',
    description: 'Share your Musical DNA with a friend',
    emoji: '📱',
    difficulty: 'easy',
    duration: 2,
  },
};

// Theme variations for Theme Tuesday
const THEME_VARIATIONS = [
  { theme: 'colors', description: 'Songs with colors in the title' },
  { theme: 'numbers', description: 'Songs with numbers in the title' },
  { theme: 'weather', description: 'Songs about weather or seasons' },
  { theme: 'places', description: 'Songs with city or country names' },
  { theme: 'love', description: 'Love songs (classic theme!)' },
  { theme: 'night', description: 'Songs about night or darkness' },
  { theme: 'dance', description: 'Songs with dance or movement' },
  { theme: 'questions', description: 'Songs that are questions' },
];

// Wildcard game variations
const WILDCARD_GAMES = [
  'name-that-tune',
  'finish-the-lyric',
  'decade-challenge',
  'this-or-that',
  'mood-dj-challenge',
];

// ============================================================================
// CHALLENGE GENERATION
// ============================================================================

/**
 * Get today's challenge
 */
export function getTodaysChallenge(
  userId: string,
  userStats?: UserChallengeStats
): DailyChallenge {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dateStr = today.toISOString().split('T')[0];

  const schedule = WEEKLY_SCHEDULE[dayOfWeek];

  // Add variations based on the week number for variety
  const weekNumber = getWeekNumber(today);
  let finalType = schedule.type;
  let finalDescription = schedule.description;
  let gameType: string | undefined;
  let theme: string | undefined;

  // Handle special variations
  if (schedule.type === 'theme-day') {
    const themeIndex = weekNumber % THEME_VARIATIONS.length;
    const themeVariation = THEME_VARIATIONS[themeIndex];
    theme = themeVariation.theme;
    finalDescription = themeVariation.description;
  }

  if (schedule.type === 'wildcard-game') {
    const gameIndex = weekNumber % WILDCARD_GAMES.length;
    gameType = WILDCARD_GAMES[gameIndex];
    finalDescription = `Today's game: ${formatGameName(gameType)}`;
  }

  // Calculate rewards based on streak
  const streakMultiplier = userStats ? Math.min(2, 1 + userStats.currentStreak * 0.1) : 1;
  const baseXp = schedule.difficulty === 'hard' ? 100 : schedule.difficulty === 'medium' ? 75 : 50;

  const challenge: DailyChallenge = {
    id: `challenge_${dateStr}_${userId}`,
    date: dateStr,
    area: schedule.area,
    type: finalType,
    title: schedule.title,
    description: finalDescription,
    emoji: schedule.emoji,
    duration: schedule.duration,
    xpReward: Math.round(baseXp * streakMultiplier),
    streakBonus: userStats?.currentStreak ? userStats.currentStreak * 10 : 0,
    difficulty: schedule.difficulty,
    gameType,
    theme,
    expiresAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString(),
  };

  log.debug({ challenge }, '🎯 Generated today\'s challenge');
  return challenge;
}

/**
 * Get upcoming challenges for the week
 */
export function getUpcomingChallenges(
  userId: string,
  days: number = 7
): DailyChallenge[] {
  const challenges: DailyChallenge[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];
    const schedule = WEEKLY_SCHEDULE[dayOfWeek];

    challenges.push({
      id: `challenge_${dateStr}_${userId}`,
      date: dateStr,
      area: schedule.area,
      type: schedule.type,
      title: schedule.title,
      description: schedule.description,
      emoji: schedule.emoji,
      duration: schedule.duration,
      xpReward: schedule.difficulty === 'hard' ? 100 : schedule.difficulty === 'medium' ? 75 : 50,
      streakBonus: 0,
      difficulty: schedule.difficulty,
      expiresAt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString(),
    });
  }

  return challenges;
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

// In-memory store (would be Firestore in production)
const progressStore = new Map<string, ChallengeProgress[]>();
const statsStore = new Map<string, UserChallengeStats>();

/**
 * Start a challenge
 */
export function startChallenge(
  userId: string,
  challengeId: string
): ChallengeProgress {
  const progress: ChallengeProgress = {
    challengeId,
    userId,
    startedAt: new Date().toISOString(),
    score: 0,
    xpEarned: 0,
    wasStreakProtected: false,
  };

  const userProgress = progressStore.get(userId) || [];
  userProgress.push(progress);
  progressStore.set(userId, userProgress);

  log.info({ userId, challengeId }, '🎯 Challenge started');
  return progress;
}

/**
 * Complete a challenge
 */
export function completeChallenge(
  userId: string,
  challengeId: string,
  score: number,
  challenge: DailyChallenge
): ChallengeProgress {
  const userProgress = progressStore.get(userId) || [];
  const progressIndex = userProgress.findIndex(
    (p) => p.challengeId === challengeId && !p.completedAt
  );

  if (progressIndex === -1) {
    // Start and complete in one go
    const newProgress: ChallengeProgress = {
      challengeId,
      userId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      score,
      xpEarned: challenge.xpReward + challenge.streakBonus,
      wasStreakProtected: false,
    };
    userProgress.push(newProgress);
    progressStore.set(userId, userProgress);
    updateStats(userId, newProgress, challenge);
    return newProgress;
  }

  const progress = userProgress[progressIndex];
  progress.completedAt = new Date().toISOString();
  progress.score = score;
  progress.xpEarned = challenge.xpReward + challenge.streakBonus;

  progressStore.set(userId, userProgress);
  updateStats(userId, progress, challenge);

  log.info({ userId, challengeId, score, xpEarned: progress.xpEarned }, '🎯 Challenge completed');
  return progress;
}

/**
 * Update user stats after completing a challenge
 */
function updateStats(
  userId: string,
  progress: ChallengeProgress,
  challenge: DailyChallenge
): void {
  const stats = statsStore.get(userId) || createInitialStats(userId);
  const today = new Date().toISOString().split('T')[0];

  // Check if streak continues
  if (stats.lastCompletedDate) {
    const lastDate = new Date(stats.lastCompletedDate);
    const diffDays = Math.floor(
      (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      // Consecutive day - streak continues
      stats.currentStreak++;
    } else if (diffDays > 1) {
      // Streak broken
      stats.currentStreak = 1;
    }
    // Same day - streak stays the same
  } else {
    stats.currentStreak = 1;
  }

  stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  stats.totalChallengesCompleted++;
  stats.totalXpEarned += progress.xpEarned;
  stats.lastCompletedDate = today;
  stats.completionsByType[challenge.type] =
    (stats.completionsByType[challenge.type] || 0) + 1;

  // Determine favorite area
  const musicalCount = Object.entries(stats.completionsByType)
    .filter(([type]) => isMusicalChallenge(type as ChallengeType))
    .reduce((sum, [, count]) => sum + count, 0);
  const creativeCount = stats.totalChallengesCompleted - musicalCount;

  stats.favoriteArea = musicalCount >= creativeCount ? 'musical' : 'creative';

  statsStore.set(userId, stats);
  log.debug({ userId, stats }, '🎯 Updated challenge stats');
}

/**
 * Get user's challenge stats
 */
export function getChallengeStats(userId: string): UserChallengeStats {
  return statsStore.get(userId) || createInitialStats(userId);
}

/**
 * Check if user has completed today's challenge
 */
export function hasCompletedTodaysChallenge(userId: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const userProgress = progressStore.get(userId) || [];

  return userProgress.some(
    (p) =>
      p.challengeId.includes(today) && p.completedAt !== undefined
  );
}

/**
 * Get user's challenge history
 */
export function getChallengeHistory(
  userId: string,
  limit: number = 30
): ChallengeProgress[] {
  const userProgress = progressStore.get(userId) || [];
  return userProgress
    .filter((p) => p.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, limit);
}

// ============================================================================
// STREAK MANAGEMENT
// ============================================================================

/**
 * Check if streak is at risk (not completed today and it's getting late)
 */
export function isStreakAtRisk(userId: string): {
  atRisk: boolean;
  hoursRemaining: number;
  currentStreak: number;
} {
  const stats = getChallengeStats(userId);
  const hasCompleted = hasCompletedTodaysChallenge(userId);
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const hoursRemaining = (endOfDay.getTime() - now.getTime()) / (1000 * 60 * 60);

  return {
    atRisk: !hasCompleted && stats.currentStreak > 0 && hoursRemaining < 4,
    hoursRemaining: Math.round(hoursRemaining),
    currentStreak: stats.currentStreak,
  };
}

/**
 * Use a streak freeze (protects streak for one day)
 */
export function useStreakFreeze(userId: string): boolean {
  // In production, this would check if user has freeze available
  // and deduct it from their inventory
  const stats = getChallengeStats(userId);
  if (stats.currentStreak === 0) return false;

  // Mark today as protected
  const today = new Date().toISOString().split('T')[0];
  const progress: ChallengeProgress = {
    challengeId: `freeze_${today}_${userId}`,
    userId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    score: 0,
    xpEarned: 0,
    wasStreakProtected: true,
  };

  const userProgress = progressStore.get(userId) || [];
  userProgress.push(progress);
  progressStore.set(userId, userProgress);

  log.info({ userId, currentStreak: stats.currentStreak }, '🎯 Streak freeze used');
  return true;
}

// ============================================================================
// NOTIFICATION CONTENT
// ============================================================================

/**
 * Get notification content for today's challenge
 */
export function getChallengeNotificationContent(
  challenge: DailyChallenge,
  stats: UserChallengeStats
): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  let title = `${challenge.emoji} ${challenge.title}`;
  let body = challenge.description;

  // Add streak info
  if (stats.currentStreak > 0) {
    body += ` 🔥 ${stats.currentStreak} day streak!`;
  }

  // Add special messaging for milestones
  if (stats.currentStreak === 6) {
    title = '🔥 One more day to a week streak!';
  } else if (stats.currentStreak === 29) {
    title = '🎯 Tomorrow marks 30 days!';
  }

  return {
    title,
    body,
    data: {
      type: 'daily_challenge',
      challengeId: challenge.id,
      area: challenge.area,
    },
  };
}

/**
 * Get streak at risk notification
 */
export function getStreakAtRiskNotification(
  stats: UserChallengeStats
): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  return {
    title: `🔥 Your ${stats.currentStreak} day streak is at risk!`,
    body: 'Quick! Complete today\'s challenge before midnight.',
    data: {
      type: 'streak_at_risk',
      currentStreak: String(stats.currentStreak),
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createInitialStats(userId: string): UserChallengeStats {
  return {
    userId,
    currentStreak: 0,
    longestStreak: 0,
    totalChallengesCompleted: 0,
    totalXpEarned: 0,
    completionsByType: {} as Record<ChallengeType, number>,
    favoriteArea: 'musical',
  };
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function formatGameName(gameType: string): string {
  const names: Record<string, string> = {
    'name-that-tune': 'Name That Tune',
    'finish-the-lyric': 'Finish the Lyric',
    'decade-challenge': 'Decade Challenge',
    'this-or-that': 'This or That',
    'mood-dj-challenge': 'Mood DJ Challenge',
  };
  return names[gameType] || gameType;
}

function isMusicalChallenge(type: ChallengeType): boolean {
  const musicalTypes: ChallengeType[] = [
    'speed-round',
    'theme-day',
    'wildcard-game',
    'throwback',
    'mood-match',
    'decade-dash',
    'lyric-lightning',
  ];
  return musicalTypes.includes(type);
}

