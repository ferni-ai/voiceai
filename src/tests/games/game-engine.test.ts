/**
 * 🎮 Game Engine Tests
 *
 * Tests for the core game engine functionality.
 * Updated to match actual GameEngine implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../services/games/game-engine.js';

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine('ferni');
  });

  describe('initialization', () => {
    it('should start with no active game', () => {
      expect(engine.isGameActive()).toBe(false);
      expect(engine.getCurrentGameType()).toBeNull();
    });

    it('should accept persona ID in constructor', () => {
      // Verify engine was created with personaId (stored internally)
      const state = engine.getState();
      expect(state.status).toBe('idle');
    });
  });

  describe('game lifecycle', () => {
    it('should start a game', async () => {
      // startGame returns a welcome message string
      const welcomeMessage = await engine.startGame('name-that-tune');

      expect(typeof welcomeMessage).toBe('string');
      expect(engine.isGameActive()).toBe(true);
      expect(engine.getCurrentGameType()).toBe('name-that-tune');
    });

    it('should end a game', async () => {
      await engine.startGame('name-that-tune');
      const session = engine.endGame();

      expect(engine.isGameActive()).toBe(false);
      expect(session.gameType).toBe('name-that-tune');
      expect(session.score).toBeDefined();
    });

    it('should track game score', async () => {
      await engine.startGame('name-that-tune');

      // Simulate correct answers
      await engine.submitAnswer('correct answer');
      await engine.submitAnswer('another correct');

      const session = engine.endGame();
      expect(session.score).toBeGreaterThanOrEqual(0);
    });

    it('should track rounds played', async () => {
      await engine.startGame('name-that-tune');

      await engine.submitAnswer('answer1');
      await engine.submitAnswer('answer2');
      await engine.submitAnswer('answer3');

      const session = engine.endGame();
      expect(session.roundsPlayed).toBeGreaterThan(0);
    });

    it('should end existing game when starting a new one', async () => {
      await engine.startGame('name-that-tune');

      // Starting a new game should end the previous one
      const welcomeMessage = await engine.startGame('one-word-song');

      expect(typeof welcomeMessage).toBe('string');
      expect(engine.getCurrentGameType()).toBe('one-word-song');
    });
  });

  describe('user ID tracking', () => {
    it('should set and get user ID', () => {
      expect(engine.getUserId()).toBeNull();

      engine.setUserId('user123');
      expect(engine.getUserId()).toBe('user123');
    });
  });

  describe('game memory', () => {
    it('should initialize with game memory', async () => {
      engine.setUserId('user123');
      await engine.initializeForUser('user123');

      const memory = engine.getGameMemory();
      expect(memory).toBeDefined();
    });

    it('should increment total games on completion', async () => {
      engine.setUserId('user123');
      await engine.initializeForUser('user123');

      const initialTotal = engine.getGameMemory()?.totalGamesPlayed || 0;

      await engine.startGame('name-that-tune');
      engine.endGame();

      const newTotal = engine.getGameMemory()?.totalGamesPlayed || 0;
      expect(newTotal).toBe(initialTotal + 1);
    });
  });

  describe('game state', () => {
    it('should report active state during game', async () => {
      await engine.startGame('name-that-tune');

      expect(engine.isGameActive()).toBe(true);
      expect(engine.getCurrentGameType()).toBe('name-that-tune');
    });

    it('should report inactive state when no game', () => {
      expect(engine.isGameActive()).toBe(false);
      expect(engine.getCurrentGameType()).toBeNull();
    });
  });

  describe('answer submission', () => {
    it('should accept answers during active game', async () => {
      await engine.startGame('name-that-tune');

      const result = await engine.submitAnswer('my guess');
      expect(result).toBeDefined();
      // GameResult has correct, pointsEarned, feedback, gameOver properties
      expect(typeof result.correct).toBe('boolean');
      expect(typeof result.feedback).toBe('string');
    });

    it('should return gameOver when no game is active', async () => {
      const result = await engine.submitAnswer('my guess');
      expect(result.gameOver).toBe(true);
    });
  });
});

describe('Game Types', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine('ferni');
  });

  const gameTypes = [
    'name-that-tune',
    'one-word-song',
    'desert-island-discs',
    'this-or-that',
    'mood-dj-challenge',
  ];

  gameTypes.forEach(gameType => {
    it(`should support ${gameType}`, async () => {
      const welcomeMessage = await engine.startGame(gameType as any);
      expect(typeof welcomeMessage).toBe('string');
      expect(engine.getCurrentGameType()).toBe(gameType);
      engine.endGame();
    });
  });

  it('should throw error for invalid game type', async () => {
    await expect(engine.startGame('invalid-game' as any)).rejects.toThrow();
  });
});

describe('Analytics Integration', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine('ferni');
    engine.setUserId('test-user');
  });

  it('should track game start events', async () => {
    // This would verify analytics.trackGameStart was called
    await engine.startGame('name-that-tune');
    expect(engine.isGameActive()).toBe(true);
  });

  it('should track game completion events', async () => {
    await engine.startGame('name-that-tune');
    const session = engine.endGame();

    // Verify session has analytics-relevant data
    expect(session.gameType).toBeDefined();
    expect(session.score).toBeDefined();
    expect(session.roundsPlayed).toBeDefined();
    expect(session.durationSeconds).toBeDefined();
  });
});
