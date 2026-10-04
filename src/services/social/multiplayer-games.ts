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

// Taste Match sessions are still per process.
const tasteMatchStore = new Map<string, TasteMatchSession>();

// ============================================================================
// TASTE MATCH GAME
// ============================================================================

/**
 * Create a new Taste Match session
 */
export function createTasteMatchSession(
  hostUserId: string,
  hostDisplayName: string,
  rounds = 5
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
