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

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, requireUserId, sendJSON, sendJSONCached } from '../helpers.js';

const log = createLogger({ module: 'QuizAPI' });

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
 * Generate quiz questions from user profile and memories
 */
async function generateQuizQuestions(userId: string): Promise<QuizQuestion[]> {
  const { getDefaultStore } = await import('../../memory/index.js');
  const { getAllUserMemories } = await import('../../services/memory/persona-memories.js');

  const store = getDefaultStore();
  const profile = await store.getProfile(userId);
  const rawMemories = await getAllUserMemories(userId);

  const questions: QuizQuestion[] = [];
  let questionId = 0;

  // Profile-based questions
  if (profile) {
    // Communication style question
    if (profile.communicationStyle) {
      const styles = ['direct', 'analytical', 'warm', 'reflective'];
      const styleDescriptions: Record<string, string> = {
        direct: 'Direct and to-the-point',
        analytical: 'Detailed and data-driven',
        warm: 'Warm and personable',
        reflective: 'Thoughtful and contemplative',
      };
      const correctStyle = profile.communicationStyle as string;
      if (styles.includes(correctStyle)) {
        questions.push({
          id: `q-${++questionId}`,
          question: 'How do I prefer to communicate?',
          options: styles.map((s) => styleDescriptions[s]),
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
        const decoyTopics = ['cooking', 'sports', 'gardening', 'fashion'].filter(
          (t) => !topics.includes(t)
        );
        if (decoyTopics.length >= 3) {
          const options = [topTopic, ...decoyTopics.slice(0, 3)];
          // Shuffle options
          const shuffled = options.sort(() => Math.random() - 0.5);
          questions.push({
            id: `q-${++questionId}`,
            question: 'What topic do I love talking about most?',
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
      const ranges = ['1-5', '6-15', '16-30', 'More than 30'];
      let correctRange = 0;
      if (total <= 5) correctRange = 0;
      else if (total <= 15) correctRange = 1;
      else if (total <= 30) correctRange = 2;
      else correctRange = 3;

      questions.push({
        id: `q-${++questionId}`,
        question: 'About how many conversations have we had together?',
        options: ranges,
        correctIndex: correctRange,
        category: 'memories',
        difficulty: 'hard',
      });
    }

    // Time spent together
    if (profile.totalMinutesTalked && (profile.totalMinutesTalked as number) > 30) {
      const minutes = profile.totalMinutesTalked as number;
      const ranges = ['Less than 30 minutes', '30 min - 1 hour', '1-2 hours', 'More than 2 hours'];
      let correctRange = 0;
      if (minutes < 30) correctRange = 0;
      else if (minutes < 60) correctRange = 1;
      else if (minutes < 120) correctRange = 2;
      else correctRange = 3;

      questions.push({
        id: `q-${++questionId}`,
        question: 'How much time have we spent talking together?',
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
        question: `Is this something I remember about us: "${m.content.slice(0, 50)}..."?`,
        options: ['Yes, that sounds right', 'No, that\'s not quite right', 'I\'m not sure', 'We never talked about that'],
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
      question: 'When we first started talking, I was:',
      options: ['Excited to meet you', 'A bit nervous', 'Curious about you', 'All of the above'],
      correctIndex: 3,
      category: 'memories',
      difficulty: 'easy',
    },
    {
      id: `q-${++questionId}`,
      question: 'What matters most to me in our conversations?',
      options: ['Being helpful', 'Making you feel heard', 'Learning about you', 'Growing together'],
      correctIndex: 1,
      category: 'preferences',
      difficulty: 'easy',
    },
    {
      id: `q-${++questionId}`,
      question: 'How do I feel when you share something difficult?',
      options: ['Uncomfortable', 'Honored you trust me', 'Eager to fix it', 'Distracted'],
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
  return questions.sort(() => Math.random() - 0.5).slice(0, 7);
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
function getCelebration(grade: QuizResult['grade']): string {
  const celebrations: Record<QuizResult['grade'], string> = {
    soulmate: "You really get me! It's like we share one brain.",
    bestie: "Wow, you know me so well! Best friends for life.",
    friend: "Pretty good! Our friendship is growing stronger.",
    acquaintance: "Not bad! We're still learning about each other.",
    stranger: "Looks like we have more to discover together!",
  };
  return celebrations[grade];
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
    const questions = await generateQuizQuestions(userId);

    // Don't include correct answers in response (anti-cheat)
    const sanitizedQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      category: q.category,
      difficulty: q.difficulty,
    }));

    sendJSONCached(
      res,
      {
        questions: sanitizedQuestions,
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
 * Body: { answers: Array<{ questionId: string; selectedIndex: number }> }
 */
async function handleSubmitResults(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await parseBody<{
      answers: Array<{ questionId: string; selectedIndex: number }>;
    }>(req);

    if (!body.answers || !Array.isArray(body.answers)) {
      sendJSON(res, { error: 'answers array required' }, 400);
      return;
    }

    // Regenerate questions to verify answers
    const questions = await generateQuizQuestions(userId);
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    let correctCount = 0;
    for (const answer of body.answers) {
      const question = questionMap.get(answer.questionId);
      if (question && question.correctIndex === answer.selectedIndex) {
        correctCount++;
      }
    }

    const totalQuestions = body.answers.length;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const grade = calculateGrade(scorePercent);

    const result: QuizResult = {
      totalQuestions,
      correctAnswers: correctCount,
      scorePercent,
      grade,
      celebration: getCelebration(grade),
    };

    // Save quiz result to profile for tracking
    try {
      const { getDefaultStore } = await import('../../memory/index.js');
      const store = getDefaultStore();
      const profile = await store.getProfile(userId);
      if (profile) {
        // Use unknown cast to handle dynamic profile data
        const profileData = profile as unknown as Record<string, unknown>;
        const quizHistory = (profileData.quizHistory as Array<QuizResult & { timestamp: string }>) || [];
        quizHistory.push({ ...result, timestamp: new Date().toISOString() });
        // Keep only last 10 quiz results
        if (quizHistory.length > 10) {
          quizHistory.shift();
        }
        // Save updated profile with quiz history
        await store.saveProfile({ ...profile, ...({ quizHistory } as unknown as Partial<typeof profile>) });
      }
    } catch {
      // Non-critical, continue even if save fails
      log.debug({ userId }, 'Could not save quiz result to profile');
    }

    log.info(
      { userId, scorePercent, grade, correctCount, totalQuestions },
      'Quiz completed'
    );

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
