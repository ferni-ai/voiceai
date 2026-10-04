/**
 * Social games XP: rewards and levels. Pure. Moved out of leaderboards.ts.
 *
 * @module services/social/xp
 */
// ============================================================================
// XP SYSTEM
// ============================================================================

export const XP_CONFIG = {
  // Base XP rewards
  gameComplete: 10,
  correctAnswer: 5,
  perfectGame: 50,
  dailyChallenge: 25,
  winChallenge: 30,
  streak3: 20,
  streak7: 50,
  streak30: 200,

  // Multipliers
  speedBonus: 1.5, // Fast answer
  firstTryBonus: 1.2, // No hints used

  // Level thresholds
  xpPerLevel: 100,
  levelScaling: 1.2, // Each level requires 20% more XP
};

export function calculateLevel(totalXP: number): number {
  let level = 1;
  let xpNeeded = XP_CONFIG.xpPerLevel;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpNeeded) {
    xpRemaining -= xpNeeded;
    level++;
    xpNeeded = Math.floor(xpNeeded * XP_CONFIG.levelScaling);
  }

  return level;
}

export function getXPForNextLevel(totalXP: number): {
  currentXP: number;
  neededXP: number;
  progress: number;
} {
  let xpNeeded = XP_CONFIG.xpPerLevel;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpNeeded) {
    xpRemaining -= xpNeeded;
    xpNeeded = Math.floor(xpNeeded * XP_CONFIG.levelScaling);
  }

  return {
    currentXP: xpRemaining,
    neededXP: xpNeeded,
    progress: Math.round((xpRemaining / xpNeeded) * 100),
  };
}
