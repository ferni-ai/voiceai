/**
 * Knowledge Quiz UI - "How Well Do You Know Me?"
 *
 * A playful quiz that celebrates the growing relationship between
 * Ferni and the user. Questions are generated from what Ferni has
 * learned about the user through conversations.
 *
 * Design principles:
 * - Celebratory, not competitive - no "wrong" answers shame
 * - Personal - questions come from actual learned info
 * - Two-way - can quiz user about Ferni too
 * - Warm reveal - shows how well the relationship has grown
 *
 * Security note: All event handlers are on trusted elements.
 *
 * @module ui/knowledge-quiz
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';
import { getAuthState } from '../services/firebase-auth.service.js';
import { getQuizCategoryIcon, ANALYTICS_ICONS, GROWTH_ICONS, EMOTION_ICONS, QUIZ_ICONS } from './icons/shared-icons.js';

const log = createLogger('KnowledgeQuiz');

// ============================================================================
// TYPES
// ============================================================================

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  category: 'preferences' | 'memories' | 'goals' | 'personality' | 'fun_facts';
  hint?: string;
}

interface QuizResult {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
}

interface QuizResponse {
  questions: QuizQuestion[];
  totalKnown: number;
}

interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  results: QuizResult[];
  isComplete: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let styleElement: HTMLStyleElement | null = null;
let quizOverlay: HTMLElement | null = null;
let state: QuizState = {
  questions: [],
  currentIndex: 0,
  results: [],
  isComplete: false,
};

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  preferences: 'Your Favorites',
  memories: 'Shared Memories',
  goals: 'Your Dreams',
  personality: 'Who You Are',
  fun_facts: 'Fun Facts',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initKnowledgeQuizUI(): void {
  if (isInitialized) return;

  injectStyles();

  isInitialized = true;
  log.info('Knowledge Quiz UI initialized');
}

// ============================================================================
// QUIZ LAUNCHING
// ============================================================================

export async function openKnowledgeQuiz(): Promise<void> {
  const authState = getAuthState();
  if (!authState.isAuthenticated) {
    log.debug('Cannot open quiz - not authenticated');
    return;
  }

  // Reset state
  state = {
    questions: [],
    currentIndex: 0,
    results: [],
    isComplete: false,
  };

  // Fetch quiz questions
  try {
    const response = await apiGet<QuizResponse>('/api/quiz/knowledge');
    if (response.ok && response.data?.questions && response.data.questions.length > 0) {
      state.questions = response.data.questions;
    } else {
      // Use default questions if API fails
      state.questions = getDefaultQuestions();
    }
  } catch (err) {
    log.debug('Could not fetch quiz questions', { error: String(err) });
    state.questions = getDefaultQuestions();
  }

  showQuizOverlay();
}

function getDefaultQuestions(): QuizQuestion[] {
  return [
    {
      id: 'default-1',
      question: "What's one thing you enjoy doing when you need to unwind?",
      options: ['Reading a book', 'Taking a walk', 'Listening to music', 'Watching something'],
      correctIndex: -1, // No correct answer - just learning
      category: 'preferences',
      hint: "We're still getting to know each other!",
    },
    {
      id: 'default-2',
      question: 'How do you typically start your mornings?',
      options: ['Coffee first', 'Exercise', 'Easing into it slowly', 'Diving right into work'],
      correctIndex: -1,
      category: 'personality',
      hint: "I'm curious to learn!",
    },
  ];
}

// ============================================================================
// OVERLAY
// ============================================================================

function showQuizOverlay(): void {
  if (quizOverlay) {
    closeQuiz();
  }

  quizOverlay = document.createElement('div');
  quizOverlay.className = 'knowledge-quiz-overlay';
  quizOverlay.setAttribute('role', 'dialog');
  quizOverlay.setAttribute('aria-modal', 'true');
  quizOverlay.setAttribute('aria-label', 'How Well Do You Know Me Quiz');

  // Backdrop click to close
  quizOverlay.addEventListener('click', (e) => {
    if (e.target === quizOverlay) {
      closeQuiz();
    }
  });

  // Escape key to close
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeQuiz();
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'knowledge-quiz-modal';

  // Header
  const header = createHeader();
  modal.appendChild(header);

  // Question container
  const questionContainer = document.createElement('div');
  questionContainer.id = 'quiz-question-container';
  questionContainer.className = 'knowledge-quiz-question-container';
  modal.appendChild(questionContainer);

  quizOverlay.appendChild(modal);
  document.body.appendChild(quizOverlay);

  // Animate in
  requestAnimationFrame(() => {
    quizOverlay?.classList.add('knowledge-quiz-overlay--visible');
    renderCurrentQuestion();
  });

  log.debug('Quiz opened', { questionCount: state.questions.length });
}

function closeQuiz(): void {
  if (!quizOverlay) return;

  quizOverlay.classList.remove('knowledge-quiz-overlay--visible');

  setTimeout(() => {
    quizOverlay?.remove();
    quizOverlay = null;
  }, 300);
}

// ============================================================================
// HEADER
// ============================================================================

function createHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = 'knowledge-quiz-header';

  // Title
  const title = document.createElement('h2');
  title.className = 'knowledge-quiz-title';
  title.textContent = 'How Well Do You Know Me?';

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'knowledge-quiz-subtitle';
  subtitle.textContent = 'A celebration of our growing friendship';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'knowledge-quiz-close';
  closeBtn.setAttribute('aria-label', 'Close quiz');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeQuiz);

  header.appendChild(title);
  header.appendChild(subtitle);
  header.appendChild(closeBtn);

  return header;
}

// ============================================================================
// QUESTION RENDERING
// ============================================================================

function renderCurrentQuestion(): void {
  const container = document.getElementById('quiz-question-container');
  if (!container) return;

  // Clear container
  container.textContent = '';

  if (state.isComplete) {
    renderResults(container);
    return;
  }

  const question = state.questions[state.currentIndex];
  if (!question) {
    state.isComplete = true;
    renderResults(container);
    return;
  }

  // Progress indicator
  const progress = document.createElement('div');
  progress.className = 'knowledge-quiz-progress';

  const progressText = document.createElement('span');
  progressText.className = 'knowledge-quiz-progress-text';
  progressText.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;

  const progressBar = document.createElement('div');
  progressBar.className = 'knowledge-quiz-progress-bar';

  const progressFill = document.createElement('div');
  progressFill.className = 'knowledge-quiz-progress-fill';
  progressFill.style.width = `${((state.currentIndex + 1) / state.questions.length) * 100}%`;

  progressBar.appendChild(progressFill);
  progress.appendChild(progressText);
  progress.appendChild(progressBar);

  // Category badge
  const category = document.createElement('div');
  category.className = 'knowledge-quiz-category';

  const categoryIcon = document.createElement('span');
  categoryIcon.className = 'knowledge-quiz-category-icon';
  categoryIcon.innerHTML = getQuizCategoryIcon(question.category);
  categoryIcon.setAttribute('aria-hidden', 'true');

  const categoryLabel = document.createElement('span');
  categoryLabel.textContent = CATEGORY_LABELS[question.category] || 'About You';

  category.appendChild(categoryIcon);
  category.appendChild(categoryLabel);

  // Question text
  const questionText = document.createElement('p');
  questionText.className = 'knowledge-quiz-question-text';
  questionText.textContent = question.question;

  // Options
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'knowledge-quiz-options';

  question.options.forEach((option, index) => {
    const optionBtn = document.createElement('button');
    optionBtn.className = 'knowledge-quiz-option';
    optionBtn.textContent = option;
    optionBtn.addEventListener('click', () => handleAnswer(index));
    optionsContainer.appendChild(optionBtn);
  });

  // Hint if available
  if (question.hint) {
    const hint = document.createElement('p');
    hint.className = 'knowledge-quiz-hint';
    hint.textContent = question.hint;
    container.appendChild(hint);
  }

  container.appendChild(progress);
  container.appendChild(category);
  container.appendChild(questionText);
  container.appendChild(optionsContainer);
}

// ============================================================================
// ANSWER HANDLING
// ============================================================================

function handleAnswer(selectedIndex: number): void {
  const question = state.questions[state.currentIndex];
  if (!question) return;

  const isCorrect = question.correctIndex === -1 || selectedIndex === question.correctIndex;

  // Record result
  state.results.push({
    questionId: question.id,
    selectedIndex,
    correct: isCorrect,
  });

  // Show feedback briefly
  showAnswerFeedback(selectedIndex, isCorrect);
}

function showAnswerFeedback(selectedIndex: number, isCorrect: boolean): void {
  const options = document.querySelectorAll('.knowledge-quiz-option');
  const question = state.questions[state.currentIndex];

  options.forEach((option, index) => {
    const btn = option as HTMLButtonElement;
    btn.disabled = true;

    if (index === selectedIndex) {
      btn.classList.add(isCorrect ? 'knowledge-quiz-option--correct' : 'knowledge-quiz-option--selected');
    }

    if (question && question.correctIndex !== -1 && index === question.correctIndex) {
      btn.classList.add('knowledge-quiz-option--correct');
    }
  });

  // Move to next question after delay
  setTimeout(() => {
    state.currentIndex++;
    if (state.currentIndex >= state.questions.length) {
      state.isComplete = true;
    }
    renderCurrentQuestion();
  }, 800);
}

// ============================================================================
// RESULTS
// ============================================================================

function renderResults(container: HTMLElement): void {
  container.textContent = '';

  const correctCount = state.results.filter((r) => r.correct).length;
  const totalQuestions = state.results.length;

  // Results card
  const resultsCard = document.createElement('div');
  resultsCard.className = 'knowledge-quiz-results';

  // Celebration message
  const celebration = document.createElement('div');
  celebration.className = 'knowledge-quiz-celebration';

  const celebrationIcon = document.createElement('span');
  celebrationIcon.className = 'knowledge-quiz-celebration-icon';
  celebrationIcon.innerHTML = getResultIcon(correctCount, totalQuestions);
  celebrationIcon.setAttribute('aria-hidden', 'true');

  const celebrationText = document.createElement('h3');
  celebrationText.className = 'knowledge-quiz-celebration-text';
  celebrationText.textContent = getResultMessage(correctCount, totalQuestions);

  celebration.appendChild(celebrationIcon);
  celebration.appendChild(celebrationText);

  // Score display
  const score = document.createElement('div');
  score.className = 'knowledge-quiz-score';

  const scoreValue = document.createElement('span');
  scoreValue.className = 'knowledge-quiz-score-value';
  scoreValue.textContent = `${correctCount}/${totalQuestions}`;

  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'knowledge-quiz-score-label';
  scoreLabel.textContent = 'memories matched';

  score.appendChild(scoreValue);
  score.appendChild(scoreLabel);

  // Warm message
  const warmMessage = document.createElement('p');
  warmMessage.className = 'knowledge-quiz-warm-message';
  warmMessage.textContent = getWarmMessage(correctCount, totalQuestions);

  // Done button
  const doneBtn = document.createElement('button');
  doneBtn.className = 'knowledge-quiz-done-btn';
  doneBtn.textContent = 'Thanks for playing!';
  doneBtn.addEventListener('click', closeQuiz);

  resultsCard.appendChild(celebration);
  resultsCard.appendChild(score);
  resultsCard.appendChild(warmMessage);
  resultsCard.appendChild(doneBtn);

  container.appendChild(resultsCard);

  // Submit results to backend
  submitResults();
}

function getResultIcon(correct: number, total: number): string {
  const ratio = total > 0 ? correct / total : 0;
  if (ratio >= 0.8) return EMOTION_ICONS.proud;
  if (ratio >= 0.5) return ANALYTICS_ICONS.sparkles;
  return GROWTH_ICONS.seedling;
}

function getResultMessage(correct: number, total: number): string {
  const ratio = total > 0 ? correct / total : 0;
  if (ratio >= 0.8) return "We really know each other!";
  if (ratio >= 0.5) return "We're building something special";
  return "Every conversation helps me know you better";
}

function getWarmMessage(correct: number, total: number): string {
  const ratio = total > 0 ? correct / total : 0;
  if (ratio >= 0.8) return "Our friendship has grown so much. I cherish every conversation we've had.";
  if (ratio >= 0.5) return "I'm learning more about you every time we talk. Thank you for sharing.";
  return "I can't wait to learn more about you. Every chat helps our friendship grow.";
}

async function submitResults(): Promise<void> {
  try {
    await apiPost('/api/quiz/knowledge/results', {
      results: state.results,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    log.debug('Could not submit quiz results', { error: String(err) });
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'knowledge-quiz-styles';
  styleElement.textContent = `
    /* ========================================
       KNOWLEDGE QUIZ
       "How Well Do You Know Me?" game
       ======================================== */

    .knowledge-quiz-overlay {
      position: fixed;
      inset: 0;
      background: var(--backdrop-overlay, rgba(44, 37, 32, 0.7));
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 2100);
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT};
      padding: var(--space-md, 16px);
    }

    .knowledge-quiz-overlay--visible {
      opacity: 1;
    }

    .knowledge-quiz-modal {
      background: var(--color-bg-secondary, #2C2520);
      border: 1px solid var(--glass-border, rgba(44, 37, 32, 0.2));
      border-radius: var(--radius-xl, 24px);
      width: 100%;
      max-width: 400px;
      max-height: 90vh;
      overflow-y: auto;
      transform: scale(0.95) translateY(20px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }

    .knowledge-quiz-overlay--visible .knowledge-quiz-modal {
      transform: scale(1) translateY(0);
    }

    /* Header */
    .knowledge-quiz-header {
      position: relative;
      padding: var(--space-lg, 26px) var(--space-lg, 26px) var(--space-md, 16px);
      text-align: center;
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
    }

    .knowledge-quiz-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #F5F1E8);
      margin: 0;
    }

    .knowledge-quiz-subtitle {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, rgba(245, 241, 232, 0.6));
      margin: var(--space-xs, 4px) 0 0;
    }

    .knowledge-quiz-close {
      position: absolute;
      top: var(--space-md, 16px);
      right: var(--space-md, 16px);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 999px);
      color: var(--color-text-muted, rgba(245, 241, 232, 0.6));
      font-size: 24px;
      cursor: pointer;
      transition: color ${DURATION.FAST}ms, background ${DURATION.FAST}ms;
    }

    .knowledge-quiz-close:hover {
      color: var(--color-text-primary, #F5F1E8);
      background: var(--color-bg-elevated, rgba(245, 241, 232, 0.1));
    }

    .knowledge-quiz-close:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Question container */
    .knowledge-quiz-question-container {
      padding: var(--space-lg, 26px);
    }

    /* Progress */
    .knowledge-quiz-progress {
      margin-bottom: var(--space-md, 16px);
    }

    .knowledge-quiz-progress-text {
      display: block;
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(245, 241, 232, 0.6));
      margin-bottom: var(--space-xs, 4px);
    }

    .knowledge-quiz-progress-bar {
      height: 4px;
      background: var(--color-bg-tertiary, rgba(245, 241, 232, 0.1));
      border-radius: 2px;
      overflow: hidden;
    }

    .knowledge-quiz-progress-fill {
      height: 100%;
      background: var(--color-accent-primary, #4a6741);
      border-radius: 2px;
      transition: width ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
    }

    /* Category */
    .knowledge-quiz-category {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      padding: var(--space-2xs, 2px) var(--space-sm, 8px);
      background: var(--color-bg-elevated, rgba(245, 241, 232, 0.08));
      border-radius: var(--radius-full, 999px);
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-secondary, rgba(245, 241, 232, 0.8));
      margin-bottom: var(--space-md, 16px);
    }

    .knowledge-quiz-category-icon {
      width: 14px;
      height: 14px;
      color: var(--color-accent-primary, #4a6741);
    }

    .knowledge-quiz-category-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Question text */
    .knowledge-quiz-question-text {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-md, 1rem);
      font-weight: 600;
      color: var(--color-text-primary, #F5F1E8);
      line-height: 1.5;
      margin: 0 0 var(--space-lg, 26px);
    }

    /* Options */
    .knowledge-quiz-options {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 8px);
    }

    .knowledge-quiz-option {
      width: 100%;
      padding: var(--space-md, 16px);
      background: var(--color-bg-elevated, rgba(245, 241, 232, 0.08));
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-primary, #F5F1E8);
      font-size: var(--font-size-sm, 0.875rem);
      text-align: left;
      cursor: pointer;
      transition:
        background ${DURATION.FAST}ms,
        border-color ${DURATION.FAST}ms,
        transform ${DURATION.FAST}ms;
    }

    .knowledge-quiz-option:hover:not(:disabled) {
      background: var(--color-bg-tertiary, rgba(245, 241, 232, 0.12));
      transform: translateX(4px);
    }

    .knowledge-quiz-option:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    .knowledge-quiz-option:disabled {
      cursor: default;
    }

    .knowledge-quiz-option--selected {
      background: var(--color-bg-tertiary, rgba(245, 241, 232, 0.12));
      border-color: var(--color-text-muted, rgba(245, 241, 232, 0.3));
    }

    .knowledge-quiz-option--correct {
      background: rgba(74, 103, 65, 0.2);
      border-color: var(--color-accent-primary, #4a6741);
    }

    /* Hint */
    .knowledge-quiz-hint {
      font-size: var(--font-size-xs, 0.75rem);
      color: var(--color-text-muted, rgba(245, 241, 232, 0.6));
      font-style: italic;
      margin-top: var(--space-md, 16px);
      text-align: center;
    }

    /* Results */
    .knowledge-quiz-results {
      text-align: center;
      padding: var(--space-lg, 26px) 0;
    }

    .knowledge-quiz-celebration {
      margin-bottom: var(--space-lg, 26px);
    }

    .knowledge-quiz-celebration-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      margin: 0 auto var(--space-sm, 8px);
      color: var(--color-accent-primary, #4a6741);
      animation: celebratePop 0.6s ${EASING.SPRING};
    }

    .knowledge-quiz-celebration-icon svg {
      width: 100%;
      height: 100%;
    }

    @keyframes celebratePop {
      0% { transform: scale(0); }
      60% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    .knowledge-quiz-celebration-text {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: var(--font-size-lg, 1.25rem);
      font-weight: 700;
      color: var(--color-text-primary, #F5F1E8);
      margin: 0;
    }

    .knowledge-quiz-score {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2xs, 2px);
      margin-bottom: var(--space-lg, 26px);
    }

    .knowledge-quiz-score-value {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--color-accent-primary, #4a6741);
    }

    .knowledge-quiz-score-label {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-muted, rgba(245, 241, 232, 0.6));
    }

    .knowledge-quiz-warm-message {
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text-secondary, rgba(245, 241, 232, 0.8));
      line-height: 1.5;
      margin: 0 0 var(--space-lg, 26px);
      padding: 0 var(--space-md, 16px);
    }

    .knowledge-quiz-done-btn {
      padding: var(--space-sm, 8px) var(--space-lg, 26px);
      background: var(--color-accent-primary, #4a6741);
      border: none;
      border-radius: var(--radius-full, 999px);
      color: white;
      font-size: var(--font-size-sm, 0.875rem);
      font-weight: 600;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms, transform ${DURATION.FAST}ms;
    }

    .knowledge-quiz-done-btn:hover {
      background: var(--color-accent-secondary, #5c7a50);
      transform: scale(1.02);
    }

    .knowledge-quiz-done-btn:focus-visible {
      outline: 2px solid var(--color-accent-primary, #4a6741);
      outline-offset: 2px;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .knowledge-quiz-modal,
      .knowledge-quiz-overlay,
      .knowledge-quiz-option,
      .knowledge-quiz-celebration-icon {
        animation: none;
        transition: opacity ${DURATION.FAST}ms;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeKnowledgeQuizUI(): void {
  closeQuiz();

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  isInitialized = false;
  log.debug('Knowledge Quiz UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const knowledgeQuizUI = {
  init: initKnowledgeQuizUI,
  dispose: disposeKnowledgeQuizUI,
  open: openKnowledgeQuiz,
};
