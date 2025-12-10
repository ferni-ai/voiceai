/**
 * 🎲 Text Games Types
 *
 * Type definitions for text-based/board games (tic-tac-toe, etc.)
 * These games don't require music playback - just conversation.
 */

// ============================================================================
// TEXT GAME TYPES
// ============================================================================

export type TextGameType =
  | 'tic-tac-toe' // Classic 3x3 grid game
  | '20-questions' // Guess what I'm thinking of
  | 'word-association' // Say a word related to the last
  | 'would-you-rather' // Choose between two scenarios
  | 'story-builder'; // Collaborative story one sentence at a time

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
  wordChain: string[];
  /** Current word to respond to */
  currentWord: string;
  /** Who's turn */
  isUserTurn: boolean;
  /** Number of valid associations */
  chainLength: number;
  /** Did someone break the chain? */
  chainBroken: boolean;
}

// ============================================================================
// WOULD YOU RATHER
// ============================================================================

export interface WouldYouRatherChoice {
  optionA: string;
  optionB: string;
  chose: 'A' | 'B';
  reasoning?: string;
}

export interface WouldYouRatherState {
  /** Current scenario */
  currentScenario: {
    optionA: string;
    optionB: string;
  } | null;
  /** User's choices */
  choices: WouldYouRatherChoice[];
  /** Round number */
  roundNumber: number;
}

// ============================================================================
// STORY BUILDER
// ============================================================================

export interface StoryBuilderState {
  /** The story so far */
  sentences: Array<{
    text: string;
    author: 'user' | 'ai';
  }>;
  /** Genre/theme */
  genre?: string;
  /** Is the story complete? */
  isComplete: boolean;
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
