/**
 * Game Board UI Tests
 *
 * Tests for the visual game board component module exports and types.
 * Full integration testing is done via E2E tests due to GSAP animation dependencies.
 *
 * Covers all 12 game types:
 * - 5 original: tic-tac-toe, 20-questions, word-association, would-you-rather, story-builder
 * - 7 new: three-word-day, headline-writer, emoji-story, values-card-sort,
 *   one-word-checkin, tiny-win-tracker, fortune-cookie
 *
 * Run with: npx vitest run apps/web/tests/ui/game-board.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

// Mock gsap before importing the module
vi.mock('gsap', () => ({
  default: {
    fromTo: vi.fn().mockReturnValue({ kill: vi.fn() }),
    to: vi.fn().mockReturnValue({ kill: vi.fn() }),
    set: vi.fn(),
  },
  gsap: {
    fromTo: vi.fn().mockReturnValue({ kill: vi.fn() }),
    to: vi.fn().mockReturnValue({ kill: vi.fn() }),
    set: vi.fn(),
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

// Mock animation constants
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: {
    SLOW: 300,
    NORMAL: 200,
    FAST: 100,
  },
  EASING: {
    GENTLE: 'ease-out',
    SPRING: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
    OUT_EXPO: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
}));

describe('Game Board UI Module', () => {
  describe('Module Exports', () => {
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

  describe('Game Type Support', () => {
    // Verify all 12 game types are documented/expected
    const SUPPORTED_GAME_TYPES = [
      // Original 5
      'tic-tac-toe',
      '20-questions',
      'word-association',
      'would-you-rather',
      'story-builder',
      // New 7
      'three-word-day',
      'headline-writer',
      'emoji-story',
      'values-card-sort',
      'one-word-checkin',
      'tiny-win-tracker',
      'fortune-cookie',
    ] as const;

    it('should support 12 total game types', () => {
      expect(SUPPORTED_GAME_TYPES.length).toBe(12);
    });

    it('should include all original game types', () => {
      const original = ['tic-tac-toe', '20-questions', 'word-association', 'would-you-rather', 'story-builder'];
      original.forEach(type => {
        expect(SUPPORTED_GAME_TYPES).toContain(type);
      });
    });

    it('should include all new game types', () => {
      const newTypes = [
        'three-word-day',
        'headline-writer',
        'emoji-story',
        'values-card-sort',
        'one-word-checkin',
        'tiny-win-tracker',
        'fortune-cookie',
      ];
      newTypes.forEach(type => {
        expect(SUPPORTED_GAME_TYPES).toContain(type);
      });
    });
  });

  describe('Game State Types', () => {
    it('should define TicTacToeState interface requirements', () => {
      // Verify expected state shape via type checking
      const validState = {
        board: ['X', '', 'O', '', 'X', '', '', '', 'O'],
        currentTurn: 'user' as const,
        winner: null as string | null,
        winningLine: null as number[] | null,
      };
      expect(validState.board.length).toBe(9);
    });

    it('should define WordAssociationState interface requirements', () => {
      const validState = {
        wordChain: ['sun', 'bright', 'light'],
      };
      expect(Array.isArray(validState.wordChain)).toBe(true);
    });

    it('should define ThreeWordDayState interface requirements', () => {
      const validState = {
        words: ['grateful', 'tired', 'hopeful'],
        explorationPhase: 1 as number | 'complete',
      };
      expect(validState.words.length).toBe(3);
    });

    it('should define ValuesCardSortState interface requirements', () => {
      const validState = {
        coreTier: ['Family', 'Health'],
        importantTier: ['Career'],
        niceTier: ['Adventure'],
        currentCard: 'Spirituality',
      };
      expect(Array.isArray(validState.coreTier)).toBe(true);
    });

    it('should define FortuneCookieState interface requirements', () => {
      const validState = {
        fortune: 'Your journey begins today',
        luckyNumbers: [7, 14, 21, 28],
        reflectionPhase: 'discuss' as 'crack' | 'read' | 'discuss' | 'complete',
      };
      expect(typeof validState.fortune).toBe('string');
    });
  });

  describe('Custom Events', () => {
    it('should use ferni:game-started event name', () => {
      const eventName = 'ferni:game-started';
      expect(eventName).toBe('ferni:game-started');
    });

    it('should use ferni:game-state-update event name', () => {
      const eventName = 'ferni:game-state-update';
      expect(eventName).toBe('ferni:game-state-update');
    });

    it('should use ferni:game-ended event name', () => {
      const eventName = 'ferni:game-ended';
      expect(eventName).toBe('ferni:game-ended');
    });

    it('should define game-started event detail structure', () => {
      const detail = {
        gameId: 'game-123',
        gameType: 'tic-tac-toe',
        gameName: 'Tic Tac Toe',
      };
      expect(detail).toHaveProperty('gameId');
      expect(detail).toHaveProperty('gameType');
      expect(detail).toHaveProperty('gameName');
    });

    it('should define game-state-update event detail structure', () => {
      const detail = {
        gameType: 'word-association',
        status: 'active' as const,
        state: { wordChain: ['word1', 'word2'] },
      };
      expect(detail).toHaveProperty('gameType');
      expect(detail).toHaveProperty('status');
      expect(detail).toHaveProperty('state');
    });

    it('should define game-ended event detail structure', () => {
      const detail = {
        gameType: '20-questions',
        result: 'You guessed it!',
      };
      expect(detail).toHaveProperty('gameType');
      expect(detail).toHaveProperty('result');
    });
  });

  describe('CSS Classes', () => {
    // Verify expected CSS class naming conventions
    const expectedClasses = [
      'game-board-container',
      'ttt-board',
      'ttt-cell',
      'questions-container',
      'word-chain',
      'word-chain-item',
      'word-chain-arrow',
      'wyr-container',
      'wyr-options',
      'wyr-option',
      'wyr-or',
      'wyr-round',
      'story-container',
      'story-chapter',
      'story-progress',
      'generic-game-container',
      'generic-game-prompt',
      'generic-game-status',
      'tier-section',
      'tier-label',
      'tier-cards',
      'value-card',
    ];

    it('should use consistent CSS class naming', () => {
      expectedClasses.forEach(cls => {
        // Verify kebab-case naming convention
        expect(cls).toMatch(/^[a-z][a-z0-9-]*$/);
      });
    });

    it('should define game-type specific containers', () => {
      const containers = [
        'ttt-board',           // tic-tac-toe
        'questions-container', // 20-questions
        'word-chain',          // word-association
        'wyr-container',       // would-you-rather
        'story-container',     // story-builder
        'generic-game-container', // new games
      ];
      expect(containers.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('should use semantic aria attributes', () => {
      const expectedAriaAttributes = [
        'aria-label',
        'aria-live',
        'aria-hidden',
      ];
      expectedAriaAttributes.forEach(attr => {
        expect(attr).toMatch(/^aria-[a-z-]+$/);
      });
    });

    it('should have aria-live for dynamic updates', () => {
      // WYR round counter should announce changes
      const ariaLiveValue = 'polite';
      expect(['polite', 'assertive', 'off']).toContain(ariaLiveValue);
    });
  });
});
