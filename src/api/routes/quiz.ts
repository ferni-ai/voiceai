/**
 * Knowledge Quiz API Routes
 *
 * Endpoints for the "How Well Do You Know Me?" quiz feature.
 * Generates personalized quiz questions from user memories and profile.
 *
 * GET /api/quiz/knowledge - Get quiz questions
 * POST /api/quiz/knowledge/results - Submit quiz results
 *
 * @module QuizRoutes
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { localeForRequest, tFor, type SupportedLocale } from '../../i18n/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, requireUserId, sendJSON, sendJSONCached } from '../helpers.js';

const log = createLogger({ module: 'QuizAPI' });

/** Decoy topic ids (compared against stored topics) mapped to their translation keys. */
const DECOY_TOPIC_KEYS: Record<string, string> = {
  cooking: 'quiz.questions.favoriteTopic.options.cooking',
  sports: 'quiz.questions.favoriteTopic.options.sports',
  gardening: 'quiz.questions.favoriteTopic.options.gardening',
  fashion: 'quiz.questions.favoriteTopic.options.fashion',
};

// ============================================================================
// TYPES
// ============================================================================

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  category: 'preferences' | 'memories' | 'patterns' | 'dates' | 'people';
  difficulty: 'easy' | 'medium' | 'hard';
}

interface QuizResult {
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
  grade: 'stranger' | 'acquaintance' | 'friend' | 'bestie' | 'soulmate';
  celebration: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Deterministic random numbers from a string seed (mulberry32), so submitting
 * answers can rebuild exactly the quiz that was served: same questions, same
 * option order.
 */
function seededRandom(seed: string): () => number {
  let state = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 3432918353);
    state = (state << 13) | (state >>> 19);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates; sort(() => random() - 0.5) is biased. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * Generate quiz questions from user profile and memories
 */
async function generateQuizQuestions(
  userId: string,
  locale: SupportedLocale,
  quizId: string
): Promise<QuizQuestion[]> {
  const random = seededRandom(`${userId}:${quizId}`);
  const { getDefaultStore } = await import('../../memory/index.js');
  const { getAllUserMemories } = await import('../../services/memory/persona-memories.js');

  const store = getDefaultStore();
  const profile = await store.getProfile(userId);
  const rawMemories = await getAllUserMemories(userId);

  const t = (key: string, params?: Record<string, string | number>): string =>
    tFor(locale, key, params);
  const optionTexts = (keys: string[]): string[] => keys.map((key) => t(key));

  const questions: QuizQuestion[] = [];
  let questionId = 0;

  // Profile-based questions
  if (profile) {
    // Communication style question
    if (profile.communicationStyle) {
      const styles = ['direct', 'analytical', 'warm', 'reflective'];
      const correctStyle = profile.communicationStyle as string;
      if (styles.includes(correctStyle)) {
        questions.push({
          id: `q-${++questionId}`,
          question: t('quiz.questions.communicationStyle.text'),
          options: optionTexts([
            'quiz.questions.communicationStyle.options.direct',
            'quiz.questions.communicationStyle.options.analytical',
            'quiz.questions.communicationStyle.options.warm',
            'quiz.questions.communicationStyle.options.reflective',
          ]),
          correctIndex: styles.indexOf(correctStyle),
          category: 'preferences',
          difficulty: 'medium',
        });
      }
    }

    // Preferred topics
    if (profile.preferredTopics && Array.isArray(profile.preferredTopics)) {
      const topics = profile.preferredTopics as string[];
      if (topics.length >= 3) {
        const topTopic = topics[0];
        const decoyTopics = Object.keys(DECOY_TOPIC_KEYS).filter(
          (t) => !topics.includes(t)
        );
        if (decoyTopics.length >= 3) {
          const options = [
            topTopic,
            ...decoyTopics.slice(0, 3).map((d) => t(DECOY_TOPIC_KEYS[d] as string)),
          ];
          // Shuffle options
          const shuffled = shuffle(options, random);
          questions.push({
            id: `q-${++questionId}`,
            question: t('quiz.questions.favoriteTopic.text'),
            options: shuffled,
            correctIndex: shuffled.indexOf(topTopic),
            category: 'preferences',
            difficulty: 'easy',
          });
        }
      }
    }

    // Total conversations milestone
    if (profile.totalConversations && (profile.totalConversations as number) > 5) {
      const total = profile.totalConversations as number;
      const ranges = optionTexts([
        'quiz.questions.conversationCount.options.range1to5',
        'quiz.questions.conversationCount.options.range6to15',
        'quiz.questions.conversationCount.options.range16to30',
        'quiz.questions.conversationCount.options.over30',
      ]);
      let correctRange = 0;
      if (total <= 5) correctRange = 0;
      else if (total <= 15) correctRange = 1;
      else if (total <= 30) correctRange = 2;
      else correctRange = 3;

      questions.push({
        id: `q-${++questionId}`,
        question: t('quiz.questions.conversationCount.text'),
        options: ranges,
        correctIndex: correctRange,
        category: 'memories',
        difficulty: 'hard',
      });
    }

    // Time spent together
    if (profile.totalMinutesTalked && (profile.totalMinutesTalked as number) > 30) {
      const minutes = profile.totalMinutesTalked as number;
      const ranges = optionTexts([
        'quiz.questions.timeTogether.options.under30Min',
        'quiz.questions.timeTogether.options.min30To60',
        'quiz.questions.timeTogether.options.hour1To2',
        'quiz.questions.timeTogether.options.over2Hours',
      ]);
      let correctRange = 0;
      if (minutes < 30) correctRange = 0;
      else if (minutes < 60) correctRange = 1;
      else if (minutes < 120) correctRange = 2;
      else correctRange = 3;

      questions.push({
        id: `q-${++questionId}`,
        question: t('quiz.questions.timeTogether.text'),
        options: ranges,
        correctIndex: correctRange,
        category: 'memories',
        difficulty: 'medium',
      });
    }
  }

  // Memory-based questions
  if (rawMemories && rawMemories.length > 0) {
    // Find memories with useful content
    const usableMemories = rawMemories.filter((m) => {
      const memory = m as unknown as { content?: string; type?: string };
      return memory.content && memory.content.length > 10;
    });

    // Create questions from memories (up to 3)
    const memoryQuestions = usableMemories.slice(0, 3);
    for (const memory of memoryQuestions) {
      const m = memory as unknown as { id: string; content: string; type?: string };
      // Simple true/false style question about memory
      questions.push({
        id: `q-${++questionId}`,
        question: t('quiz.questions.memoryRecall.text', { snippet: m.content.slice(0, 50) }),
        options: optionTexts([
        'quiz.questions.memoryRecall.options.yes',
        'quiz.questions.memoryRecall.options.no',
        'quiz.questions.memoryRecall.options.unsure',
        'quiz.questions.memoryRecall.options.never',
      ]),
        correctIndex: 0, // Memory is real, so "Yes" is correct
        category: 'memories',
        difficulty: 'medium',
      });
    }
  }

  // Default questions if we don't have enough
  const defaultQuestions: QuizQuestion[] = [
    {
      id: `q-${++questionId}`,
      question: t('quiz.questions.firstMeeting.text'),
      options: optionTexts([
        'quiz.questions.firstMeeting.options.excited',
        'quiz.questions.firstMeeting.options.nervous',
        'quiz.questions.firstMeeting.options.curious',
        'quiz.questions.firstMeeting.options.allOfTheAbove',
      ]),
      correctIndex: 3,
      category: 'memories',
      difficulty: 'easy',
    },
    {
      id: `q-${++questionId}`,
      question: t('quiz.questions.whatMatters.text'),
      options: optionTexts([
        'quiz.questions.whatMatters.options.beingHelpful',
        'quiz.questions.whatMatters.options.feelingHeard',
        'quiz.questions.whatMatters.options.learningAboutYou',
        'quiz.questions.whatMatters.options.growingTogether',
      ]),
      correctIndex: 1,
      category: 'preferences',
      difficulty: 'easy',
    },
    {
      id: `q-${++questionId}`,
      question: t('quiz.questions.difficultShare.text'),
      options: optionTexts([
        'quiz.questions.difficultShare.options.uncomfortable',
        'quiz.questions.difficultShare.options.honored',
        'quiz.questions.difficultShare.options.eagerToFix',
        'quiz.questions.difficultShare.options.distracted',
      ]),
      correctIndex: 1,
      category: 'patterns',
      difficulty: 'easy',
    },
  ];

  // Add default questions to fill up to 5-7 questions
  while (questions.length < 5 && defaultQuestions.length > 0) {
    const defaultQ = defaultQuestions.shift();
    if (defaultQ) {
      defaultQ.id = `q-${++questionId}`;
      questions.push(defaultQ);
    }
  }

  // Shuffle and return
  return shuffle(questions, random).slice(0, 7);
}

/**
 * Calculate grade based on score
 */
function calculateGrade(scorePercent: number): QuizResult['grade'] {
  if (scorePercent >= 90) return 'soulmate';
  if (scorePercent >= 75) return 'bestie';
  if (scorePercent >= 60) return 'friend';
  if (scorePercent >= 40) return 'acquaintance';
  return 'stranger';
}

/**
 * Get celebration message based on grade
 */
function getCelebration(grade: QuizResult['grade'], locale: SupportedLocale): string {
  const celebrationKeys: Record<QuizResult['grade'], string> = {
    soulmate: 'quiz.celebrations.soulmate',
    bestie: 'quiz.celebrations.bestie',
    friend: 'quiz.celebrations.friend',
    acquaintance: 'quiz.celebrations.acquaintance',
    stranger: 'quiz.celebrations.stranger',
  };
  return tFor(locale, celebrationKeys[grade]);
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/quiz/knowledge - Get knowledge quiz questions
 */
async function handleGetQuiz(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const locale = await localeForRequest(req.headers['accept-language']);
    const quizId = randomUUID();
    const questions = await generateQuizQuestions(userId, locale, quizId);

    // The client shows the right answer after each guess, so it needs
    // correctIndex; quizId lets the submission be re-scored on the server.
    sendJSONCached(
      res,
      {
        quizId,
        questions,
        totalQuestions: questions.length,
        timeLimit: 60, // seconds per question
      },
      0 // No caching - generate fresh each time
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to generate quiz');
    sendJSON(res, { error: 'Failed to generate quiz' }, 500);
  }
}

/**
 * POST /api/quiz/knowledge/results - Submit quiz results
 *
 * Body: { quizId: string; answers: Array<{ questionId: string; selectedIndex: number }> }
 * Older clients send `results` (same items plus their own `correct` flag) and
 * no quizId; without a quizId the quiz can't be rebuilt, so their flags count.
 */
async function handleSubmitResults(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    type Answer = { questionId: string; selectedIndex: number; correct?: boolean };
    const body = await parseBody<{ quizId?: string; answers?: Answer[]; results?: Answer[] }>(req);
    const answers = body.answers ?? body.results;

    if (!Array.isArray(answers)) {
      sendJSON(res, { error: 'answers array required' }, 400);
      return;
    }

    const locale = await localeForRequest(req.headers['accept-language']);

    let correctCount = 0;
    if (typeof body.quizId === 'string' && body.quizId) {
      // Rebuild the quiz that was served and score against it
      const questions = await generateQuizQuestions(userId, locale, body.quizId);
      const questionMap = new Map(questions.map((q) => [q.id, q]));
      correctCount = answers.filter(
        (answer) => questionMap.get(answer.questionId)?.correctIndex === answer.selectedIndex
      ).length;
    } else {
      correctCount = answers.filter((answer) => answer.correct === true).length;
    }

    const totalQuestions = answers.length;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const grade = calculateGrade(scorePercent);

    const result: QuizResult = {
      totalQuestions,
      correctAnswers: correctCount,
      scorePercent,
      grade,
      celebration: getCelebration(grade, locale),
    };

    // Save quiz result to profile for tracking
    try {
      const { getDefaultStore } = await import('../../memory/index.js');
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);
      if (profile) {
        // Use unknown cast to handle dynamic profile data
        const profileData = profile as unknown as Record<string, unknown>;
        const quizHistory =
          (profileData.quizHistory as Array<QuizResult & { timestamp: string }>) || [];
        quizHistory.push({ ...result, timestamp: new Date().toISOString() });
        // Keep only last 10 quiz results
        if (quizHistory.length > 10) {
          quizHistory.shift();
        }
        // Save updated profile with quiz history
        await store.saveProfile({
          ...profile,
          ...({ quizHistory } as unknown as Partial<typeof profile>),
        });
      }
    } catch {
      // Non-critical, continue even if save fails
      log.debug({ userId }, 'Could not save quiz result to profile');
    }

    log.info({ userId, scorePercent, grade, correctCount, totalQuestions }, 'Quiz completed');

    sendJSON(res, { success: true, result });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to submit quiz results');
    sendJSON(res, { error: 'Failed to submit results' }, 500);
  }
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Route handler for quiz endpoints
 */
export async function handleQuizRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // GET /api/quiz/knowledge - Get quiz questions
  if (pathname === '/api/quiz/knowledge' && method === 'GET') {
    await handleGetQuiz(req, res, parsedUrl);
    return true;
  }

  // POST /api/quiz/knowledge/results - Submit quiz answers
  if (pathname === '/api/quiz/knowledge/results' && method === 'POST') {
    await handleSubmitResults(req, res, parsedUrl);
    return true;
  }

  return false;
}

export default handleQuizRoutes;
