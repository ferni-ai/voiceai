/**
 * Taste Match games, stored where every API instance sees them.
 *
 * Sessions lived in a Map inside each process, so a game created on one Cloud
 * Run instance was a 404 when the join, ready or answer request landed on
 * another. Now each session is one shared record (see shared-records): every
 * state change (join, ready, answer, finish) is a transaction, so two players
 * answering at once on different instances can't overwrite each other, and
 * each write carries ttlAt so Firestore TTL removes the session afterwards:
 * a day after creation while unfinished, 30 days after it finished.
 *
 * Moved out of multiplayer-games.ts, which re-exports these functions.
 *
 * @module services/social/taste-match-sessions
 */
import { randomUUID } from 'node:crypto';
import { getLogger } from '../../utils/safe-logger.js';
import { daysAfter, sharedRecords } from './shared-records.js';
import type { TasteMatchQuestion, TasteMatchSession } from './multiplayer-games.js';
import {
  calculateCompatibility,
  generateTasteInsights,
  TASTE_MATCH_QUESTIONS,
} from './taste-match-questions.js';

const log = getLogger();

const sessions = sharedRecords<TasteMatchSession>('social_taste_match_sessions', {
  dateFields: ['createdAt', 'completedAt'],
  ttlAt: (s, now) =>
    s.status === 'completed' ? daysAfter(s.completedAt ?? now, 30) : daysAfter(s.createdAt, 1),
});

/** Participants' join times come back from the store as strings. */
function revive(session: TasteMatchSession | null): TasteMatchSession | null {
  if (!session) return null;
  return {
    ...session,
    participants: session.participants.map((p) => ({ ...p, joinedAt: new Date(p.joinedAt) })),
  };
}

/**
 * Create a new Taste Match session
 */
export async function createTasteMatchSession(
  hostUserId: string,
  hostDisplayName: string,
  rounds = 5
): Promise<TasteMatchSession> {
  const totalRounds = Math.min(Math.max(Math.floor(rounds) || 5, 1), TASTE_MATCH_QUESTIONS.length);
  // Select random questions
  const shuffled = [...TASTE_MATCH_QUESTIONS].sort(() => Math.random() - 0.5);
  const now = new Date();
  const session: TasteMatchSession = {
    id: `tastematch_${randomUUID()}`,
    participants: [
      {
        userId: hostUserId,
        displayName: hostDisplayName,
        answers: [],
        isReady: false,
        joinedAt: now,
      },
    ],
    status: 'waiting',
    currentRound: 0,
    totalRounds,
    questions: shuffled.slice(0, totalRounds),
    createdAt: now,
  };
  await sessions.put(session.id, session);
  log.info({ sessionId: session.id, rounds: totalRounds }, '🎵 Taste Match session created');
  return session;
}

/**
 * Join a waiting Taste Match session (two players at most)
 */
export async function joinTasteMatchSession(
  sessionId: string,
  userId: string,
  displayName: string
): Promise<TasteMatchSession | null> {
  const { written } = await sessions.update(sessionId, (session) => {
    if (session.status !== 'waiting') return null;
    if (session.participants.length >= 2) return null;
    if (session.participants.some((p) => p.userId === userId)) return null;
    const joined = { userId, displayName, answers: [], isReady: false, joinedAt: new Date() };
    return { ...session, participants: [...session.participants, joined] };
  });
  if (written) log.info({ sessionId, userId }, '🎵 Joined Taste Match session');
  return revive(written);
}

/**
 * Mark a participant as ready; the game starts when both are
 */
export async function setParticipantReady(
  sessionId: string,
  userId: string
): Promise<TasteMatchSession | null> {
  const { written } = await sessions.update(sessionId, (session) => {
    if (!session.participants.some((p) => p.userId === userId)) return null;
    const participants = session.participants.map((p) =>
      p.userId === userId ? { ...p, isReady: true } : p
    );
    const allReady = participants.length >= 2 && participants.every((p) => p.isReady);
    return allReady
      ? { ...session, participants, status: 'in-progress', currentRound: 1 }
      : { ...session, participants };
  });
  return revive(written);
}

/**
 * Submit an answer for the current round. Answering twice is a no-op (the
 * session comes back unchanged); the last answer of the last round finishes it.
 */
export async function submitTasteMatchAnswer(
  sessionId: string,
  userId: string,
  answer: string,
  timeMs: number
): Promise<TasteMatchSession | null> {
  let unchanged = null as TasteMatchSession | null;
  const { written } = await sessions.update(sessionId, (session) => {
    unchanged = null;
    if (session.status !== 'in-progress') return null;
    const participant = session.participants.find((p) => p.userId === userId);
    const question = session.questions[session.currentRound - 1];
    if (!participant || !question) return null;
    if (participant.answers.some((a) => a.questionId === question.id)) {
      unchanged = session;
      return null;
    }

    const participants = session.participants.map((p) =>
      p.userId === userId
        ? { ...p, answers: [...p.answers, { questionId: question.id, answer, timeMs }] }
        : p
    );
    const next: TasteMatchSession = { ...session, participants };
    const allAnswered = participants.every((p) =>
      p.answers.some((a) => a.questionId === question.id)
    );
    if (!allAnswered) return next;
    if (session.currentRound < session.totalRounds) {
      return { ...next, currentRound: session.currentRound + 1 };
    }
    // Game complete
    const done: TasteMatchSession = { ...next, status: 'completed', completedAt: new Date() };
    done.compatibilityScore = calculateCompatibility(done);
    done.insights = generateTasteInsights(done);
    return done;
  });
  return revive(written ?? unchanged);
}

/**
 * Get a Taste Match session
 */
export async function getTasteMatchSession(sessionId: string): Promise<TasteMatchSession | null> {
  return revive(await sessions.get(sessionId));
}

/**
 * Get the current question for a session in progress
 */
export async function getCurrentQuestion(sessionId: string): Promise<TasteMatchQuestion | null> {
  const session = await sessions.get(sessionId);
  if (!session || session.status !== 'in-progress') return null;
  return session.questions[session.currentRound - 1] ?? null;
}
