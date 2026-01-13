/**
 * 🎲 Text Games Types
 *
 * Type definitions for text-based/board games (tic-tac-toe, etc.)
 * These games don't require music playback - just conversation.
 */
import type { EmojiStoryState } from './emoji-story.js';
import type { OneWordCheckinState } from './one-word-checkin.js';
import type { TinyWinTrackerState } from './tiny-win-tracker.js';
import type { FortuneCookieState } from './fortune-cookie.js';
export type { EmojiStoryState, OneWordCheckinState, TinyWinTrackerState, FortuneCookieState };
export type TextGameType = 'tic-tac-toe' | '20-questions' | 'word-association' | 'would-you-rather' | 'story-builder' | 'three-word-day' | 'values-card-sort' | 'headline-writer' | 'emoji-story' | 'one-word-checkin' | 'tiny-win-tracker' | 'fortune-cookie';
export type TextGameStatus = 'idle' | 'active' | 'completed' | 'draw';
export type TicTacToeCell = 'X' | 'O' | null;
export type TicTacToePlayer = 'X' | 'O';
export interface TicTacToeBoard {
    cells: [
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell,
        TicTacToeCell
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
export declare const POSITION_MAP: Record<string, number>;
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
export interface TextGameState {
    gameType: TextGameType | null;
    status: TextGameStatus;
    startedAt: number | null;
    lastActivityAt: number;
    gameData: TicTacToeState | TwentyQuestionsState | WordAssociationState | WouldYouRatherState | StoryBuilderState | ThreeWordDayState | ValuesCardSortState | HeadlineWriterState | EmojiStoryState | OneWordCheckinState | TinyWinTrackerState | FortuneCookieState | Record<string, unknown>;
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
//# sourceMappingURL=text-game-types.d.ts.map