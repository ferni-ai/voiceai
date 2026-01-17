/**
 * Game Board UI - Visual Game State Display
 *
 * Renders visual representations of active voice games:
 * - Tic-Tac-Toe: 3x3 grid with X/O markers
 * - 20 Questions: Question count, yes/no history
 * - Word Association: Word chain visualization
 * - Story Builder: Current story state
 *
 * Features:
 * - Real-time updates via data channel
 * - Accessible (screen reader compatible)
 * - Animated state transitions
 *
 * @module ui/game-board
 */

import { gsap } from '../utils/gsap-setup.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GameBoard');

// ============================================================================
// TYPES
// ============================================================================

type TicTacToePlayer = 'X' | 'O';
type TicTacToeBoard = (TicTacToePlayer | null)[];

interface TicTacToeState {
  board: TicTacToeBoard;
  currentPlayer: TicTacToePlayer;
  userSymbol: TicTacToePlayer;
  aiSymbol: TicTacToePlayer;
  winner: TicTacToePlayer | 'draw' | null;
  moveHistory: number[];
  difficulty: 'easy' | 'medium' | 'hard';
}

interface TwentyQuestionsState {
  secretThing?: string;
  category?: string;
  questionsAsked: string[];
  answers: Array<'yes' | 'no' | 'maybe'>;
  questionNumber: number;
  guessedCorrectly: boolean | null;
  maxQuestions?: number;
}

interface WordAssociationState {
  chain: string[];
  currentWord: string;
  isUserTurn: boolean;
  turnCount: number;
  lastValidWord?: string;
  invalidAttempts?: number;
}

interface StoryBuilderState {
  title?: string;
  chapters: string[];
  currentChapter: number;
  isUserTurn: boolean;
  genre?: string;
}

interface WouldYouRatherState {
  currentQuestion?: {
    optionA: string;
    optionB: string;
  };
  roundNumber: number;
  userChoices: string[];
  aiChoices: string[];
}

interface ThreeWordDayState {
  promptType: 'day' | 'mood' | 'week' | 'moment' | 'year' | 'custom';
  words: string[];
  explorationPhase: number | 'complete';
  insights: string[];
  concluded: boolean;
}

interface HeadlineWriterState {
  phase: 'prompt' | 'writing' | 'subheadline' | 'reflection' | 'another' | 'complete';
  currentTimeframe: string;
  headlines: Array<{ text: string; timeframe: string; subheadline?: string }>;
  round: number;
}

interface EmojiStoryState {
  emojis: string[];
  meanings: string[];
  currentPhase: 'collecting' | 'interpreting' | 'complete';
  storyNarrative?: string;
}

interface ValuesCardSortState {
  phase: 'intro' | 'sorting' | 'narrowing' | 'ranking' | 'reflection' | 'complete';
  currentCard?: { name: string; description: string };
  importantCount: number;
  topFive: Array<{ name: string }>;
}

interface OneWordCheckinState {
  word?: string;
  followUpQuestion?: string;
  reflection?: string;
  phase: 'asking' | 'exploring' | 'complete';
}

interface TinyWinTrackerState {
  wins: string[];
  currentWin?: string;
  celebrationMessage?: string;
  phase: 'capturing' | 'celebrating' | 'complete';
}

interface FortuneCookieState {
  fortune?: string;
  reflection?: string;
  phase: 'presenting' | 'reflecting' | 'complete';
}

type GameType =
  | 'tic-tac-toe'
  | '20-questions'
  | 'word-association'
  | 'story-builder'
  | 'would-you-rather'
  | 'three-word-day'
  | 'headline-writer'
  | 'emoji-story'
  | 'values-card-sort'
  | 'one-word-checkin'
  | 'tiny-win-tracker'
  | 'fortune-cookie';

interface GameState {
  gameType: GameType;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  lastActivityAt: string;
  gameData:
    | TicTacToeState
    | TwentyQuestionsState
    | WordAssociationState
    | StoryBuilderState
    | WouldYouRatherState
    | ThreeWordDayState
    | HeadlineWriterState
    | EmojiStoryState
    | ValuesCardSortState
    | OneWordCheckinState
    | TinyWinTrackerState
    | FortuneCookieState;
}

interface GameStartEvent {
  gameId: string;
  gameType: string;
  gameName: string;
  category?: string;
}

// ============================================================================
// CONFIGURATION (Configurable values instead of hardcoded)
// ============================================================================

const CONFIG = {
  /** Auto-hide delay after game completion (ms) */
  autoHideDelayMs: 5000,
  /** Time without updates before showing stale indicator (ms) */
  staleTimeoutMs: 10000,
  /** Max questions for 20-questions game */
  defaultMaxQuestions: 20,
  /** Tic-tac-toe grid size */
  ticTacToeGridSize: 9,
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let currentGameType: GameType | null = null;
let isVisible = false;
let isDisconnected = false;
let lastUpdateTimestamp: number | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;
let currentTween: gsap.core.Tween | null = null;
let autoHideTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
  .game-board-container {
    position: fixed;
    bottom: var(--space-xl);
    right: var(--space-xl);
    z-index: var(--z-floating);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-xl);
    padding: var(--space-lg);
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--color-border-subtle);
    min-width: 280px;
    max-width: 360px;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    pointer-events: none;
    transition: opacity var(--duration-normal) var(--ease-out),
                transform var(--duration-normal) var(--ease-out);
  }

  .game-board-container.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .game-board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .game-board-title {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .game-board-title svg {
    width: 20px;
    height: 20px;
    color: var(--color-accent-primary);
  }

  .game-board-status {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    padding: var(--space-2xs) var(--space-sm);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
  }

  .game-board-close {
    background: none;
    border: none;
    padding: var(--space-xs);
    cursor: pointer;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    transition: background var(--duration-fast);
  }

  .game-board-close:hover {
    background: var(--color-bg-tertiary);
  }

  .game-board-close:focus-visible {
    outline: 2px solid var(--color-accent-primary);
    outline-offset: 2px;
  }

  .game-board-close svg {
    width: 18px;
    height: 18px;
  }

  /* Tic-Tac-Toe Grid */
  .ttt-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-xs);
    aspect-ratio: 1;
    margin-bottom: var(--space-md);
  }

  .ttt-cell {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    transition: background var(--duration-fast);
  }

  .ttt-cell svg {
    width: 60%;
    height: 60%;
  }

  .ttt-cell.x svg {
    color: var(--color-accent-primary);
  }

  .ttt-cell.o svg {
    color: var(--color-semantic-warning);
  }

  .ttt-cell.winning {
    background: var(--color-semantic-success-bg);
    animation: pulse 0.6s ease-in-out;
  }

  .ttt-turn-indicator {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .ttt-turn-indicator strong {
    color: var(--color-text-primary);
  }

  /* 20 Questions */
  .twenty-q-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .twenty-q-progress {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .twenty-q-progress-bar {
    flex: 1;
    height: 8px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .twenty-q-progress-fill {
    height: 100%;
    background: var(--color-accent-primary);
    border-radius: var(--radius-full);
    transition: width var(--duration-normal) var(--ease-out);
  }

  .twenty-q-count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .twenty-q-history {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    max-height: 120px;
    overflow-y: auto;
  }

  .twenty-q-answer {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
  }

  .twenty-q-answer.yes {
    background: var(--color-semantic-success-bg);
    color: var(--color-semantic-success);
  }

  .twenty-q-answer.no {
    background: var(--color-semantic-error-bg);
    color: var(--color-semantic-error);
  }

  .twenty-q-answer.maybe {
    background: var(--color-semantic-warning-bg);
    color: var(--color-semantic-warning);
  }

  .twenty-q-answer svg {
    width: 12px;
    height: 12px;
  }

  /* Word Association */
  .word-chain-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .word-chain {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    align-items: center;
    max-height: 150px;
    overflow-y: auto;
  }

  .word-chain-item {
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    animation: fadeIn var(--duration-normal) var(--ease-out);
  }

  .word-chain-item.current {
    background: var(--color-accent-primary);
    color: white;
    font-weight: 600;
  }

  .word-chain-item.user {
    border: 2px solid var(--color-accent-primary);
  }

  .word-chain-item.ai {
    border: 2px solid var(--color-persona-ferni);
  }

  .word-chain-arrow {
    color: var(--color-text-muted);
  }

  .word-turn {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    padding: var(--space-sm);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  /* Story Builder */
  .story-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .story-chapter {
    padding: var(--space-sm);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    line-height: 1.5;
    max-height: 150px;
    overflow-y: auto;
  }

  .story-progress {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .story-progress svg {
    width: 16px;
    height: 16px;
    color: var(--color-accent-primary);
  }

  /* Would You Rather */
  .wyr-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .wyr-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .wyr-option {
    padding: var(--space-md);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    text-align: center;
    border: 2px solid transparent;
    transition: border-color var(--duration-fast);
  }

  .wyr-option.selected {
    border-color: var(--color-accent-primary);
    background: var(--color-accent-primary-10);
  }

  .wyr-or {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .wyr-round {
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  /* Generic Game Container (for new game types) */
  .generic-game-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-md);
  }

  .generic-game-prompt {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    text-align: center;
    font-style: italic;
    padding: var(--space-md);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    width: 100%;
  }

  .generic-game-status {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-sm);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  /* Win/Complete state */
  .game-complete {
    text-align: center;
    padding: var(--space-lg);
  }

  .game-complete svg {
    width: 48px;
    height: 48px;
    color: var(--color-semantic-success);
    margin-bottom: var(--space-sm);
  }

  .game-complete-text {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  /* Animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  /* Connection status indicators */
  .game-board-container.disconnected {
    border-color: var(--color-semantic-error);
    opacity: 0.85;
  }

  .game-board-container.stale {
    border-color: var(--color-semantic-warning);
  }

  .game-connection-banner {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    animation: fadeIn var(--duration-normal) ease-out;
  }

  .game-connection-banner--error {
    background: var(--color-semantic-error-bg, rgba(239, 68, 68, 0.1));
    color: var(--color-semantic-error);
    border: 1px solid var(--color-semantic-error);
  }

  .game-connection-banner--warning {
    background: var(--color-semantic-warning-bg, rgba(245, 158, 11, 0.1));
    color: var(--color-semantic-warning);
    border: 1px solid var(--color-semantic-warning);
  }

  .game-connection-banner svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Abandoned game state */
  .game-abandoned {
    text-align: center;
    padding: var(--space-lg);
    color: var(--color-text-muted);
  }

  .game-abandoned-icon {
    margin-bottom: var(--space-md);
    color: var(--color-text-dimmed);
  }

  .game-abandoned-text {
    font-size: var(--text-md);
    margin-bottom: var(--space-sm);
  }

  .game-abandoned-subtext {
    font-size: var(--text-sm);
    color: var(--color-text-dimmed);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .game-board-container {
      transition: opacity var(--duration-fast);
    }

    .ttt-cell.winning {
      animation: none;
    }

    .word-chain-item {
      animation: none;
    }

    .game-connection-banner {
      animation: none;
    }
  }
`;

// ============================================================================
// SVG ICON CREATORS (Safe DOM construction)
// ============================================================================

function createXIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '18');
  line1.setAttribute('y1', '6');
  line1.setAttribute('x2', '6');
  line1.setAttribute('y2', '18');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '6');
  line2.setAttribute('y1', '6');
  line2.setAttribute('x2', '18');
  line2.setAttribute('y2', '18');
  svg.appendChild(line2);

  return svg;
}

function createOIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '8');
  svg.appendChild(circle);

  return svg;
}

function createCheckIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '20 6 9 17 4 12');
  svg.appendChild(polyline);

  return svg;
}

function createCloseIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '18');
  line1.setAttribute('y1', '6');
  line1.setAttribute('x2', '6');
  line1.setAttribute('y2', '18');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '6');
  line2.setAttribute('y1', '6');
  line2.setAttribute('x2', '18');
  line2.setAttribute('y2', '18');
  svg.appendChild(line2);

  return svg;
}

function createQuestionIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  svg.appendChild(circle);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3');
  svg.appendChild(path);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '12');
  line.setAttribute('y1', '17');
  line.setAttribute('x2', '12.01');
  line.setAttribute('y2', '17');
  svg.appendChild(line);

  return svg;
}

function createLinkIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71');
  svg.appendChild(path1);

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');
  svg.appendChild(path2);

  return svg;
}

function createBookIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20');
  svg.appendChild(path1);

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z');
  svg.appendChild(path2);

  return svg;
}

function createTrophyIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');

  const paths = [
    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
    'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
    'M4 22h16',
    'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
    'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
    'M18 2H6v7a6 6 0 0 0 12 0V2Z',
  ];

  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

function createStarIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
  );
  svg.appendChild(path);

  return svg;
}

function getGameIcon(gameType: GameType | null): SVGSVGElement | null {
  if (!gameType) return null;

  switch (gameType) {
    case 'tic-tac-toe':
      return createXIcon();
    case '20-questions':
    case 'would-you-rather':
      return createQuestionIcon();
    case 'word-association':
    case 'three-word-day':
    case 'one-word-checkin':
      return createLinkIcon();
    case 'story-builder':
    case 'headline-writer':
      return createBookIcon();
    case 'emoji-story':
    case 'fortune-cookie':
    case 'tiny-win-tracker':
    case 'values-card-sort':
      return createStarIcon();
    default:
      return null;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the game board UI
 */
export function initGameBoard(): void {
  // Inject styles
  if (!document.getElementById('game-board-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'game-board-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Create container
  container = document.createElement('div');
  container.className = 'game-board-container';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Game board');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);

  // Listen for game events
  document.addEventListener('ferni:game-started', handleGameStarted as EventListener);
  document.addEventListener('ferni:game-state-update', handleGameStateUpdate as EventListener);
  document.addEventListener('ferni:game-ended', handleGameEnded as EventListener);

  // Listen for connection events
  document.addEventListener('ferni:disconnected', handleDisconnected);
  document.addEventListener('ferni:connected', handleReconnected);

  // Start stale state checking (checks every 5 seconds when a game is active)
  staleCheckInterval = setInterval(checkStaleState, 5000);

  log.info('Game board UI initialized');
}

/**
 * Clean up game board UI
 */
export function destroyGameBoard(): void {
  // Remove game event listeners
  document.removeEventListener('ferni:game-started', handleGameStarted as EventListener);
  document.removeEventListener('ferni:game-state-update', handleGameStateUpdate as EventListener);
  document.removeEventListener('ferni:game-ended', handleGameEnded as EventListener);

  // Remove connection event listeners
  document.removeEventListener('ferni:disconnected', handleDisconnected);
  document.removeEventListener('ferni:connected', handleReconnected);

  // Kill any running GSAP animations
  if (currentTween) {
    currentTween.kill();
    currentTween = null;
  }

  // Clear timeouts and intervals
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
    autoHideTimeout = null;
  }
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }

  // Reset state
  isDisconnected = false;
  lastUpdateTimestamp = null;
  currentGameType = null;
  isVisible = false;

  // Remove DOM elements
  container?.remove();
  container = null;

  const stylesEl = document.getElementById('game-board-styles');
  stylesEl?.remove();

  log.info('Game board UI destroyed');
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleGameStarted(event: CustomEvent<GameStartEvent>): void {
  const { gameType, gameName } = event.detail;
  log.debug({ gameType, gameName }, 'Game started');

  currentGameType = normalizeGameType(gameType);
  lastUpdateTimestamp = Date.now();
  isDisconnected = false;

  // Clear any existing disconnection/stale indicators
  container?.classList.remove('disconnected', 'stale');
  removeConnectionBanner();

  if (currentGameType) {
    showBoard();
    renderEmptyState(currentGameType, gameName);
  }
}

function handleGameStateUpdate(event: CustomEvent<GameState>): void {
  const state = event.detail;
  log.debug({ gameType: state.gameType, status: state.status }, 'Game state update');

  // Normalize gameType defensively (in case backend sends a variant)
  const normalizedType = normalizeGameType(state.gameType);
  if (!normalizedType) {
    log.warn({ gameType: state.gameType }, 'Unknown game type received, ignoring update');
    return;
  }

  // Update state with normalized type
  const normalizedState: GameState = {
    ...state,
    gameType: normalizedType,
  };

  // Update timestamp for stale detection
  lastUpdateTimestamp = Date.now();

  // Clear stale indicator if it was showing
  container?.classList.remove('stale');
  removeConnectionBanner();

  if (normalizedState.status === 'completed') {
    renderCompleteState(normalizedState);
    return;
  }

  if (normalizedState.status === 'abandoned') {
    renderAbandonedState(normalizedState);
    return;
  }

  renderGameState(normalizedState);
}

function handleGameEnded(_event: CustomEvent): void {
  log.debug('Game ended');
  hideBoard();
  currentGameType = null;
  lastUpdateTimestamp = null;
}

/**
 * Handle connection lost
 */
function handleDisconnected(): void {
  if (!isVisible || !container) return;

  isDisconnected = true;
  container.classList.add('disconnected');
  container.classList.remove('stale');

  // Show disconnection banner
  showConnectionBanner('error', 'Connection lost. Game state may be stale.');

  log.warn('Game board: Connection lost');
}

/**
 * Handle connection restored
 */
function handleReconnected(): void {
  if (!container) return;

  isDisconnected = false;
  container.classList.remove('disconnected', 'stale');
  removeConnectionBanner();

  log.info('Game board: Connection restored');
}

/**
 * Check for stale game state (no updates for CONFIG.staleTimeoutMs)
 */
function checkStaleState(): void {
  if (!isVisible || !lastUpdateTimestamp || isDisconnected) return;

  const timeSinceUpdate = Date.now() - lastUpdateTimestamp;
  if (timeSinceUpdate > CONFIG.staleTimeoutMs) {
    container?.classList.add('stale');
    showConnectionBanner('warning', 'No updates received. Game state may be outdated.');
    log.warn({ timeSinceUpdate }, 'Game board: State appears stale');
  }
}

/**
 * Show a connection status banner in the game board
 */
function showConnectionBanner(type: 'error' | 'warning', message: string): void {
  if (!container) return;

  // Remove existing banner first
  removeConnectionBanner();

  const banner = document.createElement('div');
  banner.className = `game-connection-banner game-connection-banner--${type}`;
  banner.setAttribute('role', 'alert');

  // Add icon
  const icon = type === 'error' ? createDisconnectIcon() : createWarningIcon();
  banner.appendChild(icon);

  // Add message
  const text = document.createElement('span');
  text.textContent = message;
  banner.appendChild(text);

  // Insert after header
  const header = container.querySelector('.game-board-header');
  if (header && header.nextSibling) {
    container.insertBefore(banner, header.nextSibling);
  } else if (header) {
    header.after(banner);
  } else {
    container.prepend(banner);
  }
}

/**
 * Remove the connection status banner
 */
function removeConnectionBanner(): void {
  container?.querySelector('.game-connection-banner')?.remove();
}

/**
 * Create a disconnect icon (broken link)
 */
function createDisconnectIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  // X circle icon
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  svg.appendChild(circle);

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '15');
  line1.setAttribute('y1', '9');
  line1.setAttribute('x2', '9');
  line1.setAttribute('y2', '15');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '9');
  line2.setAttribute('y1', '9');
  line2.setAttribute('x2', '15');
  line2.setAttribute('y2', '15');
  svg.appendChild(line2);

  return svg;
}

/**
 * Create a warning icon (triangle with exclamation)
 */
function createWarningIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
  svg.appendChild(path);

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '12');
  line1.setAttribute('y1', '9');
  line1.setAttribute('x2', '12');
  line1.setAttribute('y2', '13');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '12');
  line2.setAttribute('y1', '17');
  line2.setAttribute('x2', '12.01');
  line2.setAttribute('y2', '17');
  svg.appendChild(line2);

  return svg;
}

// ============================================================================
// RENDERING (Safe DOM construction)
// ============================================================================

function normalizeGameType(type: string): GameType | null {
  // Case-insensitive mapping for robustness
  const lowered = type.toLowerCase();
  const mapping: Record<string, GameType> = {
    'tic-tac-toe': 'tic-tac-toe',
    'tictactoe': 'tic-tac-toe',
    '20-questions': '20-questions',
    'twenty-questions': '20-questions',
    'twentyquestions': '20-questions',
    'word-association': 'word-association',
    'wordassociation': 'word-association',
    'story-builder': 'story-builder',
    'storybuilder': 'story-builder',
    'would-you-rather': 'would-you-rather',
    'wouldyourather': 'would-you-rather',
    'three-word-day': 'three-word-day',
    'threewordday': 'three-word-day',
    'headline-writer': 'headline-writer',
    'headlinewriter': 'headline-writer',
    'emoji-story': 'emoji-story',
    'emojistory': 'emoji-story',
    'values-card-sort': 'values-card-sort',
    'valuescardsort': 'values-card-sort',
    'one-word-checkin': 'one-word-checkin',
    'onewordcheckin': 'one-word-checkin',
    'tiny-win-tracker': 'tiny-win-tracker',
    'tinywintracker': 'tiny-win-tracker',
    'fortune-cookie': 'fortune-cookie',
    'fortunecookie': 'fortune-cookie',
  };

  return mapping[lowered] || null;
}

function clearContainer(): void {
  if (!container) return;
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

function createHeader(title: string, status: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'game-board-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'game-board-title';

  const icon = getGameIcon(currentGameType);
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'game-icon';
    iconSpan.appendChild(icon);
    titleEl.appendChild(iconSpan);
  }

  const titleText = document.createElement('span');
  titleText.textContent = title;
  titleEl.appendChild(titleText);

  const statusEl = document.createElement('span');
  statusEl.className = 'game-board-status';
  statusEl.textContent = status;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'game-board-close';
  closeBtn.setAttribute('aria-label', 'Close game board');
  closeBtn.appendChild(createCloseIcon());
  closeBtn.addEventListener('click', () => {
    hideBoard();
    currentGameType = null;
  });

  header.appendChild(titleEl);
  header.appendChild(statusEl);
  header.appendChild(closeBtn);

  return header;
}

function getGameName(gameType: GameType): string {
  const names: Record<GameType, string> = {
    'tic-tac-toe': 'Tic-Tac-Toe',
    '20-questions': '20 Questions',
    'word-association': 'Word Association',
    'story-builder': 'Story Builder',
    'would-you-rather': 'Would You Rather',
    'three-word-day': 'Three Word Day',
    'headline-writer': 'Headline Writer',
    'emoji-story': 'Emoji Story',
    'values-card-sort': 'Values Card Sort',
    'one-word-checkin': 'One Word Check-in',
    'tiny-win-tracker': 'Tiny Win Tracker',
    'fortune-cookie': 'Fortune Cookie',
  };
  return names[gameType] || gameType;
}

function renderEmptyState(gameType: GameType, gameName: string): void {
  if (!container) return;

  clearContainer();
  container.appendChild(createHeader(gameName, 'Starting...'));

  switch (gameType) {
    case 'tic-tac-toe':
      container.appendChild(renderEmptyTicTacToe());
      break;
    case '20-questions':
      container.appendChild(renderEmpty20Questions());
      break;
    case 'word-association':
      container.appendChild(renderEmptyWordAssociation());
      break;
    case 'story-builder':
      container.appendChild(renderEmptyStoryBuilder());
      break;
    case 'would-you-rather':
      container.appendChild(renderEmptyWouldYouRather());
      break;
    case 'three-word-day':
      container.appendChild(renderEmptyThreeWordDay());
      break;
    case 'headline-writer':
      container.appendChild(renderEmptyHeadlineWriter());
      break;
    case 'emoji-story':
      container.appendChild(renderEmptyEmojiStory());
      break;
    case 'values-card-sort':
      container.appendChild(renderEmptyValuesCardSort());
      break;
    case 'one-word-checkin':
      container.appendChild(renderEmptyOneWordCheckin());
      break;
    case 'tiny-win-tracker':
      container.appendChild(renderEmptyTinyWinTracker());
      break;
    case 'fortune-cookie':
      container.appendChild(renderEmptyFortuneCookie());
      break;
  }
}

function renderGameState(state: GameState): void {
  if (!container) return;

  clearContainer();
  const gameName = getGameName(state.gameType);
  const status = state.status === 'active' ? 'Playing' : state.status;
  container.appendChild(createHeader(gameName, status));

  switch (state.gameType) {
    case 'tic-tac-toe':
      container.appendChild(renderTicTacToe(state.gameData as TicTacToeState));
      break;
    case '20-questions':
      container.appendChild(render20Questions(state.gameData as TwentyQuestionsState));
      break;
    case 'word-association':
      container.appendChild(renderWordAssociation(state.gameData as WordAssociationState));
      break;
    case 'story-builder':
      container.appendChild(renderStoryBuilder(state.gameData as StoryBuilderState));
      break;
    case 'would-you-rather':
      container.appendChild(renderWouldYouRather(state.gameData as WouldYouRatherState));
      break;
    case 'three-word-day':
      container.appendChild(renderThreeWordDay(state.gameData as ThreeWordDayState));
      break;
    case 'headline-writer':
      container.appendChild(renderHeadlineWriter(state.gameData as HeadlineWriterState));
      break;
    case 'emoji-story':
      container.appendChild(renderEmojiStory(state.gameData as EmojiStoryState));
      break;
    case 'values-card-sort':
      container.appendChild(renderValuesCardSort(state.gameData as ValuesCardSortState));
      break;
    case 'one-word-checkin':
      container.appendChild(renderOneWordCheckin(state.gameData as OneWordCheckinState));
      break;
    case 'tiny-win-tracker':
      container.appendChild(renderTinyWinTracker(state.gameData as TinyWinTrackerState));
      break;
    case 'fortune-cookie':
      container.appendChild(renderFortuneCookie(state.gameData as FortuneCookieState));
      break;
  }
}

/**
 * Get a personalized completion message for each game type
 */
function getCompletionMessage(state: GameState): string {
  switch (state.gameType) {
    case 'tic-tac-toe': {
      const tttState = state.gameData as TicTacToeState;
      if (tttState.winner === 'draw') return "It's a draw! Well played.";
      if (tttState.winner === tttState.userSymbol) return 'You won! Great strategy.';
      return 'Ferni won! Good game.';
    }
    case '20-questions': {
      const twentyQ = state.gameData as TwentyQuestionsState;
      return twentyQ.guessedCorrectly ? 'You guessed it! Well done.' : "Time's up! Better luck next time.";
    }
    case 'word-association': {
      const wordState = state.gameData as WordAssociationState;
      const chainLength = wordState.chain?.length || 0;
      return chainLength > 5 ? `Amazing chain of ${chainLength} words!` : 'Nice word chain!';
    }
    case 'story-builder': {
      const storyState = state.gameData as StoryBuilderState;
      const chapters = storyState.chapters?.length || 0;
      return chapters > 3 ? 'Epic tale complete!' : 'Story complete!';
    }
    case 'would-you-rather': {
      const wyrState = state.gameData as WouldYouRatherState;
      const rounds = wyrState.roundNumber || 0;
      return rounds > 5 ? 'Great choices revealed!' : 'Interesting choices!';
    }
    case 'three-word-day':
      return 'Your three words captured. Time for reflection.';
    case 'headline-writer':
      return 'Future headlines written! What story awaits?';
    case 'emoji-story':
      return 'Your emoji story is complete!';
    case 'values-card-sort': {
      const valuesState = state.gameData as ValuesCardSortState;
      const topFive = valuesState.topFive?.length || 0;
      return topFive >= 5 ? 'Your core values identified!' : 'Values exploration complete.';
    }
    case 'one-word-checkin':
      return 'Check-in complete. How do you feel now?';
    case 'tiny-win-tracker': {
      const winsState = state.gameData as TinyWinTrackerState;
      const wins = winsState.wins?.length || 0;
      return wins > 0 ? `${wins} wins celebrated! Keep going.` : 'Session complete!';
    }
    case 'fortune-cookie':
      return 'May your fortune guide you.';
    default:
      return 'Game complete!';
  }
}

function renderCompleteState(state: GameState): void {
  if (!container) return;

  clearContainer();
  const gameName = getGameName(state.gameType);
  container.appendChild(createHeader(gameName, 'Complete'));

  const message = getCompletionMessage(state);

  const completeEl = document.createElement('div');
  completeEl.className = 'game-complete';
  completeEl.appendChild(createTrophyIcon());

  const textEl = document.createElement('div');
  textEl.className = 'game-complete-text';
  textEl.textContent = message;
  completeEl.appendChild(textEl);

  container.appendChild(completeEl);

  // Clear any existing auto-hide timeout
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
  }

  // Auto-hide after a delay (configurable)
  autoHideTimeout = setTimeout(() => {
    hideBoard();
    currentGameType = null;
    autoHideTimeout = null;
  }, CONFIG.autoHideDelayMs);
}

/**
 * Render abandoned game state
 */
function renderAbandonedState(state: GameState): void {
  if (!container) return;

  clearContainer();
  const gameName = getGameName(state.gameType);
  container.appendChild(createHeader(gameName, 'Ended'));

  const abandonedEl = document.createElement('div');
  abandonedEl.className = 'game-abandoned';

  // Icon container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'game-abandoned-icon';
  const icon = createPauseIcon();
  icon.setAttribute('width', '32');
  icon.setAttribute('height', '32');
  iconContainer.appendChild(icon);
  abandonedEl.appendChild(iconContainer);

  // Main text
  const textEl = document.createElement('div');
  textEl.className = 'game-abandoned-text';
  textEl.textContent = 'Game ended early';
  abandonedEl.appendChild(textEl);

  // Subtext
  const subtextEl = document.createElement('div');
  subtextEl.className = 'game-abandoned-subtext';
  subtextEl.textContent = 'You can start a new game anytime!';
  abandonedEl.appendChild(subtextEl);

  container.appendChild(abandonedEl);

  // Clear any existing auto-hide timeout
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
  }

  // Auto-hide after a delay
  autoHideTimeout = setTimeout(() => {
    hideBoard();
    currentGameType = null;
    autoHideTimeout = null;
  }, CONFIG.autoHideDelayMs);
}

/**
 * Create a pause icon for abandoned state
 */
function createPauseIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  svg.appendChild(circle);

  const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '10');
  line1.setAttribute('y1', '15');
  line1.setAttribute('x2', '10');
  line1.setAttribute('y2', '9');
  svg.appendChild(line1);

  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '14');
  line2.setAttribute('y1', '15');
  line2.setAttribute('x2', '14');
  line2.setAttribute('y2', '9');
  svg.appendChild(line2);

  return svg;
}

// ============================================================================
// TIC-TAC-TOE RENDERER
// ============================================================================

function renderEmptyTicTacToe(): HTMLElement {
  const wrapper = document.createElement('div');

  const grid = document.createElement('div');
  grid.className = 'ttt-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Tic-tac-toe board');

  for (let i = 0; i < CONFIG.ticTacToeGridSize; i++) {
    const cell = document.createElement('div');
    cell.className = 'ttt-cell';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Cell ${i + 1}, empty`);
    grid.appendChild(cell);
  }

  const turn = document.createElement('div');
  turn.className = 'ttt-turn-indicator';
  turn.textContent = 'Waiting for game to start...';

  wrapper.appendChild(grid);
  wrapper.appendChild(turn);

  return wrapper;
}

function renderTicTacToe(state: TicTacToeState): HTMLElement {
  const wrapper = document.createElement('div');
  const winningCells = getWinningCells(state);

  const grid = document.createElement('div');
  grid.className = 'ttt-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Tic-tac-toe board');

  state.board.forEach((cell, i) => {
    const isWinning = winningCells.includes(i);
    const cellEl = document.createElement('div');
    cellEl.className = 'ttt-cell';
    if (cell) cellEl.classList.add(cell.toLowerCase());
    if (isWinning) cellEl.classList.add('winning');
    cellEl.setAttribute('role', 'gridcell');

    const label = cell
      ? `Cell ${i + 1}, ${cell === state.userSymbol ? 'your' : "Ferni's"} ${cell}`
      : `Cell ${i + 1}, empty`;
    cellEl.setAttribute('aria-label', label);

    if (cell === 'X') {
      cellEl.appendChild(createXIcon());
    } else if (cell === 'O') {
      cellEl.appendChild(createOIcon());
    }

    grid.appendChild(cellEl);
  });

  const turn = document.createElement('div');
  turn.className = 'ttt-turn-indicator';
  turn.setAttribute('aria-live', 'polite');

  if (state.winner) {
    if (state.winner === 'draw') {
      turn.textContent = "It's a draw!";
    } else if (state.winner === state.userSymbol) {
      turn.textContent = 'You won!';
    } else {
      turn.textContent = 'Ferni won!';
    }
  } else {
    const strong = document.createElement('strong');
    strong.textContent = state.currentPlayer === state.userSymbol ? 'Your turn' : "Ferni's turn";
    turn.appendChild(strong);
  }

  wrapper.appendChild(grid);
  wrapper.appendChild(turn);

  return wrapper;
}

function getWinningCells(state: TicTacToeState): number[] {
  if (!state.winner || state.winner === 'draw') return [];

  const winPatterns: [number, number, number][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // cols
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ];

  for (const pattern of winPatterns) {
    const a = pattern[0];
    const b = pattern[1];
    const c = pattern[2];
    if (
      state.board[a] &&
      state.board[a] === state.board[b] &&
      state.board[a] === state.board[c]
    ) {
      return pattern;
    }
  }

  return [];
}

// ============================================================================
// 20 QUESTIONS RENDERER
// ============================================================================

function renderEmpty20Questions(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'twenty-q-container';

  const progress = document.createElement('div');
  progress.className = 'twenty-q-progress';

  const progressBar = document.createElement('div');
  progressBar.className = 'twenty-q-progress-bar';

  const progressFill = document.createElement('div');
  progressFill.className = 'twenty-q-progress-fill';
  progressFill.style.width = '0%';
  progressBar.appendChild(progressFill);

  const count = document.createElement('span');
  count.className = 'twenty-q-count';
  count.textContent = `0/${CONFIG.defaultMaxQuestions}`;

  progress.appendChild(progressBar);
  progress.appendChild(count);

  const history = document.createElement('div');
  history.className = 'twenty-q-history';
  history.setAttribute('aria-label', 'Answer history');

  const hint = document.createElement('span');
  hint.style.cssText = 'color: var(--color-text-muted); font-size: var(--text-sm);';
  hint.textContent = 'Ask yes/no questions to guess what Ferni is thinking of!';
  history.appendChild(hint);

  wrapper.appendChild(progress);
  wrapper.appendChild(history);

  return wrapper;
}

function render20Questions(state: TwentyQuestionsState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'twenty-q-container';

  const maxQ = state.maxQuestions || CONFIG.defaultMaxQuestions;
  const progressPercent = (state.questionNumber / maxQ) * 100;

  const progress = document.createElement('div');
  progress.className = 'twenty-q-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuenow', String(state.questionNumber));
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(maxQ));

  const progressBar = document.createElement('div');
  progressBar.className = 'twenty-q-progress-bar';

  const progressFill = document.createElement('div');
  progressFill.className = 'twenty-q-progress-fill';
  progressFill.style.width = `${progressPercent}%`;
  progressBar.appendChild(progressFill);

  const count = document.createElement('span');
  count.className = 'twenty-q-count';
  count.textContent = `${state.questionNumber}/${maxQ}`;

  progress.appendChild(progressBar);
  progress.appendChild(count);

  const history = document.createElement('div');
  history.className = 'twenty-q-history';
  history.setAttribute('aria-label', 'Answer history');

  if (state.answers.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color: var(--color-text-muted);';
    empty.textContent = 'No questions asked yet';
    history.appendChild(empty);
  } else {
    state.answers.forEach((answer, i) => {
      const question = state.questionsAsked[i];
      const answerEl = document.createElement('div');
      answerEl.className = `twenty-q-answer ${answer}`;
      answerEl.title = question || '';
      answerEl.setAttribute('aria-label', `Question ${i + 1}: ${answer}`);

      if (answer === 'yes') {
        answerEl.appendChild(createCheckIcon());
      } else if (answer === 'no') {
        answerEl.appendChild(createCloseIcon());
      } else {
        answerEl.appendChild(createQuestionIcon());
      }

      const shortQ = question && question.length > 30 ? question.slice(0, 30) + '...' : question || '';
      const textSpan = document.createElement('span');
      textSpan.textContent = shortQ;
      answerEl.appendChild(textSpan);

      history.appendChild(answerEl);
    });
  }

  wrapper.appendChild(progress);
  wrapper.appendChild(history);

  return wrapper;
}

// ============================================================================
// WORD ASSOCIATION RENDERER
// ============================================================================

function renderEmptyWordAssociation(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'word-chain-container';

  const chain = document.createElement('div');
  chain.className = 'word-chain';
  chain.setAttribute('aria-label', 'Word chain');

  const hint = document.createElement('span');
  hint.style.cssText = 'color: var(--color-text-muted); font-size: var(--text-sm);';
  hint.textContent = 'Say a word related to the previous one!';
  chain.appendChild(hint);

  const turn = document.createElement('div');
  turn.className = 'word-turn';
  turn.textContent = 'Waiting for the first word...';

  wrapper.appendChild(chain);
  wrapper.appendChild(turn);

  return wrapper;
}

function renderWordAssociation(state: WordAssociationState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'word-chain-container';

  const chain = document.createElement('div');
  chain.className = 'word-chain';
  chain.setAttribute('aria-label', 'Word chain');

  if (state.chain.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color: var(--color-text-muted);';
    empty.textContent = 'Chain is empty';
    chain.appendChild(empty);
  } else {
    state.chain.forEach((word, i) => {
      const isCurrent = i === state.chain.length - 1;
      const isUser = i % 2 === 0; // Assuming user starts

      const wordEl = document.createElement('span');
      wordEl.className = 'word-chain-item';
      if (isCurrent) wordEl.classList.add('current');
      wordEl.classList.add(isUser ? 'user' : 'ai');
      wordEl.setAttribute('aria-label', `${word}${isCurrent ? ' (current)' : ''}`);
      wordEl.textContent = word;
      chain.appendChild(wordEl);

      if (i < state.chain.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'word-chain-arrow';
        arrow.textContent = '\u2192'; // Right arrow
        chain.appendChild(arrow);
      }
    });
  }

  const turn = document.createElement('div');
  turn.className = 'word-turn';
  turn.setAttribute('aria-live', 'polite');
  turn.textContent = `${state.isUserTurn ? 'Your turn!' : "Ferni's turn..."} (Turn ${state.turnCount})`;

  wrapper.appendChild(chain);
  wrapper.appendChild(turn);

  return wrapper;
}

// ============================================================================
// STORY BUILDER RENDERER
// ============================================================================

function renderEmptyStoryBuilder(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'story-container';

  const chapter = document.createElement('div');
  chapter.className = 'story-chapter';
  chapter.setAttribute('aria-label', 'Story content');

  const hint = document.createElement('span');
  hint.style.cssText = 'color: var(--color-text-muted);';
  hint.textContent = 'Build a story together! Take turns adding to the narrative.';
  chapter.appendChild(hint);

  const progress = document.createElement('div');
  progress.className = 'story-progress';
  progress.appendChild(createBookIcon());

  const chapterText = document.createElement('span');
  chapterText.textContent = 'Chapter 1';
  progress.appendChild(chapterText);

  wrapper.appendChild(chapter);
  wrapper.appendChild(progress);

  return wrapper;
}

function renderStoryBuilder(state: StoryBuilderState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'story-container';

  if (state.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'story-title';
    titleEl.style.cssText = 'font-weight: 600; margin-bottom: var(--space-sm);';
    titleEl.textContent = state.title;
    wrapper.appendChild(titleEl);
  }

  const chapter = document.createElement('div');
  chapter.className = 'story-chapter';
  chapter.setAttribute('aria-label', 'Current story chapter');

  const currentText = state.chapters[state.currentChapter - 1] || '';
  if (currentText) {
    chapter.textContent = currentText;
  } else {
    const empty = document.createElement('span');
    empty.style.cssText = 'color: var(--color-text-muted);';
    empty.textContent = 'Story is just beginning...';
    chapter.appendChild(empty);
  }

  const progress = document.createElement('div');
  progress.className = 'story-progress';
  progress.appendChild(createBookIcon());

  const chapterText = document.createElement('span');
  chapterText.textContent = `Chapter ${state.currentChapter}${state.genre ? ` | ${state.genre}` : ''}`;
  progress.appendChild(chapterText);

  const turn = document.createElement('div');
  turn.className = 'word-turn';
  turn.setAttribute('aria-live', 'polite');
  turn.textContent = state.isUserTurn ? 'Your turn to add to the story!' : "Ferni's turn...";

  wrapper.appendChild(chapter);
  wrapper.appendChild(progress);
  wrapper.appendChild(turn);

  return wrapper;
}

// ============================================================================
// WOULD YOU RATHER RENDERER
// ============================================================================

function renderEmptyWouldYouRather(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'wyr-container';

  const options = document.createElement('div');
  options.className = 'wyr-options';
  options.setAttribute('aria-label', 'Options');

  const optionA = document.createElement('div');
  optionA.className = 'wyr-option';
  const hintA = document.createElement('span');
  hintA.style.cssText = 'color: var(--color-text-muted);';
  hintA.textContent = 'Option A will appear here';
  optionA.appendChild(hintA);

  const or = document.createElement('div');
  or.className = 'wyr-or';
  or.textContent = 'or';

  const optionB = document.createElement('div');
  optionB.className = 'wyr-option';
  const hintB = document.createElement('span');
  hintB.style.cssText = 'color: var(--color-text-muted);';
  hintB.textContent = 'Option B will appear here';
  optionB.appendChild(hintB);

  options.appendChild(optionA);
  options.appendChild(or);
  options.appendChild(optionB);

  const round = document.createElement('div');
  round.className = 'wyr-round';
  round.textContent = 'Waiting for question...';

  wrapper.appendChild(options);
  wrapper.appendChild(round);

  return wrapper;
}

function renderWouldYouRather(state: WouldYouRatherState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'wyr-container';

  const question = state.currentQuestion;

  if (!question) {
    return renderEmptyWouldYouRather();
  }

  const options = document.createElement('div');
  options.className = 'wyr-options';
  options.setAttribute('aria-label', 'Would you rather options');

  const optionA = document.createElement('div');
  optionA.className = 'wyr-option';
  optionA.setAttribute('aria-label', `Option A: ${question.optionA}`);
  optionA.textContent = question.optionA;

  const or = document.createElement('div');
  or.className = 'wyr-or';
  or.textContent = 'or';

  const optionB = document.createElement('div');
  optionB.className = 'wyr-option';
  optionB.setAttribute('aria-label', `Option B: ${question.optionB}`);
  optionB.textContent = question.optionB;

  options.appendChild(optionA);
  options.appendChild(or);
  options.appendChild(optionB);

  const round = document.createElement('div');
  round.className = 'wyr-round';
  round.setAttribute('aria-live', 'polite');
  round.textContent = `Round ${state.roundNumber}`;

  wrapper.appendChild(options);
  wrapper.appendChild(round);

  return wrapper;
}

// ============================================================================
// THREE WORD DAY RENDERER
// ============================================================================

function renderEmptyThreeWordDay(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Think of three words to describe your day...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderThreeWordDay(state: ThreeWordDayState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  // Show words collected so far
  if (state.words && state.words.length > 0) {
    const wordsEl = document.createElement('div');
    wordsEl.className = 'word-chain';
    wordsEl.setAttribute('aria-label', 'Words describing your day');

    state.words.forEach((word, i) => {
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'word-chain-arrow';
        arrow.textContent = '·';
        arrow.setAttribute('aria-hidden', 'true');
        wordsEl.appendChild(arrow);
      }

      const wordEl = document.createElement('span');
      wordEl.className = 'word-chain-item';
      if (i === state.words.length - 1) wordEl.classList.add('current');
      wordEl.textContent = word;
      wordsEl.appendChild(wordEl);
    });

    wrapper.appendChild(wordsEl);
  }

  // Show phase indicator
  const phaseEl = document.createElement('div');
  phaseEl.className = 'generic-game-status';
  if (state.explorationPhase === 'complete') {
    phaseEl.textContent = 'Reflection complete';
  } else if (typeof state.explorationPhase === 'number') {
    phaseEl.textContent = `Exploring word ${state.explorationPhase} of ${state.words.length}`;
  } else {
    phaseEl.textContent = 'Share your three words...';
  }

  wrapper.appendChild(phaseEl);
  return wrapper;
}

// ============================================================================
// HEADLINE WRITER RENDERER
// ============================================================================

function renderEmptyHeadlineWriter(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Write a headline about your future...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderHeadlineWriter(state: HeadlineWriterState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'story-container';

  // Show previous headlines
  if (state.headlines && state.headlines.length > 0) {
    state.headlines.forEach((headline) => {
      const headlineEl = document.createElement('div');
      headlineEl.className = 'story-chapter';

      const titleEl = document.createElement('strong');
      titleEl.textContent = headline.text;
      headlineEl.appendChild(titleEl);

      if (headline.subheadline) {
        const subEl = document.createElement('div');
        subEl.textContent = headline.subheadline;
        subEl.style.opacity = '0.8';
        subEl.style.marginTop = 'var(--space-xs)';
        headlineEl.appendChild(subEl);
      }

      wrapper.appendChild(headlineEl);
    });
  }

  // Show current phase
  const phaseEl = document.createElement('div');
  phaseEl.className = 'story-progress';
  const icon = createBookIcon();
  phaseEl.appendChild(icon);

  const statusEl = document.createElement('span');
  statusEl.textContent = state.currentTimeframe
    ? `Writing for: ${state.currentTimeframe}`
    : 'Thinking about the future...';
  phaseEl.appendChild(statusEl);

  wrapper.appendChild(phaseEl);
  return wrapper;
}

// ============================================================================
// EMOJI STORY RENDERER
// ============================================================================

function renderEmptyEmojiStory(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Tell your story with emojis...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderEmojiStory(state: EmojiStoryState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  // Show emojis collected
  if (state.emojis && state.emojis.length > 0) {
    const emojisEl = document.createElement('div');
    emojisEl.className = 'word-chain';
    emojisEl.setAttribute('aria-label', 'Emojis in your story');
    emojisEl.style.fontSize = 'var(--text-xl)';

    state.emojis.forEach((emoji) => {
      const emojiEl = document.createElement('span');
      emojiEl.className = 'word-chain-item';
      emojiEl.textContent = emoji;
      emojiEl.style.background = 'transparent';
      emojisEl.appendChild(emojiEl);
    });

    wrapper.appendChild(emojisEl);
  }

  // Show phase
  const phaseEl = document.createElement('div');
  phaseEl.className = 'generic-game-status';
  if (state.currentPhase === 'complete' && state.storyNarrative) {
    phaseEl.textContent = 'Story complete!';
  } else if (state.currentPhase === 'interpreting') {
    phaseEl.textContent = 'Interpreting your story...';
  } else {
    phaseEl.textContent = 'Share your emojis...';
  }

  wrapper.appendChild(phaseEl);
  return wrapper;
}

// ============================================================================
// VALUES CARD SORT RENDERER
// ============================================================================

function renderEmptyValuesCardSort(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Discover your core values...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderValuesCardSort(state: ValuesCardSortState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  // Show current card if present
  if (state.currentCard) {
    const cardEl = document.createElement('div');
    cardEl.className = 'story-chapter';
    cardEl.style.textAlign = 'center';

    const nameEl = document.createElement('div');
    nameEl.style.fontWeight = '600';
    nameEl.style.fontSize = 'var(--text-lg)';
    nameEl.textContent = state.currentCard.name;
    cardEl.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.style.opacity = '0.8';
    descEl.style.marginTop = 'var(--space-sm)';
    descEl.textContent = state.currentCard.description;
    cardEl.appendChild(descEl);

    wrapper.appendChild(cardEl);
  }

  // Show progress
  const progressEl = document.createElement('div');
  progressEl.className = 'generic-game-status';
  if (state.phase === 'complete' && state.topFive.length > 0) {
    progressEl.textContent = `Top values: ${state.topFive.map((v) => v.name).join(', ')}`;
  } else if (state.phase === 'ranking') {
    progressEl.textContent = 'Ranking your top values...';
  } else if (state.phase === 'narrowing') {
    progressEl.textContent = `Narrowing down from ${state.importantCount} important values`;
  } else {
    progressEl.textContent = `${state.importantCount} marked as important`;
  }

  wrapper.appendChild(progressEl);
  return wrapper;
}

// ============================================================================
// ONE WORD CHECKIN RENDERER
// ============================================================================

function renderEmptyOneWordCheckin(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'One word to describe how you feel...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderOneWordCheckin(state: OneWordCheckinState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  // Show the word prominently
  if (state.word) {
    const wordEl = document.createElement('div');
    wordEl.className = 'word-chain-item current';
    wordEl.style.fontSize = 'var(--text-xl)';
    wordEl.style.padding = 'var(--space-md) var(--space-lg)';
    wordEl.style.display = 'inline-block';
    wordEl.textContent = state.word;
    wrapper.appendChild(wordEl);
  }

  // Show phase
  const phaseEl = document.createElement('div');
  phaseEl.className = 'generic-game-status';
  if (state.phase === 'complete') {
    phaseEl.textContent = 'Check-in complete';
  } else if (state.phase === 'exploring') {
    phaseEl.textContent = 'Exploring what that means...';
  } else {
    phaseEl.textContent = 'Share one word...';
  }

  wrapper.appendChild(phaseEl);
  return wrapper;
}

// ============================================================================
// TINY WIN TRACKER RENDERER
// ============================================================================

function renderEmptyTinyWinTracker(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Celebrate your small victories...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderTinyWinTracker(state: TinyWinTrackerState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'story-container';

  // Show wins captured
  if (state.wins && state.wins.length > 0) {
    state.wins.forEach((win) => {
      const winEl = document.createElement('div');
      winEl.className = 'story-chapter';

      const starEl = createStarIcon();
      starEl.style.width = '16px';
      starEl.style.height = '16px';
      starEl.style.display = 'inline-block';
      starEl.style.verticalAlign = 'middle';
      starEl.style.marginRight = 'var(--space-sm)';
      starEl.style.color = 'var(--color-semantic-success)';
      winEl.appendChild(starEl);

      const textEl = document.createElement('span');
      textEl.textContent = win;
      winEl.appendChild(textEl);

      wrapper.appendChild(winEl);
    });
  }

  // Show celebration message or phase
  const statusEl = document.createElement('div');
  statusEl.className = 'generic-game-status';
  if (state.celebrationMessage) {
    statusEl.textContent = state.celebrationMessage;
  } else if (state.phase === 'celebrating') {
    statusEl.textContent = 'Celebrating your wins!';
  } else {
    statusEl.textContent = `${state.wins?.length || 0} wins captured`;
  }

  wrapper.appendChild(statusEl);
  return wrapper;
}

// ============================================================================
// FORTUNE COOKIE RENDERER
// ============================================================================

function renderEmptyFortuneCookie(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';

  const prompt = document.createElement('div');
  prompt.className = 'generic-game-prompt';
  prompt.textContent = 'Opening your fortune...';

  wrapper.appendChild(prompt);
  return wrapper;
}

function renderFortuneCookie(state: FortuneCookieState): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'generic-game-container';
  wrapper.style.textAlign = 'center';

  // Show the fortune prominently
  if (state.fortune) {
    const fortuneEl = document.createElement('div');
    fortuneEl.className = 'story-chapter';
    fortuneEl.style.fontStyle = 'italic';
    fortuneEl.style.fontSize = 'var(--text-md)';
    fortuneEl.textContent = `"${state.fortune}"`;
    wrapper.appendChild(fortuneEl);
  }

  // Show phase
  const phaseEl = document.createElement('div');
  phaseEl.className = 'generic-game-status';
  if (state.phase === 'complete') {
    phaseEl.textContent = 'Fortune reflected upon';
  } else if (state.phase === 'reflecting') {
    phaseEl.textContent = 'Reflecting on your fortune...';
  } else {
    phaseEl.textContent = 'Receiving your fortune...';
  }

  wrapper.appendChild(phaseEl);
  return wrapper;
}

// ============================================================================
// VISIBILITY
// ============================================================================

function showBoard(): void {
  if (!container || isVisible) return;

  // Kill any existing animation before starting new one
  if (currentTween) {
    currentTween.kill();
    currentTween = null;
  }

  isVisible = true;
  container.classList.add('visible');

  currentTween = gsap.fromTo(
    container,
    { opacity: 0, y: 20, scale: 0.95 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: DURATION.NORMAL / 1000,
      ease: EASING.SPRING,
      onComplete: () => {
        currentTween = null;
      },
    }
  );

  log.debug('Game board shown');
}

function hideBoard(): void {
  if (!container || !isVisible) return;

  // Kill any existing animation before starting new one
  if (currentTween) {
    currentTween.kill();
    currentTween = null;
  }

  currentTween = gsap.to(container, {
    opacity: 0,
    y: 20,
    scale: 0.95,
    duration: DURATION.FAST / 1000,
    ease: 'power2.in',
    onComplete: () => {
      container?.classList.remove('visible');
      isVisible = false;
      currentTween = null;
    },
  });

  log.debug('Game board hidden');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Manually update the game state (for testing or direct integration)
 */
export function updateGameState(state: GameState): void {
  if (!container) {
    initGameBoard();
  }

  currentGameType = state.gameType;

  if (!isVisible) {
    showBoard();
  }

  if (state.status === 'completed') {
    renderCompleteState(state);
  } else {
    renderGameState(state);
  }
}

/**
 * Check if the game board is currently visible
 */
export function isGameBoardVisible(): boolean {
  return isVisible;
}

/**
 * Get the current game type
 */
export function getCurrentGameType(): GameType | null {
  return currentGameType;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  GameType,
  GameState,
  TicTacToeState,
  TwentyQuestionsState,
  WordAssociationState,
  StoryBuilderState,
  WouldYouRatherState,
};
