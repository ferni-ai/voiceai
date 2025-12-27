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
 */

import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger();

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
// TASTE MATCH QUESTIONS DATABASE
// ============================================================================

const TASTE_MATCH_QUESTIONS: TasteMatchQuestion[] = [
  // This or That
  {
    id: 'tot-1',
    type: 'this-or-that',
    prompt: 'Which would you rather have on repeat?',
    songA: { name: 'Bohemian Rhapsody', artist: 'Queen' },
    songB: { name: 'Stairway to Heaven', artist: 'Led Zeppelin' },
  },
  {
    id: 'tot-2',
    type: 'this-or-that',
    prompt: 'Road trip anthem?',
    songA: { name: "Don't Stop Believin'", artist: 'Journey' },
    songB: { name: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd' },
  },
  {
    id: 'tot-3',
    type: 'this-or-that',
    prompt: 'Getting ready to go out?',
    songA: { name: 'Uptown Funk', artist: 'Bruno Mars' },
    songB: { name: 'Single Ladies', artist: 'Beyoncé' },
  },
  {
    id: 'tot-4',
    type: 'this-or-that',
    prompt: 'Rainy day vibes?',
    songA: { name: 'The Sound of Silence', artist: 'Simon & Garfunkel' },
    songB: { name: 'Mad World', artist: 'Gary Jules' },
  },
  {
    id: 'tot-5',
    type: 'this-or-that',
    prompt: 'Workout motivation?',
    songA: { name: 'Eye of the Tiger', artist: 'Survivor' },
    songB: { name: 'Stronger', artist: 'Kanye West' },
  },

  // Rate Song (1-5)
  {
    id: 'rate-1',
    type: 'rate-song',
    prompt: 'How much do you love this classic?',
    songA: { name: 'Hotel California', artist: 'Eagles' },
    options: ['1', '2', '3', '4', '5'],
  },
  {
    id: 'rate-2',
    type: 'rate-song',
    prompt: 'Rate this pop anthem',
    songA: { name: 'Shape of You', artist: 'Ed Sheeran' },
    options: ['1', '2', '3', '4', '5'],
  },
  {
    id: 'rate-3',
    type: 'rate-song',
    prompt: 'How do you feel about this hit?',
    songA: { name: 'Smells Like Teen Spirit', artist: 'Nirvana' },
    options: ['1', '2', '3', '4', '5'],
  },

  // Guess Decade
  {
    id: 'decade-1',
    type: 'guess-decade',
    prompt: 'What decade is "Billie Jean" from?',
    options: ['1970s', '1980s', '1990s', '2000s'],
    correctAnswer: '1980s',
  },
  {
    id: 'decade-2',
    type: 'guess-decade',
    prompt: 'What decade is "Wonderwall" from?',
    options: ['1980s', '1990s', '2000s', '2010s'],
    correctAnswer: '1990s',
  },
];

// ============================================================================
// CHALLENGE MANAGEMENT
// ============================================================================

// In-memory stores (would be Firestore in production)
const challengeStore = new Map<string, Challenge>();
const tasteMatchStore = new Map<string, TasteMatchSession>();

/**
 * Create a new challenge
 */
export function createChallenge(
  type: ChallengeType,
  gameType: string,
  challengerId: string,
  challengerName: string,
  challengeeId: string,
  options?: {
    challengerScore?: number;
    challengerTimeMs?: number;
  }
): Challenge {
  const id = `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shareCode = generateShareCode();

  const challenge: Challenge = {
    id,
    type,
    gameType,
    challengerId,
    challengerName,
    challengerScore: options?.challengerScore,
    challengerTimeMs: options?.challengerTimeMs,
    challengeeId,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    shareCode,
  };

  challengeStore.set(id, challenge);
  log.info({ challengeId: id, type, gameType }, '🎮 Challenge created');

  return challenge;
}

/**
 * Accept a challenge
 */
export function acceptChallenge(
  challengeId: string,
  challengeeId: string,
  challengeeName: string
): Challenge | null {
  const challenge = challengeStore.get(challengeId);
  if (!challenge) return null;
  if (challenge.challengeeId !== challengeeId) return null;
  if (challenge.status !== 'pending') return null;

  challenge.status = 'accepted';
  challenge.challengeeName = challengeeName;
  challenge.acceptedAt = new Date();

  challengeStore.set(challengeId, challenge);
  log.info({ challengeId }, '🎮 Challenge accepted');

  return challenge;
}

/**
 * Complete a challenge (submit challengee's result)
 */
export function completeChallenge(
  challengeId: string,
  challengeeScore: number,
  challengeeTimeMs?: number
): Challenge | null {
  const challenge = challengeStore.get(challengeId);
  if (!challenge) return null;
  if (challenge.status !== 'accepted') return null;

  challenge.challengeeScore = challengeeScore;
  challenge.challengeeTimeMs = challengeeTimeMs;
  challenge.status = 'completed';
  challenge.completedAt = new Date();

  // Determine winner
  if (challenge.type === 'score-beat') {
    if (challengeeScore > (challenge.challengerScore || 0)) {
      challenge.winnerId = challenge.challengeeId;
    } else if (challengeeScore < (challenge.challengerScore || 0)) {
      challenge.winnerId = challenge.challengerId;
    } else {
      // Tie - use time as tiebreaker
      challenge.tieBreaker = 'time';
      if (challengeeTimeMs && challenge.challengerTimeMs) {
        challenge.winnerId =
          challengeeTimeMs < challenge.challengerTimeMs
            ? challenge.challengeeId
            : challenge.challengerId;
      }
    }
  } else if (challenge.type === 'speed-beat') {
    if (challengeeTimeMs && challenge.challengerTimeMs) {
      challenge.winnerId =
        challengeeTimeMs < challenge.challengerTimeMs
          ? challenge.challengeeId
          : challenge.challengerId;
    }
  }

  challengeStore.set(challengeId, challenge);
  log.info({ challengeId, winnerId: challenge.winnerId }, '🎮 Challenge completed');

  return challenge;
}

/**
 * Decline a challenge
 */
export function declineChallenge(challengeId: string, challengeeId: string): boolean {
  const challenge = challengeStore.get(challengeId);
  if (!challenge) return false;
  if (challenge.challengeeId !== challengeeId) return false;
  if (challenge.status !== 'pending') return false;

  challenge.status = 'declined';
  challengeStore.set(challengeId, challenge);

  return true;
}

/**
 * Get challenge by ID
 */
export function getChallenge(challengeId: string): Challenge | null {
  return challengeStore.get(challengeId) || null;
}

/**
 * Get challenge by share code
 */
export function getChallengeByShareCode(shareCode: string): Challenge | null {
  for (const challenge of challengeStore.values()) {
    if (challenge.shareCode === shareCode) {
      return challenge;
    }
  }
  return null;
}

/**
 * Get pending challenges for a user
 */
export function getPendingChallenges(userId: string): Challenge[] {
  const challenges: Challenge[] = [];
  for (const challenge of challengeStore.values()) {
    if (
      challenge.challengeeId === userId &&
      challenge.status === 'pending' &&
      challenge.expiresAt > new Date()
    ) {
      challenges.push(challenge);
    }
  }
  return challenges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get challenge history for a user
 */
export function getChallengeHistory(userId: string, limit: number = 20): Challenge[] {
  const challenges: Challenge[] = [];
  for (const challenge of challengeStore.values()) {
    if (challenge.challengerId === userId || challenge.challengeeId === userId) {
      challenges.push(challenge);
    }
  }
  return challenges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

// ============================================================================
// TASTE MATCH GAME
// ============================================================================

/**
 * Create a new Taste Match session
 */
export function createTasteMatchSession(
  hostUserId: string,
  hostDisplayName: string,
  rounds: number = 5
): TasteMatchSession {
  const id = `tastematch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Select random questions
  const shuffled = [...TASTE_MATCH_QUESTIONS].sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, rounds);

  const session: TasteMatchSession = {
    id,
    participants: [
      {
        userId: hostUserId,
        displayName: hostDisplayName,
        answers: [],
        isReady: false,
        joinedAt: new Date(),
      },
    ],
    status: 'waiting',
    currentRound: 0,
    totalRounds: rounds,
    questions,
    createdAt: new Date(),
  };

  tasteMatchStore.set(id, session);
  log.info({ sessionId: id, rounds }, '🎵 Taste Match session created');

  return session;
}

/**
 * Join a Taste Match session
 */
export function joinTasteMatchSession(
  sessionId: string,
  userId: string,
  displayName: string
): TasteMatchSession | null {
  const session = tasteMatchStore.get(sessionId);
  if (!session) return null;
  if (session.status !== 'waiting') return null;
  if (session.participants.length >= 2) return null;
  if (session.participants.some((p) => p.userId === userId)) return null;

  session.participants.push({
    userId,
    displayName,
    answers: [],
    isReady: false,
    joinedAt: new Date(),
  });

  tasteMatchStore.set(sessionId, session);
  log.info({ sessionId, userId }, '🎵 Joined Taste Match session');

  return session;
}

/**
 * Mark participant as ready
 */
export function setParticipantReady(sessionId: string, userId: string): TasteMatchSession | null {
  const session = tasteMatchStore.get(sessionId);
  if (!session) return null;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return null;

  participant.isReady = true;

  // Check if all participants are ready
  if (session.participants.length >= 2 && session.participants.every((p) => p.isReady)) {
    session.status = 'in-progress';
    session.currentRound = 1;
  }

  tasteMatchStore.set(sessionId, session);
  return session;
}

/**
 * Submit an answer for current round
 */
export function submitTasteMatchAnswer(
  sessionId: string,
  userId: string,
  answer: string,
  timeMs: number
): TasteMatchSession | null {
  const session = tasteMatchStore.get(sessionId);
  if (!session) return null;
  if (session.status !== 'in-progress') return null;

  const participant = session.participants.find((p) => p.userId === userId);
  if (!participant) return null;

  const currentQuestion = session.questions[session.currentRound - 1];
  if (!currentQuestion) return null;

  // Check if already answered this question
  if (participant.answers.some((a) => a.questionId === currentQuestion.id)) {
    return session;
  }

  participant.answers.push({
    questionId: currentQuestion.id,
    answer,
    timeMs,
  });

  // Check if all participants answered
  const allAnswered = session.participants.every((p) =>
    p.answers.some((a) => a.questionId === currentQuestion.id)
  );

  if (allAnswered) {
    if (session.currentRound >= session.totalRounds) {
      // Game complete
      session.status = 'completed';
      session.completedAt = new Date();
      session.compatibilityScore = calculateCompatibility(session);
      session.insights = generateTasteInsights(session);
    } else {
      // Next round
      session.currentRound++;
    }
  }

  tasteMatchStore.set(sessionId, session);
  return session;
}

/**
 * Get Taste Match session
 */
export function getTasteMatchSession(sessionId: string): TasteMatchSession | null {
  return tasteMatchStore.get(sessionId) || null;
}

/**
 * Get current question for a session
 */
export function getCurrentQuestion(sessionId: string): TasteMatchQuestion | null {
  const session = tasteMatchStore.get(sessionId);
  if (!session || session.status !== 'in-progress') return null;
  return session.questions[session.currentRound - 1] || null;
}

// ============================================================================
// COMPATIBILITY CALCULATION
// ============================================================================

function calculateCompatibility(session: TasteMatchSession): number {
  if (session.participants.length < 2) return 0;

  const p1 = session.participants[0];
  const p2 = session.participants[1];

  let matches = 0;
  let total = 0;

  for (const question of session.questions) {
    const a1 = p1.answers.find((a) => a.questionId === question.id);
    const a2 = p2.answers.find((a) => a.questionId === question.id);

    if (a1 && a2) {
      total++;
      if (question.type === 'this-or-that') {
        if (a1.answer === a2.answer) matches++;
      } else if (question.type === 'rate-song') {
        const r1 = parseInt(a1.answer);
        const r2 = parseInt(a2.answer);
        const diff = Math.abs(r1 - r2);
        matches += 1 - diff / 4; // 0-1 based on how close
      } else if (question.type === 'guess-decade') {
        if (a1.answer === a2.answer) matches++;
      }
    }
  }

  return total > 0 ? Math.round((matches / total) * 100) : 50;
}

function generateTasteInsights(session: TasteMatchSession): TasteMatchInsight[] {
  const insights: TasteMatchInsight[] = [];

  if (session.participants.length < 2) return insights;

  const p1 = session.participants[0];
  const p2 = session.participants[1];
  const score = session.compatibilityScore || 50;

  // Overall compatibility insight
  if (score >= 80) {
    insights.push({
      type: 'match',
      title: 'Musical Soulmates! 🎵',
      description: `You and ${p2.displayName} have incredibly similar taste!`,
      emoji: '💕',
    });
  } else if (score >= 60) {
    insights.push({
      type: 'match',
      title: 'Great Taste Match',
      description: `You two would make a solid road trip playlist together.`,
      emoji: '🚗',
    });
  } else if (score >= 40) {
    insights.push({
      type: 'difference',
      title: 'Interesting Differences',
      description: `You might introduce each other to something new!`,
      emoji: '🎭',
    });
  } else {
    insights.push({
      type: 'surprise',
      title: 'Opposites Attract?',
      description: `Very different tastes - but that makes sharing music more fun!`,
      emoji: '🎲',
    });
  }

  // Find specific matches/differences
  for (const question of session.questions) {
    const a1 = p1.answers.find((a) => a.questionId === question.id);
    const a2 = p2.answers.find((a) => a.questionId === question.id);

    if (a1 && a2 && question.type === 'this-or-that') {
      if (a1.answer === a2.answer) {
        const song = a1.answer === 'A' ? question.songA : question.songB;
        if (song) {
          insights.push({
            type: 'match',
            title: `Both chose "${song.name}"`,
            description: `You both have great taste!`,
            emoji: '✨',
          });
          break; // Only add one specific match
        }
      }
    }
  }

  return insights.slice(0, 4); // Max 4 insights
}

// ============================================================================
// HELPERS
// ============================================================================

function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
