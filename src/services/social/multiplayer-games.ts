/**
 * 🎮 Multiplayer Games Service
 *
 * Head-to-head challenges, taste matching, and social gaming features.
 *
 * Games:
 * - Taste Match: Compare musical preferences with friends
 * - Score Challenge: Beat a friend's game score
 * - Speed Challenge: Faster guess wins
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Smart matching based on musical DNA
 * - Discussion prompts based on differences
 * - Taste compatibility scores
 *
 * This module holds the types; challenges (./challenges.ts), Taste Match games
 * (./taste-match-sessions.ts) and their scoring (./taste-match-questions.ts)
 * live in their own modules and are re-exported here.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ChallengeType = 'score-beat' | 'speed-beat' | 'taste-match';
export type ChallengeStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'expired';

export interface Challenge {
  id: string;
  type: ChallengeType;
  gameType: string; // e.g., 'name-that-tune', 'decade-challenge'

  // Challenger (initiator)
  challengerId: string;
  challengerName: string;
  challengerScore?: number;
  challengerTimeMs?: number;

  // Challengee (recipient)
  challengeeId: string;
  challengeeName?: string;
  challengeeScore?: number;
  challengeeTimeMs?: number;

  // Status
  status: ChallengeStatus;
  winnerId?: string;
  tieBreaker?: 'time' | 'accuracy';

  // Metadata
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;

  // For share/invite
  shareCode?: string;

  // Who accepted, completed or declined it (the challengee, or an admin for them)
  acceptedBy?: string;
  completedBy?: string;
  declinedBy?: string;
}

export interface TasteMatchSession {
  id: string;
  participants: TasteMatchParticipant[];
  status: 'waiting' | 'in-progress' | 'completed';

  // Game state
  currentRound: number;
  totalRounds: number;
  questions: TasteMatchQuestion[];

  // Results
  compatibilityScore?: number;
  insights?: TasteMatchInsight[];

  createdAt: Date;
  completedAt?: Date;
}

export interface TasteMatchParticipant {
  userId: string;
  displayName: string;
  answers: TasteMatchAnswer[];
  isReady: boolean;
  joinedAt: Date;
}

export interface TasteMatchQuestion {
  id: string;
  type: 'this-or-that' | 'rate-song' | 'complete-lyric' | 'guess-decade';
  prompt: string;
  options?: string[];
  songA?: { name: string; artist: string };
  songB?: { name: string; artist: string };
  correctAnswer?: string;
}

export interface TasteMatchAnswer {
  questionId: string;
  answer: string;
  timeMs: number;
}

export interface TasteMatchInsight {
  type: 'match' | 'difference' | 'surprise';
  title: string;
  description: string;
  emoji: string;
}

export interface TasteCompatibility {
  overallScore: number; // 0-100
  genreOverlap: number;
  decadeOverlap: number;
  energyMatch: number;
  surpriseFactors: string[];
  discussionPrompts: string[];
}

// ============================================================================
// CHALLENGE MANAGEMENT
// ============================================================================

// Challenges live in ./challenges.ts (shared by every API instance); re-exported here.
export {
  createChallenge,
  acceptChallenge,
  completeChallenge,
  declineChallenge,
  getChallenge,
  getChallengeByShareCode,
  getPendingChallenges,
  getChallengeHistory,
} from './challenges.js';

// Taste Match games live in ./taste-match-sessions.ts (shared by every API instance).
export {
  createTasteMatchSession,
  joinTasteMatchSession,
  setParticipantReady,
  submitTasteMatchAnswer,
  getTasteMatchSession,
  getCurrentQuestion,
} from './taste-match-sessions.js';
