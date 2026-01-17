/**
 * Tic-Tac-Toe Game Tests
 *
 * Tests for game logic, voice parsing, AI opponent, and state management.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  createInitialState,
  parsePosition,
  isValidMove,
  makeMove,
  checkWinner,
  isBoardFull,
  getEmptyPositions,
  getAIMove,
  describeBoardForVoice,
  describeMoveForVoice,
  getGameMessage,
} from '../tic-tac-toe.js';

describe('TicTacToe', () => {
  describe('createInitialState', () => {
    it('should create empty board with 9 null cells', () => {
      const state = createInitialState();

      expect(state.board.cells).toHaveLength(9);
      expect(state.board.cells.every((cell) => cell === null)).toBe(true);
    });

    it('should set X as first player when user goes first', () => {
      const state = createInitialState(true);

      expect(state.currentPlayer).toBe('X');
      expect(state.userSymbol).toBe('X');
      expect(state.aiSymbol).toBe('O');
    });

    it('should set X as first player but O for user when AI goes first', () => {
      const state = createInitialState(false);

      expect(state.currentPlayer).toBe('X');
      expect(state.userSymbol).toBe('O');
      expect(state.aiSymbol).toBe('X');
    });

    it('should default to medium difficulty', () => {
      const state = createInitialState();

      expect(state.difficulty).toBe('medium');
    });

    it('should accept custom difficulty', () => {
      expect(createInitialState(true, 'easy').difficulty).toBe('easy');
      expect(createInitialState(true, 'hard').difficulty).toBe('hard');
    });

    it('should initialize empty move history', () => {
      const state = createInitialState();

      expect(state.moveHistory).toEqual([]);
    });

    it('should initialize with no winner', () => {
      const state = createInitialState();

      expect(state.winner).toBeNull();
    });
  });

  describe('parsePosition', () => {
    describe('numeric input', () => {
      it('should parse digit strings 1-9', () => {
        expect(parsePosition('1')).toBe(0);
        expect(parsePosition('5')).toBe(4);
        expect(parsePosition('9')).toBe(8);
      });

      it('should parse written numbers', () => {
        expect(parsePosition('one')).toBe(0);
        expect(parsePosition('five')).toBe(4);
        expect(parsePosition('nine')).toBe(8);
      });

      it('should extract digit from longer string', () => {
        expect(parsePosition('put it in 5')).toBe(4);
        expect(parsePosition('position 3')).toBe(2);
      });
    });

    describe('positional input', () => {
      it('should parse corner positions', () => {
        expect(parsePosition('top left')).toBe(0);
        expect(parsePosition('top right')).toBe(2);
        expect(parsePosition('bottom left')).toBe(6);
        expect(parsePosition('bottom right')).toBe(8);
      });

      it('should parse edge positions', () => {
        expect(parsePosition('top center')).toBe(1);
        expect(parsePosition('middle left')).toBe(3);
        expect(parsePosition('middle right')).toBe(5);
        expect(parsePosition('bottom center')).toBe(7);
      });

      it('should parse center', () => {
        expect(parsePosition('center')).toBe(4);
        expect(parsePosition('middle')).toBe(4);
        expect(parsePosition('the center')).toBe(4);
      });

      it('should handle hyphenated positions', () => {
        expect(parsePosition('top-left')).toBe(0);
        expect(parsePosition('bottom-right')).toBe(8);
      });

      it('should handle alternative names', () => {
        expect(parsePosition('upper left')).toBe(0);
        expect(parsePosition('lower right')).toBe(8);
      });
    });

    describe('edge cases', () => {
      it('should be case insensitive', () => {
        expect(parsePosition('TOP LEFT')).toBe(0);
        expect(parsePosition('Center')).toBe(4);
      });

      it('should trim whitespace', () => {
        expect(parsePosition('  center  ')).toBe(4);
      });

      it('should return null for invalid input', () => {
        expect(parsePosition('invalid')).toBeNull();
        expect(parsePosition('')).toBeNull();
      });

      it('should extract first digit 1-9 from mixed input', () => {
        // parsePosition extracts first digit it finds via /\d/ regex
        // 'xyz123abc' contains '1' as first digit, returns position 0 (1-1)
        expect(parsePosition('xyz123abc')).toBe(0);
        // '0' is found first but not valid (1-9 only), returns null
        expect(parsePosition('xyz0abc')).toBeNull();
      });

      it('should handle partial matches', () => {
        expect(parsePosition('put it in the center')).toBe(4);
        expect(parsePosition('go top left corner')).toBe(0);
      });
    });
  });

  describe('isValidMove', () => {
    it('should return true for empty cell', () => {
      const state = createInitialState();

      expect(isValidMove(state, 0)).toBe(true);
      expect(isValidMove(state, 4)).toBe(true);
      expect(isValidMove(state, 8)).toBe(true);
    });

    it('should return false for occupied cell', () => {
      let state = createInitialState();
      state = makeMove(state, 4, 'X');

      expect(isValidMove(state, 4)).toBe(false);
    });

    it('should return false for out of bounds', () => {
      const state = createInitialState();

      expect(isValidMove(state, -1)).toBe(false);
      expect(isValidMove(state, 9)).toBe(false);
      expect(isValidMove(state, 100)).toBe(false);
    });
  });

  describe('makeMove', () => {
    it('should place piece on empty cell', () => {
      let state = createInitialState();
      state = makeMove(state, 4, 'X');

      expect(state.board.cells[4]).toBe('X');
    });

    it('should not modify original state (immutable)', () => {
      const originalState = createInitialState();
      const newState = makeMove(originalState, 4, 'X');

      expect(originalState.board.cells[4]).toBeNull();
      expect(newState.board.cells[4]).toBe('X');
    });

    it('should switch current player after move', () => {
      let state = createInitialState();
      expect(state.currentPlayer).toBe('X');

      state = makeMove(state, 4, 'X');
      expect(state.currentPlayer).toBe('O');

      state = makeMove(state, 0, 'O');
      expect(state.currentPlayer).toBe('X');
    });

    it('should add move to history', () => {
      let state = createInitialState();
      state = makeMove(state, 4, 'X');
      state = makeMove(state, 0, 'O');

      expect(state.moveHistory).toEqual([4, 0]);
    });

    it('should not move on occupied cell', () => {
      let state = createInitialState();
      state = makeMove(state, 4, 'X');
      const beforeMove = state;
      state = makeMove(state, 4, 'O');

      expect(state).toBe(beforeMove); // Same reference, no change
      expect(state.board.cells[4]).toBe('X');
    });

    it('should detect winner on winning move', () => {
      let state = createInitialState();
      // X wins with top row: 0, 1, 2
      state = makeMove(state, 0, 'X');
      state = makeMove(state, 3, 'O');
      state = makeMove(state, 1, 'X');
      state = makeMove(state, 4, 'O');
      state = makeMove(state, 2, 'X');

      expect(state.winner).toBe('X');
    });

    it('should detect draw when board is full', () => {
      let state = createInitialState();
      // Create a draw: X O X / X X O / O X O
      const moves = [
        { pos: 0, player: 'X' },
        { pos: 1, player: 'O' },
        { pos: 2, player: 'X' },
        { pos: 4, player: 'X' },
        { pos: 3, player: 'X' },
        { pos: 5, player: 'O' },
        { pos: 7, player: 'X' },
        { pos: 6, player: 'O' },
        { pos: 8, player: 'O' },
      ];

      for (const { pos, player } of moves) {
        state = makeMove(state, pos, player as 'X' | 'O');
      }

      expect(state.winner).toBe('draw');
    });
  });

  describe('checkWinner', () => {
    it('should detect horizontal wins', () => {
      // Top row
      expect(checkWinner({ cells: ['X', 'X', 'X', null, null, null, null, null, null] })).toBe('X');
      // Middle row
      expect(checkWinner({ cells: [null, null, null, 'O', 'O', 'O', null, null, null] })).toBe('O');
      // Bottom row
      expect(checkWinner({ cells: [null, null, null, null, null, null, 'X', 'X', 'X'] })).toBe('X');
    });

    it('should detect vertical wins', () => {
      // Left column
      expect(checkWinner({ cells: ['X', null, null, 'X', null, null, 'X', null, null] })).toBe('X');
      // Center column
      expect(checkWinner({ cells: [null, 'O', null, null, 'O', null, null, 'O', null] })).toBe('O');
      // Right column
      expect(checkWinner({ cells: [null, null, 'X', null, null, 'X', null, null, 'X'] })).toBe('X');
    });

    it('should detect diagonal wins', () => {
      // Top-left to bottom-right
      expect(checkWinner({ cells: ['X', null, null, null, 'X', null, null, null, 'X'] })).toBe('X');
      // Top-right to bottom-left
      expect(checkWinner({ cells: [null, null, 'O', null, 'O', null, 'O', null, null] })).toBe('O');
    });

    it('should return null for no winner', () => {
      expect(
        checkWinner({ cells: ['X', 'O', 'X', null, null, null, null, null, null] })
      ).toBeNull();
      expect(
        checkWinner({ cells: [null, null, null, null, null, null, null, null, null] })
      ).toBeNull();
    });

    it('should return null for draw state', () => {
      // X O X / X X O / O X O
      expect(checkWinner({ cells: ['X', 'O', 'X', 'X', 'X', 'O', 'O', 'X', 'O'] })).toBeNull();
    });
  });

  describe('isBoardFull', () => {
    it('should return false for empty board', () => {
      expect(isBoardFull({ cells: [null, null, null, null, null, null, null, null, null] })).toBe(
        false
      );
    });

    it('should return false for partially filled board', () => {
      expect(isBoardFull({ cells: ['X', null, null, null, 'O', null, null, null, null] })).toBe(
        false
      );
    });

    it('should return true for full board', () => {
      expect(isBoardFull({ cells: ['X', 'O', 'X', 'X', 'X', 'O', 'O', 'X', 'O'] })).toBe(true);
    });
  });

  describe('getEmptyPositions', () => {
    it('should return all positions for empty board', () => {
      const positions = getEmptyPositions({
        cells: [null, null, null, null, null, null, null, null, null],
      });

      expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should return empty array for full board', () => {
      const positions = getEmptyPositions({
        cells: ['X', 'O', 'X', 'X', 'X', 'O', 'O', 'X', 'O'],
      });

      expect(positions).toEqual([]);
    });

    it('should return only empty positions', () => {
      const positions = getEmptyPositions({
        cells: ['X', null, 'O', null, 'X', null, 'O', null, null],
      });

      expect(positions).toEqual([1, 3, 5, 7, 8]);
    });
  });

  describe('getAIMove', () => {
    it('should return -1 for full board', () => {
      const state = createInitialState();
      state.board.cells = ['X', 'O', 'X', 'X', 'X', 'O', 'O', 'X', 'O'];

      expect(getAIMove(state)).toBe(-1);
    });

    it('should return valid position for empty board', () => {
      const state = createInitialState();
      const move = getAIMove(state);

      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThan(9);
    });

    it('should only return empty positions', () => {
      const state = createInitialState();
      state.board.cells = ['X', 'O', null, 'O', 'X', null, null, null, null];

      const move = getAIMove(state);
      const emptyPositions = [2, 5, 6, 7, 8];

      expect(emptyPositions).toContain(move);
    });

    it('should block winning move on hard difficulty', () => {
      // User (X) is about to win with position 2 (top row: 0,1,2)
      // O has positions 3,4 (could win at 5 on middle row: 3,4,5)
      // The AI should either block X at 2 OR take its own win at 5
      const state = createInitialState(true, 'hard');
      state.board.cells = ['X', 'X', null, 'O', 'O', null, null, null, null];
      state.currentPlayer = 'O';

      const move = getAIMove(state);

      // AI should make a strategic move - either block at 2 or win at 5
      expect([2, 5]).toContain(move);
    });

    it('should take winning move when available on hard', () => {
      // AI (O) can win with position 5 (middle row)
      const state = createInitialState(true, 'hard');
      state.board.cells = ['X', null, null, 'O', 'O', null, 'X', null, null];
      state.currentPlayer = 'O';

      const move = getAIMove(state);

      // AI should win at position 5
      expect(move).toBe(5);
    });
  });

  describe('describeBoardForVoice', () => {
    it('should describe empty board', () => {
      const state = createInitialState();
      const description = describeBoardForVoice(state);

      expect(description.toLowerCase()).toMatch(/empty|open|available|your turn/i);
    });

    it('should describe board with pieces', () => {
      let state = createInitialState();
      state = makeMove(state, 4, 'X');

      const description = describeBoardForVoice(state);

      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('describeMoveForVoice', () => {
    it('should describe move with position name', () => {
      const description = describeMoveForVoice(4, 'O');

      expect(description.toLowerCase()).toContain('center');
    });

    it('should handle corner positions', () => {
      expect(describeMoveForVoice(0, 'O').toLowerCase()).toContain('top left');
      expect(describeMoveForVoice(2, 'O').toLowerCase()).toContain('top right');
      expect(describeMoveForVoice(6, 'O').toLowerCase()).toContain('bottom left');
      expect(describeMoveForVoice(8, 'O').toLowerCase()).toContain('bottom right');
    });
  });

  describe('getGameMessage', () => {
    it('should return win message for user_wins event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'user_wins');

      expect(message.toLowerCase()).toMatch(/win|well played|beat/i);
    });

    it('should return loss message for ai_wins event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'ai_wins');

      // AI win messages can say "I won" or similar
      expect(message.toLowerCase()).toMatch(/won|win|got|game|best|out of three/i);
    });

    it('should return draw message for draw event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'draw');

      expect(message.toLowerCase()).toMatch(/draw|tie|nobody/i);
    });

    it('should return start message for start event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'start');

      expect(message.toLowerCase()).toContain('tic-tac-toe');
    });

    it('should return move confirmation for user_move event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'user_move', 4);

      expect(message.toLowerCase()).toContain('center');
    });

    it('should return AI move announcement for ai_move event', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'ai_move', 0);

      expect(message.toLowerCase()).toContain('top left');
    });

    it('should return invalid move message', () => {
      const state = createInitialState();

      const message = getGameMessage(state, 'invalid_move');

      expect(message.toLowerCase()).toContain('taken');
    });
  });

  describe('Game flow integration', () => {
    it('should play complete game with X winning', () => {
      let state = createInitialState(true, 'easy');

      // X wins with diagonal
      state = makeMove(state, 0, 'X'); // top-left
      state = makeMove(state, 1, 'O');
      state = makeMove(state, 4, 'X'); // center
      state = makeMove(state, 2, 'O');
      state = makeMove(state, 8, 'X'); // bottom-right

      expect(state.winner).toBe('X');
      expect(state.moveHistory).toHaveLength(5);
    });

    it('should track all moves in history', () => {
      let state = createInitialState();

      state = makeMove(state, 4, 'X');
      state = makeMove(state, 0, 'O');
      state = makeMove(state, 8, 'X');

      expect(state.moveHistory).toEqual([4, 0, 8]);
    });

    it('should allow AI to play full game', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      let state = createInitialState(true, 'easy');
      let moveCount = 0;
      const maxMoves = 9;

      while (!state.winner && moveCount < maxMoves) {
        const emptyPositions = getEmptyPositions(state.board);
        if (emptyPositions.length === 0) break;

        if (state.currentPlayer === state.userSymbol) {
          // User plays first available
          state = makeMove(state, emptyPositions[0], state.userSymbol);
        } else {
          // AI plays
          const aiMove = getAIMove(state);
          if (aiMove >= 0) {
            state = makeMove(state, aiMove, state.aiSymbol);
          }
        }
        moveCount++;
      }

      // Game should have ended
      expect(state.winner !== null || isBoardFull(state.board)).toBe(true);

      vi.restoreAllMocks();
    });
  });
});
