/**
 * 🎮 Social Service Index
 *
 * Export all social/multiplayer services:
 * - Multiplayer games (challenges, taste match)
 * - Leaderboards
 */

// Multiplayer Games
export {
  createChallenge,
  acceptChallenge,
  completeChallenge,
  declineChallenge,
  getChallenge,
  getChallengeByShareCode,
  getPendingChallenges,
  getChallengeHistory,
  createTasteMatchSession,
  joinTasteMatchSession,
  setParticipantReady,
  submitTasteMatchAnswer,
  getTasteMatchSession,
  getCurrentQuestion,
  type ChallengeType,
  type ChallengeStatus,
  type Challenge,
  type TasteMatchSession,
  type TasteMatchParticipant,
  type TasteMatchQuestion,
  type TasteMatchAnswer,
  type TasteMatchInsight,
  type TasteCompatibility,
} from './multiplayer-games.js';

// Leaderboards
export {
  getUserStats,
  updateUserStats,
  recordChallengeResult,
  getLeaderboard,
  getUserRank,
  getLeaderboardAroundUser,
  calculateLevel,
  getXPForNextLevel,
  seedLeaderboardData,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type LeaderboardEntry,
  type Leaderboard,
  type UserStats,
  type GameStats,
} from './leaderboards.js';

