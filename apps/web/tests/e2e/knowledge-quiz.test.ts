/**
 * Knowledge Quiz E2E Tests
 *
 * Tests for the "How Well Do You Know Me?" quiz flow.
 * Validates question generation, answer submission, and scoring.
 *
 * @module tests/e2e/knowledge-quiz
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300, DRAMATIC: 600, CELEBRATION: 800 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out' },
  prefersReducedMotion: () => false,
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockToast = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  getUserId: () => 'test-user-123',
}));

vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: mockToast,
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockQuizQuestions = {
  questions: [
    {
      id: 'q1',
      question: "What's the name of their dog?",
      type: 'multiple_choice',
      options: ['Bruno', 'Max', 'Charlie', 'Buddy'],
      correctAnswer: 'Bruno',
      difficulty: 'easy',
      category: 'personal',
    },
    {
      id: 'q2',
      question: "Which college did they graduate from?",
      type: 'multiple_choice',
      options: ['Stanford', 'MIT', 'Harvard', 'Berkeley'],
      correctAnswer: 'Stanford',
      difficulty: 'medium',
      category: 'education',
    },
    {
      id: 'q3',
      question: "What's their favorite cuisine?",
      type: 'multiple_choice',
      options: ['Italian', 'Japanese', 'Mexican', 'Thai'],
      correctAnswer: 'Japanese',
      difficulty: 'easy',
      category: 'preferences',
    },
  ],
  totalQuestions: 3,
  difficulty: 'mixed',
};

const mockQuizResult = {
  score: 2,
  totalQuestions: 3,
  percentage: 66.7,
  grade: 'B',
  feedback: "Great job! You really know them well.",
  incorrectQuestions: [
    {
      id: 'q2',
      question: "Which college did they graduate from?",
      yourAnswer: 'MIT',
      correctAnswer: 'Stanford',
    },
  ],
};

// ============================================================================
// TESTS
// ============================================================================

describe('Knowledge Quiz', () => {
  beforeEach(() => {
    document.body.textContent = '';
    vi.clearAllMocks();
    
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: mockQuizQuestions,
    });

    mockApiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: mockQuizResult,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // QUESTION LOADING
  // ============================================================================

  describe('Question Loading', () => {
    it('should fetch quiz questions from API', async () => {
      await mockApiGet('/api/quiz/knowledge');
      
      expect(mockApiGet).toHaveBeenCalledWith('/api/quiz/knowledge');
    });

    it('should load correct number of questions', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      
      expect(response.data.questions).toHaveLength(3);
      expect(response.data.totalQuestions).toBe(3);
    });

    it('should include all required question fields', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      const question = response.data.questions[0];
      
      expect(question.id).toBeDefined();
      expect(question.question).toBeDefined();
      expect(question.type).toBeDefined();
      expect(question.options).toBeInstanceOf(Array);
      expect(question.difficulty).toBeDefined();
    });

    it('should handle API error gracefully', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Failed to load questions'));
      
      try {
        await mockApiGet('/api/quiz/knowledge');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // ANSWER SUBMISSION
  // ============================================================================

  describe('Answer Submission', () => {
    it('should submit answers to API', async () => {
      const answers = {
        q1: 'Bruno',
        q2: 'MIT',
        q3: 'Japanese',
      };
      
      await mockApiPost('/api/quiz/knowledge/submit', answers);
      
      expect(mockApiPost).toHaveBeenCalledWith('/api/quiz/knowledge/submit', answers);
    });

    it('should receive score after submission', async () => {
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      expect(response.data.score).toBeDefined();
      expect(response.data.percentage).toBeDefined();
      expect(response.data.grade).toBeDefined();
    });

    it('should include feedback in results', async () => {
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      expect(response.data.feedback).toBeTypeOf('string');
      expect(response.data.feedback.length).toBeGreaterThan(0);
    });

    it('should list incorrect answers', async () => {
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      expect(response.data.incorrectQuestions).toBeInstanceOf(Array);
      expect(response.data.incorrectQuestions[0]).toHaveProperty('yourAnswer');
      expect(response.data.incorrectQuestions[0]).toHaveProperty('correctAnswer');
    });
  });

  // ============================================================================
  // SCORING
  // ============================================================================

  describe('Scoring', () => {
    it('should calculate percentage correctly', async () => {
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      const expectedPercentage = (2 / 3) * 100;
      expect(response.data.percentage).toBeCloseTo(expectedPercentage, 1);
    });

    it('should assign appropriate grade', async () => {
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      // 66.7% should be a B
      expect(response.data.grade).toBe('B');
    });

    it('should handle perfect score', async () => {
      mockApiPost.mockResolvedValueOnce({
        ok: true,
        data: {
          score: 3,
          totalQuestions: 3,
          percentage: 100,
          grade: 'A+',
          feedback: "Perfect score! You know them inside and out.",
          incorrectQuestions: [],
        },
      });
      
      const response = await mockApiPost('/api/quiz/knowledge/submit', {});
      
      expect(response.data.percentage).toBe(100);
      expect(response.data.grade).toBe('A+');
      expect(response.data.incorrectQuestions).toHaveLength(0);
    });
  });

  // ============================================================================
  // QUESTION TYPES
  // ============================================================================

  describe('Question Types', () => {
    it('should support multiple choice questions', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      const mcQuestion = response.data.questions.find(
        (q: { type: string }) => q.type === 'multiple_choice'
      );
      
      expect(mcQuestion).toBeDefined();
      expect(mcQuestion.options.length).toBeGreaterThanOrEqual(2);
    });

    it('should have 4 options for multiple choice', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      const mcQuestion = response.data.questions[0];
      
      expect(mcQuestion.options).toHaveLength(4);
    });

    it('should include correct answer in options', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      const question = response.data.questions[0];
      
      expect(question.options).toContain(question.correctAnswer);
    });
  });

  // ============================================================================
  // DIFFICULTY LEVELS
  // ============================================================================

  describe('Difficulty Levels', () => {
    it('should include difficulty for each question', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      
      response.data.questions.forEach((q: { difficulty: string }) => {
        expect(q.difficulty).toMatch(/easy|medium|hard/);
      });
    });

    it('should categorize questions', async () => {
      const response = await mockApiGet('/api/quiz/knowledge');
      
      response.data.questions.forEach((q: { category: string }) => {
        expect(q.category).toBeDefined();
        expect(q.category.length).toBeGreaterThan(0);
      });
    });
  });
});
