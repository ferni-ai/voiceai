/**
 * Game Board UI - Unit Tests
 *
 * Tests for the visual game state display component.
 * Covers initialization, event handling, rendering, and cleanup.
 *
 * @module ui/__tests__/game-board.ui
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock GSAP - execute onComplete callbacks immediately
vi.mock('../../src/utils/gsap-setup.js', () => ({
  gsap: {
    fromTo: vi.fn(),
    to: vi.fn((_target, options) => {
      // Execute onComplete callback immediately for tests
      if (options?.onComplete) {
        options.onComplete();
      }
    }),
    set: vi.fn(),
  },
}));

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: {
    INSTANT: 0,
    FAST: 150,
    NORMAL: 200,
    SLOW: 300,
  },
  EASING: {
    SPRING: 'power2.out',
    EASE_OUT: 'power2.out',
  },
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/**
 * Clean up test DOM by removing all child nodes
 */
function cleanupDOM(): void {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

describe('Game Board UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupDOM();
  });

  afterEach(() => {
    // Clean up DOM
    document.querySelectorAll('.game-board-container').forEach((el) => el.remove());
    document.querySelectorAll('[id="game-board-styles"]').forEach((el) => el.remove());
  });

  describe('Module exports', () => {
    it('should export initGameBoard function', async () => {
      const module = await import('../../src/ui/game-board.ui.js');
      expect(typeof module.initGameBoard).toBe('function');
    });

    it('should export destroyGameBoard function', async () => {
      const module = await import('../../src/ui/game-board.ui.js');
      expect(typeof module.destroyGameBoard).toBe('function');
    });

    it('should export updateGameState function', async () => {
      const module = await import('../../src/ui/game-board.ui.js');
      expect(typeof module.updateGameState).toBe('function');
    });

    it('should export isGameBoardVisible function', async () => {
      const module = await import('../../src/ui/game-board.ui.js');
      expect(typeof module.isGameBoardVisible).toBe('function');
    });

    it('should export getCurrentGameType function', async () => {
      const module = await import('../../src/ui/game-board.ui.js');
      expect(typeof module.getCurrentGameType).toBe('function');
    });
  });

  describe('Initialization', () => {
    it('should create container element on init', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      const container = document.querySelector('.game-board-container');
      expect(container).not.toBeNull();

      destroyGameBoard();
    });

    it('should inject styles on init', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      const styles = document.querySelector('#game-board-styles');
      expect(styles).not.toBeNull();

      destroyGameBoard();
    });

    it('should not be visible initially', async () => {
      const { initGameBoard, destroyGameBoard, isGameBoardVisible } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      expect(isGameBoardVisible()).toBe(false);

      destroyGameBoard();
    });

    it('should have no game type initially', async () => {
      const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      expect(getCurrentGameType()).toBeNull();

      destroyGameBoard();
    });
  });

  describe('Cleanup', () => {
    it('should remove container on destroy', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();
      expect(document.querySelector('.game-board-container')).not.toBeNull();

      destroyGameBoard();
      expect(document.querySelector('.game-board-container')).toBeNull();
    });

    it('should remove styles on destroy', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();
      expect(document.querySelector('#game-board-styles')).not.toBeNull();

      destroyGameBoard();
      expect(document.querySelector('#game-board-styles')).toBeNull();
    });
  });

  describe('Event handling - game-started', () => {
    it('should respond to ferni:game-started event for tic-tac-toe', async () => {
      const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      // Dispatch game started event
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: {
            gameType: 'tic-tac-toe',
            gameName: 'Tic-Tac-Toe',
          },
        })
      );

      expect(getCurrentGameType()).toBe('tic-tac-toe');

      destroyGameBoard();
    });

    it('should respond to ferni:game-started event for 20-questions', async () => {
      const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: {
            gameType: '20-questions',
            gameName: '20 Questions',
          },
        })
      );

      expect(getCurrentGameType()).toBe('20-questions');

      destroyGameBoard();
    });

    it('should normalize game type variants', async () => {
      const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      // Use alternate naming
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: {
            gameType: 'tictactoe', // without hyphens
            gameName: 'Tic Tac Toe',
          },
        })
      );

      expect(getCurrentGameType()).toBe('tic-tac-toe');

      destroyGameBoard();
    });
  });

  describe('Event handling - game-state-update', () => {
    it('should update tic-tac-toe board state', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      // Start game first
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
        })
      );

      // Update state - gameData wraps the game-specific state
      document.dispatchEvent(
        new CustomEvent('ferni:game-state-update', {
          detail: {
            gameType: 'tic-tac-toe',
            status: 'active',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            gameData: {
              board: ['X', null, null, null, 'O', null, null, null, null],
              currentPlayer: 'X',
              userSymbol: 'X',
              aiSymbol: 'O',
              winner: null,
              moveHistory: [0, 4],
              difficulty: 'medium',
            },
          },
        })
      );

      // Check that board content was rendered
      const container = document.querySelector('.game-board-container');
      expect(container).not.toBeNull();
      expect(container?.querySelector('.ttt-grid')).not.toBeNull();

      destroyGameBoard();
    });
  });

  describe('Event handling - game-ended', () => {
    it('should clear game type on game ended', async () => {
      const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
        })
      );

      expect(getCurrentGameType()).toBe('tic-tac-toe');

      // End game
      document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail: {} }));

      expect(getCurrentGameType()).toBeNull();

      destroyGameBoard();
    });

    it('should hide board on game ended', async () => {
      const { initGameBoard, destroyGameBoard, isGameBoardVisible } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
        })
      );

      // End game
      document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail: {} }));

      expect(isGameBoardVisible()).toBe(false);

      destroyGameBoard();
    });
  });

  describe('Programmatic API - updateGameState', () => {
    it('should update state via updateGameState function', async () => {
      const { initGameBoard, destroyGameBoard, updateGameState } = await import(
        '../../src/ui/game-board.ui.js'
      );

      initGameBoard();

      // Start game first
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'word-association', gameName: 'Word Association' },
        })
      );

      // Update via API
      updateGameState({
        gameType: 'word-association',
        status: 'active',
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        gameData: {
          chain: ['apple', 'pie', 'chart'],
          currentWord: 'chart',
          isUserTurn: true,
          turnCount: 3,
        },
      });

      const container = document.querySelector('.game-board-container');
      expect(container?.querySelector('.word-chain')).not.toBeNull();

      destroyGameBoard();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible container role', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      const container = document.querySelector('.game-board-container');
      expect(container?.getAttribute('role')).toBe('region');

      destroyGameBoard();
    });

    it('should have aria-label on container', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      const container = document.querySelector('.game-board-container');
      expect(container?.getAttribute('aria-label')).toBe('Game board');

      destroyGameBoard();
    });
  });

  describe('Game type support', () => {
    const gameTypes = [
      { type: 'tic-tac-toe', name: 'Tic-Tac-Toe' },
      { type: '20-questions', name: '20 Questions' },
      { type: 'word-association', name: 'Word Association' },
      { type: 'story-builder', name: 'Story Builder' },
      { type: 'would-you-rather', name: 'Would You Rather' },
    ];

    gameTypes.forEach(({ type, name }) => {
      it(`should support ${name} game type`, async () => {
        const { initGameBoard, destroyGameBoard, getCurrentGameType } = await import(
          '../../src/ui/game-board.ui.js'
        );

        initGameBoard();

        document.dispatchEvent(
          new CustomEvent('ferni:game-started', {
            detail: { gameType: type, gameName: name },
          })
        );

        expect(getCurrentGameType()).toBe(type);

        destroyGameBoard();
      });
    });
  });

  describe('Tic-Tac-Toe rendering', () => {
    it('should render 9 cells for tic-tac-toe grid', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
        })
      );

      // Update with initial state
      document.dispatchEvent(
        new CustomEvent('ferni:game-state-update', {
          detail: {
            gameType: 'tic-tac-toe',
            status: 'active',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            gameData: {
              board: [null, null, null, null, null, null, null, null, null],
              currentPlayer: 'X',
              userSymbol: 'X',
              aiSymbol: 'O',
              winner: null,
              moveHistory: [],
              difficulty: 'medium',
            },
          },
        })
      );

      const cells = document.querySelectorAll('.ttt-cell');
      expect(cells.length).toBe(9);

      destroyGameBoard();
    });

    it('should show winner message when game is won', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'tic-tac-toe', gameName: 'Tic-Tac-Toe' },
        })
      );

      // Update with winning state
      document.dispatchEvent(
        new CustomEvent('ferni:game-state-update', {
          detail: {
            gameType: 'tic-tac-toe',
            status: 'completed',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            gameData: {
              board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
              currentPlayer: 'O',
              userSymbol: 'X',
              aiSymbol: 'O',
              winner: 'X',
              moveHistory: [0, 3, 1, 4, 2],
              difficulty: 'medium',
            },
          },
        })
      );

      const container = document.querySelector('.game-board-container');
      const text = container?.textContent || '';
      // The UI shows "You won!" for the winner
      expect(text.toLowerCase()).toMatch(/win|won/);

      destroyGameBoard();
    });
  });

  describe('20 Questions rendering', () => {
    it('should show question count', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: '20-questions', gameName: '20 Questions' },
        })
      );

      // Update with state
      document.dispatchEvent(
        new CustomEvent('ferni:game-state-update', {
          detail: {
            gameType: '20-questions',
            status: 'active',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            gameData: {
              questionNumber: 5,
              maxQuestions: 20,
              questionsAsked: [
                'Is it alive?',
                'Is it an animal?',
                'Is it a pet?',
                'Is it a dog?',
                'Is it a puppy?',
              ],
              answers: ['yes', 'yes', 'yes', 'yes', 'maybe'],
              guessedCorrectly: null,
            },
          },
        })
      );

      const container = document.querySelector('.game-board-container');
      const text = container?.textContent || '';
      expect(text).toMatch(/5.*20|Question.*5/);

      destroyGameBoard();
    });
  });

  describe('Word Association rendering', () => {
    it('should show word chain', async () => {
      const { initGameBoard, destroyGameBoard } = await import('../../src/ui/game-board.ui.js');

      initGameBoard();

      // Start game
      document.dispatchEvent(
        new CustomEvent('ferni:game-started', {
          detail: { gameType: 'word-association', gameName: 'Word Association' },
        })
      );

      // Update with state
      document.dispatchEvent(
        new CustomEvent('ferni:game-state-update', {
          detail: {
            gameType: 'word-association',
            status: 'active',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            gameData: {
              chain: ['sun', 'shine', 'bright'],
              currentWord: 'bright',
              isUserTurn: true,
              turnCount: 3,
            },
          },
        })
      );

      const container = document.querySelector('.game-board-container');
      const text = container?.textContent || '';
      expect(text).toContain('bright');

      destroyGameBoard();
    });
  });
});
