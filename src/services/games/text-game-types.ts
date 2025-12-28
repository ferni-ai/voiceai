/**
 * 🎲 Text Games Types
 *
 * Type definitions for text-based/board games (tic-tac-toe, etc.)
 * These games don't require music playback - just conversation.
 */

// Import state types from individual game files for use in TextGameState union
import type { EmojiStoryState } from './emoji-story.js';
import type { OneWordCheckinState } from './one-word-checkin.js';
import type { TinyWinTrackerState } from './tiny-win-tracker.js';
import type { FortuneCookieState } from './fortune-cookie.js';

// Re-export for convenience
export type { EmojiStoryState, OneWordCheckinState, TinyWinTrackerState, FortuneCookieState };

// ============================================================================
// TEXT GAME TYPES
// ============================================================================

export type TextGameType =
  | 'tic-tac-toe' // Classic 3x3 grid game
  | '20-questions' // Guess what I'm thinking of
  | 'word-association' // Say a word related to the last
  | 'would-you-rather' // Choose between two scenarios
  | 'story-builder' // Collaborative story one sentence at a time
  | 'three-word-day' // Describe your day/mood in 3 words
  | 'values-card-sort' // Discover your core values
  | 'headline-writer' // Write headlines about your life
  | 'emoji-story' // Express feelings through emoji sequences
  | 'one-word-checkin' // Single word check-in with follow-up
  | 'tiny-win-tracker' // Celebrate small daily victories
  | 'fortune-cookie'; // Receive and reflect on wisdom

export type TextGameStatus = 'idle' | 'active' | 'completed' | 'draw';

// ============================================================================
// TIC-TAC-TOE
// ============================================================================

export type TicTacToeCell = 'X' | 'O' | null;
export type TicTacToePlayer = 'X' | 'O';

export interface TicTacToeBoard {
  cells: [
    TicTacToeCell,
    TicTacToeCell,
    TicTacToeCell, // Row 1: top-left, top-center, top-right
    TicTacToeCell,
    TicTacToeCell,
    TicTacToeCell, // Row 2: middle-left, center, middle-right
    TicTacToeCell,
    TicTacToeCell,
    TicTacToeCell, // Row 3: bottom-left, bottom-center, bottom-right
  ];
}

export interface TicTacToeState {
  board: TicTacToeBoard;
  currentPlayer: TicTacToePlayer;
  userSymbol: TicTacToePlayer;
  aiSymbol: TicTacToePlayer;
  winner: TicTacToePlayer | 'draw' | null;
  moveHistory: number[];
  difficulty: 'easy' | 'medium' | 'hard';
}

// Position mapping for voice commands
export const POSITION_MAP: Record<string, number> = {
  // Numbered positions (1-9)
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,

  // Descriptive positions
  'top left': 0,
  'top-left': 0,
  'upper left': 0,
  'top center': 1,
  'top-center': 1,
  'top middle': 1,
  top: 1,
  'top right': 2,
  'top-right': 2,
  'upper right': 2,

  'middle left': 3,
  'middle-left': 3,
  'center left': 3,
  left: 3,
  center: 4,
  middle: 4,
  'middle right': 5,
  'middle-right': 5,
  'center right': 5,
  right: 5,

  'bottom left': 6,
  'bottom-left': 6,
  'lower left': 6,
  'bottom center': 7,
  'bottom-center': 7,
  'bottom middle': 7,
  bottom: 7,
  'bottom right': 8,
  'bottom-right': 8,
  'lower right': 8,
};

// ============================================================================
// 20 QUESTIONS
// ============================================================================

export interface TwentyQuestionsState {
  /** The secret thing being guessed (set by AI) */
  secretThing: string;
  /** Category hint */
  category: 'person' | 'place' | 'thing' | 'animal' | 'food';
  /** Questions asked so far */
  questionsAsked: string[];
  /** Answers given */
  answers: Array<'yes' | 'no' | 'maybe'>;
  /** Current question number */
  questionNumber: number;
  /** Did they guess it? */
  guessedCorrectly: boolean | null;
}

// ============================================================================
// WORD ASSOCIATION
// ============================================================================

export interface WordAssociationState {
  /** Chain of words so far */
  chain: string[];
  /** Current word to respond to */
  currentWord: string;
  /** Who's turn */
  isUserTurn: boolean;
  /** Turn count */
  turnCount: number;
  /** Last valid word in the chain */
  lastValidWord: string;
}

// ============================================================================
// WOULD YOU RATHER
// ============================================================================

export interface WouldYouRatherDilemma {
  optionA: string;
  optionB: string;
  chosen?: 'A' | 'B';
}

export interface WouldYouRatherState {
  /** Current dilemma */
  currentDilemma: {
    optionA: string;
    optionB: string;
  };
  /** Current category */
  currentCategory: 'fun' | 'thoughtful' | 'creative' | 'adventure';
  /** Questions answered */
  questionsAnswered: number;
  /** History of choices */
  choiceHistory: WouldYouRatherDilemma[];
}

// ============================================================================
// STORY BUILDER
// ============================================================================

export interface StoryBuilderState {
  /** The story parts so far */
  storyParts: string[];
  /** Genre of the story */
  genre: 'adventure' | 'mystery' | 'fantasy' | 'scifi' | 'slice-of-life';
  /** Turn count */
  turnCount: number;
  /** Is it user's turn */
  isUserTurn: boolean;
  /** Current chapter number */
  currentChapter: number;
}

// ============================================================================
// UNIFIED TEXT GAME STATE
// ============================================================================

// ============================================================================
// THREE WORD DAY
// ============================================================================

export interface ThreeWordDayState {
  /** The prompt type for this session */
  promptType: 'day' | 'mood' | 'week' | 'moment' | 'year' | 'custom';
  /** Custom prompt if provided */
  customPrompt?: string;
  /** The three words provided by user */
  words: string[];
  /** Which word we're currently exploring (0, 1, 2, or 'complete') */
  explorationPhase: number | 'complete';
  /** Insights gathered during exploration */
  insights: string[];
  /** Whether the game has concluded */
  concluded: boolean;
}

// ============================================================================
// VALUES CARD SORT
// ============================================================================

export interface ValueCard {
  id: string;
  name: string;
  description: string;
  category: 'relationships' | 'achievement' | 'growth' | 'wellbeing' | 'meaning' | 'pleasure';
}

export interface ValuesCardSortState {
  /** Current phase of the game */
  phase: 'intro' | 'sorting' | 'narrowing' | 'ranking' | 'reflection' | 'complete';
  /** All cards in the deck */
  deck: ValueCard[];
  /** Cards sorted as "important" */
  importantPile: ValueCard[];
  /** Cards sorted as "not as important" */
  notAsPile: ValueCard[];
  /** Final top 5 values */
  topFive: ValueCard[];
  /** Current card being considered */
  currentCard: ValueCard | null;
  /** Index in the deck */
  deckIndex: number;
  /** Comparison pairs for ranking */
  comparisonPair?: [ValueCard, ValueCard];
  /** Notes/reflections captured */
  reflections: string[];
}

// ============================================================================
// HEADLINE WRITER
// ============================================================================

export type HeadlineTimeframe = 'today' | 'this_week' | 'this_month' | 'this_year' | 'past' | 'future' | 'dream';
export type HeadlineTone = 'triumphant' | 'honest' | 'humorous' | 'hopeful' | 'any';

export interface Headline {
  text: string;
  timeframe: HeadlineTimeframe;
  tone?: HeadlineTone;
  subheadline?: string;
}

export interface HeadlineWriterState {
  /** Current phase of the game */
  phase: 'prompt' | 'writing' | 'subheadline' | 'reflection' | 'another' | 'complete';
  /** Current prompt/timeframe */
  currentTimeframe: HeadlineTimeframe;
  /** Current tone suggestion */
  suggestedTone: HeadlineTone;
  /** Headlines written this session */
  headlines: Headline[];
  /** Current headline being crafted */
  currentHeadline?: Partial<Headline>;
  /** Round number */
  round: number;
}

// ============================================================================
// UNIFIED TEXT GAME STATE
// ============================================================================

export interface TextGameState {
  gameType: TextGameType | null;
  status: TextGameStatus;
  startedAt: number | null;
  lastActivityAt: number;
  gameData:
    | TicTacToeState
    | TwentyQuestionsState
    | WordAssociationState
    | WouldYouRatherState
    | StoryBuilderState
    | ThreeWordDayState
    | ValuesCardSortState
    | HeadlineWriterState
    | EmojiStoryState
    | OneWordCheckinState
    | TinyWinTrackerState
    | FortuneCookieState
    | Record<string, unknown>;
}

export interface TextGameResult {
  /** Message to user */
  message: string;
  /** Board state description (for voice) */
  boardDescription?: string;
  /** Is game over? */
  gameOver: boolean;
  /** Winner (if applicable) */
  winner?: 'user' | 'ai' | 'draw' | null;
  /** Should AI make a move? */
  aiShouldMove?: boolean;
}

// ============================================================================
// TEXT GAME ENGINE INTERFACE
// ============================================================================

export interface TextGameEngineContract {
  /** Get current state */
  getState: () => TextGameState;

  /** Start a new text game */
  startGame: (gameType: TextGameType, config?: Record<string, unknown>) => Promise<TextGameResult>;

  /** Make a move/submit answer */
  makeMove: (input: string) => Promise<TextGameResult>;

  /** Get current board/state as speakable text */
  describeState: () => string;

  /** End the game */
  endGame: () => void;

  /** Check if game is active */
  isGameActive: () => boolean;
}
