/**
 * 🎯 Daily Music Challenges
 *
 * Daily challenges to keep users engaged:
 * - Speed rounds
 * - Theme days (genre, decade, mood)
 * - Wildcards
 * - Social challenges
 *
 * @module DailyChallenges
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { DailyChallenge, DailyChallengeType, UserDailyChallengeProgress } from './types.js';

const log = createLogger({ module: 'DailyChallenges' });

// ============================================================================
// CHALLENGE TEMPLATES
// ============================================================================

interface ChallengeTemplate {
  type: DailyChallengeType;
  title: string;
  description: string;
  instructions: string;
  gameType: string;
  targetScore?: number;
  timeLimit?: number;
  xpReward: number;
  streakBonus: boolean;
  specialReward?: string;
}

const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  // Speed Rounds
  {
    type: 'speed-round',
    title: 'Lightning Round',
    description: 'How fast can you recognize these tracks?',
    instructions: 'Guess each song as quickly as possible. Bonus points for speed!',
    gameType: 'name-that-tune',
    targetScore: 80,
    timeLimit: 180,
    xpReward: 50,
    streakBonus: true,
  },
  {
    type: 'speed-round',
    title: 'Quick Ears Challenge',
    description: 'Test your musical reflexes!',
    instructions: '5 songs, 30 seconds each. How many can you get?',
    gameType: 'name-that-tune',
    targetScore: 60,
    timeLimit: 150,
    xpReward: 40,
    streakBonus: true,
  },

  // Theme Days - Genres
  {
    type: 'theme-day',
    title: 'Rock Revolution',
    description: 'Today is all about rock music!',
    instructions: 'All songs from the rock genre. Show us what you know!',
    gameType: 'name-that-tune',
    xpReward: 45,
    streakBonus: true,
  },
  {
    type: 'theme-day',
    title: 'Hip-Hop Heaven',
    description: 'Get in the groove with hip-hop hits',
    instructions: 'From classic to modern hip-hop. Drop some knowledge!',
    gameType: 'name-that-tune',
    xpReward: 45,
    streakBonus: true,
  },
  {
    type: 'theme-day',
    title: 'Pop Perfection',
    description: 'The catchiest hits of all time',
    instructions: "Pop anthems across the decades. Let's see those skills!",
    gameType: 'name-that-tune',
    xpReward: 45,
    streakBonus: true,
  },

  // Theme Days - Decades
  {
    type: 'throwback',
    title: '80s Flashback',
    description: 'Travel back to the 1980s!',
    instructions: 'Synthesizers, big hair, and bigger hits. Can you name them?',
    gameType: 'name-that-tune',
    xpReward: 50,
    streakBonus: true,
  },
  {
    type: 'throwback',
    title: '90s Nostalgia',
    description: 'Relive the golden era of the 90s',
    instructions: 'From grunge to boy bands—the 90s had it all!',
    gameType: 'name-that-tune',
    xpReward: 50,
    streakBonus: true,
  },
  {
    type: 'throwback',
    title: '2000s Rewind',
    description: 'Y2K vibes and early millennium hits',
    instructions: 'The songs that defined the new millennium.',
    gameType: 'name-that-tune',
    xpReward: 50,
    streakBonus: true,
  },

  // Wildcards
  {
    type: 'wildcard',
    title: 'Genre Roulette',
    description: 'Expect the unexpected!',
    instructions: 'Random genres, random decades. True musical versatility test!',
    gameType: 'name-that-tune',
    xpReward: 60,
    streakBonus: true,
  },
  {
    type: 'wildcard',
    title: 'One-Hit Wonders',
    description: 'Remember these artists?',
    instructions: 'Songs by artists famous for just one big hit. Tricky!',
    gameType: 'name-that-tune',
    xpReward: 55,
    streakBonus: true,
  },

  // Mood Match
  {
    type: 'mood-match',
    title: 'Feel-Good Friday',
    description: 'Happy, upbeat songs to lift your spirits',
    instructions: 'Match songs to their mood. Pure musical joy!',
    gameType: 'mood-dj',
    xpReward: 45,
    streakBonus: true,
  },
  {
    type: 'mood-match',
    title: 'Chill Vibes',
    description: 'Relaxing tracks for a calm mind',
    instructions: 'The most soothing songs. Perfect for unwinding.',
    gameType: 'mood-dj',
    xpReward: 45,
    streakBonus: true,
  },

  // Social Challenges
  {
    type: 'social-challenge',
    title: 'Challenge a Friend',
    description: "Beat a friend's score to earn bonus XP!",
    instructions: 'Complete the daily challenge, then send it to a friend. Winner gets bonus XP!',
    gameType: 'name-that-tune',
    xpReward: 75,
    streakBonus: true,
    specialReward: 'Friend Challenge Badge',
  },

  // Desert Island
  {
    type: 'reflection',
    title: 'Desert Island Picks',
    description: 'If you could only take 5 songs...',
    instructions: 'Curate your ultimate 5-song playlist. Share your soul!',
    gameType: 'desert-island',
    xpReward: 40,
    streakBonus: false,
  },
];

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

// Cache for today's challenge
let todayChallenge: DailyChallenge | null = null;
let todayChallengeDate: string | null = null;

// User progress
const userProgress = new Map<string, Map<string, UserDailyChallengeProgress>>();

// ============================================================================
// DAILY CHALLENGE GENERATION
// ============================================================================

/**
 * Get today's daily challenge
 */
export function getDailyChallenge(date?: Date): DailyChallenge {
  const targetDate = date || new Date();
  const dateStr = formatDate(targetDate);

  // Return cached if same day
  if (todayChallengeDate === dateStr && todayChallenge) {
    return todayChallenge;
  }

  // Generate new challenge based on day
  const template = selectChallengeTemplate(targetDate);

  todayChallenge = {
    id: `daily-${dateStr}`,
    date: dateStr,
    area: 'musical',
    type: template.type,
    title: template.title,
    description: template.description,
    instructions: template.instructions,
    gameType: template.gameType,
    targetScore: template.targetScore,
    timeLimit: template.timeLimit,
    xpReward: template.xpReward,
    streakBonus: template.streakBonus,
    specialReward: template.specialReward,
    participantCount: Math.floor(Math.random() * 500) + 100, // Simulated
    completionRate: 0.45 + Math.random() * 0.3, // Simulated 45-75%
  };

  todayChallengeDate = dateStr;

  log.info({ challengeId: todayChallenge.id, type: template.type }, 'Generated daily challenge');

  return todayChallenge;
}

/**
 * Get the upcoming week's challenges (for preview)
 */
export function getUpcomingChallenges(startDate?: Date, days = 7): DailyChallenge[] {
  const challenges: DailyChallenge[] = [];
  const start = startDate || new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    challenges.push(getDailyChallenge(date));
  }

  return challenges;
}

/**
 * Select a challenge template based on the day
 * Uses a deterministic algorithm so all users see the same challenge
 */
function selectChallengeTemplate(date: Date): ChallengeTemplate {
  // Day of week special challenges
  const dayOfWeek = date.getDay();

  // Friday = Feel-Good Friday
  if (dayOfWeek === 5) {
    const feelGood = CHALLENGE_TEMPLATES.find((t) => t.title === 'Feel-Good Friday');
    if (feelGood) return feelGood;
  }

  // Sunday = Reflection day (Desert Island)
  if (dayOfWeek === 0) {
    const reflection = CHALLENGE_TEMPLATES.find((t) => t.type === 'reflection');
    if (reflection) return reflection;
  }

  // Use date hash to select deterministically
  const dateStr = formatDate(date);
  const hash = hashCode(dateStr);
  const nonReflectionTemplates = CHALLENGE_TEMPLATES.filter((t) => t.type !== 'reflection');
  const index = Math.abs(hash) % nonReflectionTemplates.length;

  return nonReflectionTemplates[index];
}

// ============================================================================
// USER PROGRESS
// ============================================================================

/**
 * Get user's progress on a challenge
 */
export function getUserChallengeProgress(
  userId: string,
  challengeId: string
): UserDailyChallengeProgress | null {
  const userChallenges = userProgress.get(userId);
  if (!userChallenges) return null;
  return userChallenges.get(challengeId) || null;
}

/**
 * Start a daily challenge
 */
export function startDailyChallenge(
  userId: string,
  challengeId: string
): UserDailyChallengeProgress {
  let userChallenges = userProgress.get(userId);
  if (!userChallenges) {
    userChallenges = new Map();
    userProgress.set(userId, userChallenges);
  }

  const existing = userChallenges.get(challengeId);
  if (existing) {
    return existing;
  }

  const progress: UserDailyChallengeProgress = {
    challengeId,
    userId,
    status: 'in-progress',
    xpEarned: 0,
  };

  userChallenges.set(challengeId, progress);

  log.info({ userId, challengeId }, 'Started daily challenge');

  return progress;
}

/**
 * Complete a daily challenge
 */
export function completeDailyChallenge(
  userId: string,
  challengeId: string,
  score: number
): UserDailyChallengeProgress {
  const challenge = getDailyChallengeById(challengeId);
  let userChallenges = userProgress.get(userId);

  if (!userChallenges) {
    userChallenges = new Map();
    userProgress.set(userId, userChallenges);
  }

  // Calculate XP
  let xpEarned = challenge?.xpReward || 30;

  // Bonus for target score
  if (challenge?.targetScore && score >= challenge.targetScore) {
    xpEarned = Math.round(xpEarned * 1.5);
  }

  // Check for streak bonus
  if (challenge?.streakBonus) {
    const streak = calculateUserStreak(userId);
    if (streak > 0) {
      xpEarned += streak * 5; // 5 XP per streak day
    }
  }

  const progress: UserDailyChallengeProgress = {
    challengeId,
    userId,
    status: score >= (challenge?.targetScore || 50) ? 'completed' : 'failed',
    score,
    completedAt: new Date(),
    xpEarned,
  };

  userChallenges.set(challengeId, progress);

  log.info(
    { userId, challengeId, score, xpEarned, status: progress.status },
    'Completed daily challenge'
  );

  return progress;
}

/**
 * Get user's daily challenge streak
 */
export function calculateUserStreak(userId: string): number {
  const userChallenges = userProgress.get(userId);
  if (!userChallenges) return 0;

  let streak = 0;
  const today = new Date();

  for (let i = 1; i <= 30; i++) {
    // Check last 30 days
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const challengeId = `daily-${formatDate(checkDate)}`;

    const progress = userChallenges.get(challengeId);
    if (progress?.status === 'completed') {
      streak++;
    } else {
      break; // Streak broken
    }
  }

  return streak;
}

/**
 * Get user's daily challenge stats
 */
export function getUserChallengeStats(userId: string): {
  totalCompleted: number;
  currentStreak: number;
  bestStreak: number;
  totalXpEarned: number;
  completionRate: number;
} {
  const userChallenges = userProgress.get(userId);

  if (!userChallenges) {
    return {
      totalCompleted: 0,
      currentStreak: 0,
      bestStreak: 0,
      totalXpEarned: 0,
      completionRate: 0,
    };
  }

  const challenges = Array.from(userChallenges.values());
  const completed = challenges.filter((c) => c.status === 'completed');

  return {
    totalCompleted: completed.length,
    currentStreak: calculateUserStreak(userId),
    bestStreak: calculateUserStreak(userId), // Would need historical tracking
    totalXpEarned: challenges.reduce((sum, c) => sum + c.xpEarned, 0),
    completionRate: challenges.length > 0 ? completed.length / challenges.length : 0,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getDailyChallengeById(challengeId: string): DailyChallenge | null {
  // Parse date from ID
  const match = challengeId.match(/daily-(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const [year, month, day] = match[1].split('-').map(Number);
    return getDailyChallenge(new Date(year, month - 1, day));
  }
  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getDailyChallenge,
  getUpcomingChallenges,
  getUserChallengeProgress,
  startDailyChallenge,
  completeDailyChallenge,
  calculateUserStreak,
  getUserChallengeStats,
};
