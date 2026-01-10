/**
 * Knowledge Quiz UI Tests
 *
 * Tests for the "How Well Do You Know Me?" quiz component.
 * Verifies initialization, quiz flow, accessibility, and results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - Set up before dynamic imports
// ============================================================================

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out' },
}));

// Create mock functions that can be configured per test
const mockAuthState = { isAuthenticated: true, userId: 'test-user-123' };
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

// Mock auth service
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockAuthState,
}));

// Mock API
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
}));

// ============================================================================
// TEST SETUP
// ============================================================================

describe('KnowledgeQuizUI', () => {
  // Use dynamic import to ensure mocks are applied
  let initKnowledgeQuizUI: () => void;
  let openKnowledgeQuiz: () => Promise<void>;
  let disposeKnowledgeQuizUI: () => void;
  let knowledgeQuizUI: {
    init: () => void;
    open: () => Promise<void>;
    dispose: () => void;
  };

  beforeEach(async () => {
    // Reset DOM - safe cleanup for tests
    document.body.textContent = '';
    document.head.textContent = '';

    // Reset mocks
    vi.clearAllMocks();

    // Reset auth state to authenticated
    mockAuthState.isAuthenticated = true;
    mockAuthState.userId = 'test-user-123';

    // Default API response with quiz questions
    mockApiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        questions: [
          {
            id: 'q1',
            question: 'What is your favorite color?',
            options: ['Blue', 'Green', 'Red', 'Yellow'],
            correctIndex: 1,
            category: 'preferences',
          },
          {
            id: 'q2',
            question: 'What time do you usually wake up?',
            options: ['Before 6am', '6-8am', '8-10am', 'After 10am'],
            correctIndex: 2,
            category: 'personality',
          },
        ],
        totalKnown: 10,
      },
    });

    mockApiPost.mockResolvedValue({ ok: true, status: 200, data: {} });

    // Reset module state by re-importing
    vi.resetModules();
    const module = await import('../../src/ui/knowledge-quiz.ui.js');
    initKnowledgeQuizUI = module.initKnowledgeQuizUI;
    openKnowledgeQuiz = module.openKnowledgeQuiz;
    disposeKnowledgeQuizUI = module.disposeKnowledgeQuizUI;
    knowledgeQuizUI = module.knowledgeQuizUI;
  });

  afterEach(() => {
    disposeKnowledgeQuizUI?.();
    document.body.textContent = '';
    document.head.textContent = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  describe('Module exports', () => {
    it('should export init function', () => {
      expect(typeof initKnowledgeQuizUI).toBe('function');
    });

    it('should export open function', () => {
      expect(typeof openKnowledgeQuiz).toBe('function');
    });

    it('should export dispose function', () => {
      expect(typeof disposeKnowledgeQuizUI).toBe('function');
    });

    it('should export knowledgeQuizUI object with all methods', () => {
      expect(knowledgeQuizUI).toBeDefined();
      expect(typeof knowledgeQuizUI.init).toBe('function');
      expect(typeof knowledgeQuizUI.open).toBe('function');
      expect(typeof knowledgeQuizUI.dispose).toBe('function');
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe('Initialization', () => {
    it('should inject styles on init', () => {
      initKnowledgeQuizUI();

      const styleElement = document.getElementById('knowledge-quiz-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement?.tagName).toBe('STYLE');
    });

    it('should not inject styles twice', () => {
      initKnowledgeQuizUI();
      initKnowledgeQuizUI();

      const styleElements = document.querySelectorAll('#knowledge-quiz-styles');
      expect(styleElements.length).toBe(1);
    });
  });

  // ============================================================================
  // QUIZ OPENING
  // ============================================================================

  describe('Quiz opening', () => {
    it('should create overlay when opened', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeTruthy();
    });

    it('should fetch questions from API when opened', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      expect(mockApiGet).toHaveBeenCalledWith('/api/quiz/knowledge');
    });

    it('should not open if not authenticated', async () => {
      mockAuthState.isAuthenticated = false;

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeFalsy();
    });

    it('should use default questions when API fails', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeTruthy();

      // Should still show questions
      const questionText = document.querySelector('.knowledge-quiz-question-text');
      expect(questionText).toBeTruthy();
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  describe('Accessibility', () => {
    it('should have role="dialog" on overlay', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true" on overlay', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay?.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-label on overlay', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay?.getAttribute('aria-label')).toBe('How Well Do You Know Me Quiz');
    });

    it('should have aria-label on close button', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const closeBtn = document.querySelector('.knowledge-quiz-close');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close quiz');
    });

    it('should have aria-hidden on category icons', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const categoryIcon = document.querySelector('.knowledge-quiz-category span');
      expect(categoryIcon?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ============================================================================
  // QUIZ FLOW
  // ============================================================================

  describe('Quiz flow', () => {
    it('should show progress indicator', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const progressText = document.querySelector('.knowledge-quiz-progress-text');
      expect(progressText?.textContent).toContain('Question 1 of 2');
    });

    it('should render question options', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const options = document.querySelectorAll('.knowledge-quiz-option');
      expect(options.length).toBe(4); // 4 options per question
    });

    it('should advance to next question after answer', async () => {
      vi.useFakeTimers();

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await vi.advanceTimersByTimeAsync(50);

      // Click first option
      const options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();

      // Wait for transition
      await vi.advanceTimersByTimeAsync(900);

      const progressText = document.querySelector('.knowledge-quiz-progress-text');
      expect(progressText?.textContent).toContain('Question 2 of 2');
    });

    it('should disable options after selection', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();

      options.forEach((option) => {
        expect((option as HTMLButtonElement).disabled).toBe(true);
      });
    });
  });

  // ============================================================================
  // RESULTS
  // ============================================================================

  describe('Results', () => {
    it('should show results after all questions answered', async () => {
      vi.useFakeTimers();

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await vi.advanceTimersByTimeAsync(50);

      // Answer both questions
      let options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(900);

      options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(900);

      // Check for results
      const resultsCard = document.querySelector('.knowledge-quiz-results');
      expect(resultsCard).toBeTruthy();
    });

    it('should submit results to API', async () => {
      vi.useFakeTimers();

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await vi.advanceTimersByTimeAsync(50);

      // Answer both questions
      let options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(900);

      options = document.querySelectorAll('.knowledge-quiz-option');
      (options[0] as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(900);

      // Check API was called
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/quiz/knowledge/results',
        expect.objectContaining({
          results: expect.any(Array),
          completedAt: expect.any(String),
        })
      );
    });

    it('should show celebration message in results', async () => {
      vi.useFakeTimers();

      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await vi.advanceTimersByTimeAsync(50);

      // Answer both questions correctly
      let options = document.querySelectorAll('.knowledge-quiz-option');
      (options[1] as HTMLButtonElement).click(); // correctIndex is 1
      await vi.advanceTimersByTimeAsync(900);

      options = document.querySelectorAll('.knowledge-quiz-option');
      (options[2] as HTMLButtonElement).click(); // correctIndex is 2
      await vi.advanceTimersByTimeAsync(900);

      // Check celebration
      const celebrationText = document.querySelector('.knowledge-quiz-celebration-text');
      expect(celebrationText?.textContent).toBeTruthy();
    });
  });

  // ============================================================================
  // CLOSING
  // ============================================================================

  describe('Closing', () => {
    it('should close on close button click', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const closeBtn = document.querySelector('.knowledge-quiz-close') as HTMLElement;
      closeBtn?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeFalsy();
    });

    it('should close on backdrop click', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay') as HTMLElement;
      overlay?.click();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(document.querySelector('.knowledge-quiz-overlay')).toBeFalsy();
    });

    it('should close on Escape key', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeFalsy();
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe('Cleanup', () => {
    it('should remove styles on dispose', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      expect(document.getElementById('knowledge-quiz-styles')).toBeTruthy();

      disposeKnowledgeQuizUI();

      expect(document.getElementById('knowledge-quiz-styles')).toBeFalsy();
    });

    it('should close quiz on dispose', async () => {
      initKnowledgeQuizUI();
      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector('.knowledge-quiz-overlay')).toBeTruthy();

      disposeKnowledgeQuizUI();

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(document.querySelector('.knowledge-quiz-overlay')).toBeFalsy();
    });

    it('should allow re-initialization after dispose', async () => {
      initKnowledgeQuizUI();
      disposeKnowledgeQuizUI();
      initKnowledgeQuizUI();

      await openKnowledgeQuiz();

      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));

      const overlay = document.querySelector('.knowledge-quiz-overlay');
      expect(overlay).toBeTruthy();
    });
  });
});
