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
 * @module CelebrationMomentum
 */

import { createLogger } from '../../utils/safe-logger.js';

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
// IN-MEMORY STORAGE
// ============================================================================

const momentumProfiles = new Map<string, MomentumProfile>();

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
  
  // Update counts
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  profile.winsThisWeek = profile.wins.filter(w => w.detectedAt >= weekAgo).length;
  profile.winsThisMonth = profile.wins.filter(w => w.detectedAt >= monthAgo).length;
  
  // Update streaks
  updateStreaks(profile, trackedWin);
  
  // Update themes
  updateThemes(profile);
  
  // Calculate momentum
  calculateMomentum(profile);
  
  // Check for special states
  detectSpecialStates(profile);
  
  profile.lastUpdated = new Date();
  
  log.info({
    userId,
    winId: trackedWin.id,
    type: trackedWin.type,
    momentum: profile.momentumScore,
  }, '🎯 Win recorded');
  
  return trackedWin;
}

/**
 * Update streaks based on new win
 */
function updateStreaks(profile: MomentumProfile, win: TrackedWin): void {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Daily streak
  let dailyStreak = profile.streaks.find(
    s => s.type === 'daily' && s.active
  );
  
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
  let typeStreak = profile.streaks.find(
    s => s.type === 'type_specific' && s.winType === win.type && s.active
  );
  
  if (typeStreak) {
    typeStreak.count++;
    typeStreak.lastWinDate = now;
  } else {
    // Check if there was a previous inactive streak of this type
    const prevStreak = profile.streaks.find(
      s => s.type === 'type_specific' && s.winType === win.type && !s.active
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
  
  profile.themes = Array.from(typeCounts.entries()).map(([type, count]) => {
    const prevTheme = profile.themes.find(t => t.type === type);
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
      lastSeen: profile.wins.filter(w => w.type === type).slice(-1)[0]?.detectedAt || new Date(),
    };
  }).sort((a, b) => b.count - a.count);
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
    const decayFactor = Math.max(0, 1 - (age / (4 * weekMs))); // Full decay over 4 weeks
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
  
  const recentWins = profile.wins.filter(w => w.detectedAt >= twoWeeksAgo).length;
  const priorWins = profile.wins.filter(
    w => w.detectedAt >= threeWeeksAgo && w.detectedAt < twoWeeksAgo
  ).length;
  
  profile.comebackDetected = priorWins === 0 && recentWins >= 2;
  
  // Breakthrough - multiple wins of a difficult type
  const hardWinsRecent = profile.wins.filter(
    w => w.detectedAt >= twoWeeksAgo && w.difficulty === 'hard'
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

/**
 * Generate streak message
 */
function getStreakMessage(streak: WinStreak): string {
  const messages: Record<number, string[]> = {
    3: [
      "Three in a row! You're on a roll.",
      "That's three! Momentum is building.",
    ],
    5: [
      "Five wins! You're really getting somewhere.",
      "A five-win streak - that's no accident.",
    ],
    7: [
      "A full week of wins! That's incredible.",
      "Seven! You're making this a habit.",
    ],
    10: [
      "Double digits! This is becoming who you are.",
      "Ten wins in a row - you should be proud.",
    ],
    14: [
      "Two weeks of wins! This is transformation.",
      "Fourteen! You're not the same person you were.",
    ],
    21: [
      "Three weeks! They say it takes 21 days to build a habit.",
      "Twenty-one. This isn't a streak anymore - it's you.",
    ],
    30: [
      "A whole month! You've changed.",
      "Thirty days. Look how far you've come.",
    ],
  };
  
  const options = messages[streak.count] || [
    `${streak.count} wins! That's remarkable.`,
  ];
  
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate theme message
 */
function getThemeMessage(type: WinType, count: number): string {
  const messages: Record<WinType, string> = {
    followed_through: `${count} times you've followed through. You're becoming someone people can count on.`,
    courage_moment: `${count} moments of courage. You're braver than you know.`,
    self_care: `${count} acts of self-care. You're learning to take care of you.`,
    boundary_held: `${count} boundaries held. You're protecting your peace.`,
    hard_conversation: `${count} hard conversations. You're not avoiding the difficult anymore.`,
    showed_up: `${count} times you showed up when it was hard. That's character.`,
    tried_new_thing: `${count} new things tried. You're expanding your world.`,
    asked_for_help: `${count} times you asked for help. That's strength, not weakness.`,
    effort_made: `${count} times you gave it your all. Effort is everything.`,
    consistency: `${count} days of consistency. You're building something real.`,
    breakthrough: `${count} breakthroughs. You're transforming.`,
  };
  
  return messages[type] || `${count} wins of this type. You're making progress.`;
}

/**
 * Generate SSML
 */
function generateSSML(text: string, mood: 'excited' | 'warm' | 'caring'): string {
  const prosody = {
    excited: { rate: '105%', pitch: '+5%' },
    warm: { rate: '95%', pitch: '-2%' },
    caring: { rate: '90%', pitch: '-3%' },
  };
  
  const p = prosody[mood];
  
  return `<speak>
    <prosody rate="${p.rate}" pitch="${p.pitch}">
      ${text}
    </prosody>
  </speak>`;
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
  
  return profile.streaks.filter(s => s.active);
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
  const activeStreaks = profile.streaks.filter(s => s.active && s.count >= 3);
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
 * Format win type for display
 */
function formatWinType(type: WinType): string {
  const labels: Record<WinType, string> = {
    followed_through: 'follow-through',
    courage_moment: 'courage',
    self_care: 'self-care',
    boundary_held: 'boundaries',
    hard_conversation: 'hard conversations',
    showed_up: 'showing up',
    tried_new_thing: 'trying new things',
    asked_for_help: 'asking for help',
    effort_made: 'effort',
    consistency: 'consistency',
    breakthrough: 'breakthroughs',
  };
  return labels[type] || type;
}

/**
 * Mark celebration as shown
 */
export function markCelebrationShown(
  userId: string,
  streakId?: string
): void {
  const profile = momentumProfiles.get(userId);
  if (!profile) return;
  
  if (streakId) {
    const streak = profile.streaks.find(s => s.id === streakId);
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

