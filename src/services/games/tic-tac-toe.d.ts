/**
 * 🎮 Tic-Tac-Toe Implementation
 *
 * Classic 3x3 tic-tac-toe with AI opponent.
 * Optimized for voice interaction with natural position descriptions.
 *
 * Board layout (numbered 1-9 for voice):
 * ```
 *  1 | 2 | 3
 * -----------
 *  4 | 5 | 6
 * -----------
 *  7 | 8 | 9
 * ```
 *
 * Voice commands supported:
 * - Numbers: "1", "5", "9"
 * - Positions: "top left", "center", "bottom right"
 * - Descriptions: "the middle", "upper right corner"
 */
import type { TextGameResult, TicTacToeBoard, TicTacToePlayer, TicTacToeState } from './text-game-types.js';
export declare function createInitialState(userGoesFirst?: boolean, difficulty?: 'easy' | 'medium' | 'hard'): TicTacToeState;
/**
 * Parse a voice command into a board position (0-8)
 */
export declare function parsePosition(input: string): number | null;
/**
 * Check if a position is valid (empty)
 */
export declare function isValidMove(state: TicTacToeState, position: number): boolean;
/**
 * Make a move on the board
 */
export declare function makeMove(state: TicTacToeState, position: number, player: TicTacToePlayer): TicTacToeState;
/**
 * Check for a winner
 */
export declare function checkWinner(board: TicTacToeBoard): TicTacToePlayer | null;
/**
 * Check if board is full
 */
export declare function isBoardFull(board: TicTacToeBoard): boolean;
/**
 * Get empty positions
 */
export declare function getEmptyPositions(board: TicTacToeBoard): number[];
/**
 * Get AI's move based on difficulty
 */
export declare function getAIMove(state: TicTacToeState): number;
/**
 * Describe the board in a speakable format
 */
export declare function describeBoardForVoice(state: TicTacToeState): string;
/**
 * Describe a single move
 */
export declare function describeMoveForVoice(position: number, player: TicTacToePlayer): string;
/**
 * Get available positions as speakable list
 */
export declare function describeAvailablePositions(state: TicTacToeState): string;
/**
 * Generate a fun, conversational response for game events
 */
export declare function getGameMessage(state: TicTacToeState, event: 'start' | 'user_move' | 'ai_move' | 'invalid_move' | 'user_wins' | 'ai_wins' | 'draw', position?: number): string;
export interface TicTacToeResult extends TextGameResult {
    /** Updated game state after the move */
    newState: TicTacToeState;
}
/**
 * Process a user's move and return the result with updated state
 */
export declare function processUserMove(state: TicTacToeState, input: string): TicTacToeResult;
//# sourceMappingURL=tic-tac-toe.d.ts.map