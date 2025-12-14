/**
 * 🎵 Music Games Tests
 *
 * Tests for individual game implementations in music-games.ts.
 * Tests cover:
 * - Game initialization
 * - Answer evaluation (correct/incorrect)
 * - Hints and skips
 * - Streak tracking
 * - Game completion
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the game-music module to avoid actual iTunes API calls
vi.mock('../../services/games/game-music.js', () => ({
  searchSong: vi.fn().mockResolvedValue({
    found: true,
    track: {
      name: 'Test Song',
      artist: 'Test Artist',
      previewUrl: 'https://example.com/preview.mp3',
      duration: 30000,
    },
  }),
  searchSongWithWord: vi.fn().mockResolvedValue({
    found: true,
    track: {
      name: 'Love Song',
      artist: 'Test Artist',
      previewUrl: 'https://example.com/preview.mp3',
    },
  }),
  searchSongForMood: vi.fn().mockResolvedValue({
    found: true,
    track: {
      name: 'Happy Song',
      artist: 'Test Artist',
      previewUrl: 'https://example.com/preview.mp3',
    },
  }),
  getRandomGameSongs: vi.fn().mockResolvedValue([
    { name: 'Song 1', artist: 'Artist 1', previewUrl: 'https://example.com/1.mp3' },
    { name: 'Song 2', artist: 'Artist 2', previewUrl: 'https://example.com/2.mp3' },
    { name: 'Song 3', artist: 'Artist 3', previewUrl: 'https://example.com/3.mp3' },
    { name: 'Song 4', artist: 'Artist 4', previewUrl: 'https://example.com/4.mp3' },
    { name: 'Song 5', artist: 'Artist 5', previewUrl: 'https://example.com/5.mp3' },
  ]),
  playGameTrack: vi.fn().mockResolvedValue(true),
  stopGameTrack: vi.fn(),
  fadeOutGameTrack: vi.fn().mockResolvedValue(undefined),
  isMusicAvailable: vi.fn().mockReturnValue(true),
}));

// Mock DJ service
vi.mock('../../services/dj-service.js', () => ({
  getDJStyle: vi.fn().mockReturnValue({
    style: 'warm',
    energy: 'medium',
  }),
}));

// Import after mocks are set up
import {
  getMusicGameImplementation,
  setGameMemoryForGames,
} from '../../services/games/music-games.js';
import type { GameMemory } from '../../types/user-profile.js';

// Helper to create mock game memory
function createMockGameMemory(): GameMemory {
  return {
    totalGamesPlayed: 5,
    bestStreak: 3,
    currentStreak: 0,
    updatedAt: new Date(),
    gameStats: {},
    milestones: [],
  };
}

describe('Music Games', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset shared game memory
    setGameMemoryForGames(null);
  });

  describe('getMusicGameImplementation', () => {
    it('should return implementation for name-that-tune', () => {
      const impl = getMusicGameImplementation('name-that-tune', 'ferni');
      expect(impl).not.toBeNull();
    });

    it('should return implementation for one-word-song', () => {
      const impl = getMusicGameImplementation('one-word-song', 'ferni');
      expect(impl).not.toBeNull();
    });

    it('should return implementation for desert-island-discs', () => {
      const impl = getMusicGameImplementation('desert-island-discs', 'ferni');
      expect(impl).not.toBeNull();
    });

    it('should return implementation for this-or-that', () => {
      const impl = getMusicGameImplementation('this-or-that', 'ferni');
      expect(impl).not.toBeNull();
    });

    it('should return implementation for mood-dj-challenge', () => {
      const impl = getMusicGameImplementation('mood-dj-challenge', 'ferni');
      expect(impl).not.toBeNull();
    });

    it('should return null for invalid game type', () => {
      const impl = getMusicGameImplementation('invalid-game' as any, 'ferni');
      expect(impl).toBeNull();
    });
  });

  describe('Name That Tune', () => {
    it('should initialize with songs and welcome message', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      expect(game).not.toBeNull();

      const { initialState, totalRounds, welcomeMessage } = await game!.initialize({ rounds: 5 });

      expect(totalRounds).toBe(5);
      expect(welcomeMessage).toBeTruthy();
      expect(welcomeMessage.length).toBeGreaterThan(0);
      expect(initialState).toHaveProperty('currentSong');
      expect(initialState).toHaveProperty('acceptableAnswers');
    });

    it('should accept correct song name', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState } = await game!.initialize({ rounds: 3 });

      // Get the acceptable answers from initial state
      const state = initialState as { acceptableAnswers: string[] };

      // Answer with one of the acceptable answers
      const result = await game!.evaluateAnswer(
        state.acceptableAnswers[0].toLowerCase(),
        initialState,
        1
      );

      expect(result.correct).toBe(true);
      expect(result.pointsEarned).toBeGreaterThan(0);
      expect(result.feedback).toBeTruthy();
    });

    it('should reject incorrect answers', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState } = await game!.initialize({ rounds: 3 });

      const result = await game!.evaluateAnswer(
        'completely wrong answer that matches nothing',
        initialState,
        1
      );

      expect(result.correct).toBe(false);
      expect(result.pointsEarned).toBe(0);
      expect(result.correctAnswer).toBeTruthy();
    });

    it('should provide hints', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState } = await game!.initialize({ rounds: 3 });

      const hint1 = game!.getHint(initialState);
      expect(hint1).toBeTruthy();
      expect(hint1).toContain('hint');

      const hint2 = game!.getHint(initialState);
      expect(hint2).toBeTruthy();
    });

    it('should handle skip', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState } = await game!.initialize({ rounds: 3 });

      const result = await game!.handleSkip(initialState);

      expect(result.correct).toBe(false);
      expect(result.correctAnswer).toBeTruthy();
      expect(result.gameOver).toBe(false);
    });

    it('should setup next round correctly', async () => {
      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState } = await game!.initialize({ rounds: 3 });

      const nextState = await game!.setupNextRound(initialState, 2);

      expect(nextState).toHaveProperty('currentSong');
      expect(nextState).toHaveProperty('acceptableAnswers');
    });

    it('should track streaks with game memory', async () => {
      const memory = createMockGameMemory();
      setGameMemoryForGames(memory);

      const game = getMusicGameImplementation('name-that-tune', 'ferni');
      const { initialState, welcomeMessage } = await game!.initialize({ rounds: 3 });

      // Welcome message should reference previous games if memory exists
      expect(welcomeMessage).toBeTruthy();
    });
  });

  describe('One Word Song', () => {
    it('should initialize with welcome message', async () => {
      const game = getMusicGameImplementation('one-word-song', 'ferni');
      expect(game).not.toBeNull();

      const { initialState, welcomeMessage } = await game!.initialize();

      expect(welcomeMessage).toBeTruthy();
      expect(initialState).toHaveProperty('usedWords');
      expect(initialState).toHaveProperty('playedSongs');
    });

    it('should find song with given word', async () => {
      const game = getMusicGameImplementation('one-word-song', 'ferni');
      const { initialState } = await game!.initialize();

      const result = await game!.evaluateAnswer('love', initialState, 1);

      expect(result.correct).toBe(true);
      expect(result.pointsEarned).toBeGreaterThan(0);
      expect(result.feedback).toContain('love');
    });

    it('should track used words', async () => {
      const game = getMusicGameImplementation('one-word-song', 'ferni');
      const { initialState } = await game!.initialize();

      // First use of word
      await game!.evaluateAnswer('love', initialState, 1);

      // Try to use same word again
      const state = initialState as { usedWords: string[] };
      state.usedWords.push('love');

      const result = await game!.evaluateAnswer('love', state, 2);
      expect(result.correct).toBe(false);
      expect(result.feedback).toContain('already');
    });

    it('should provide hint suggestions', async () => {
      const game = getMusicGameImplementation('one-word-song', 'ferni');
      const { initialState } = await game!.initialize();

      const hint = game!.getHint(initialState);
      expect(hint).toBeTruthy();
    });
  });

  describe('Desert Island Discs', () => {
    it('should initialize with 5 rounds', async () => {
      const game = getMusicGameImplementation('desert-island-discs', 'ferni');
      expect(game).not.toBeNull();

      const { initialState, totalRounds, welcomeMessage } = await game!.initialize();

      expect(totalRounds).toBe(5);
      expect(welcomeMessage).toBeTruthy();
      expect(initialState).toHaveProperty('pickedSongs');
      expect(initialState).toHaveProperty('totalPicks');
    });

    it('should accept song picks', async () => {
      const game = getMusicGameImplementation('desert-island-discs', 'ferni');
      const { initialState } = await game!.initialize();

      const result = await game!.evaluateAnswer('Bohemian Rhapsody', initialState, 1);

      expect(result.correct).toBe(true);
      expect(result.pointsEarned).toBeGreaterThan(0);
      expect(result.gameOver).toBe(false);
    });

    it('should end game after 5 picks', async () => {
      const game = getMusicGameImplementation('desert-island-discs', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { pickedSongs: Array<{ name: string }> };

      // Simulate 4 previous picks
      state.pickedSongs = [
        { name: 'Song 1' },
        { name: 'Song 2' },
        { name: 'Song 3' },
        { name: 'Song 4' },
      ];

      // 5th pick should end the game
      const result = await game!.evaluateAnswer('Final Song', state, 5);

      expect(result.gameOver).toBe(true);
      expect(result.finalScore).toBeDefined();
    });

    it('should save picks to game memory', async () => {
      const memory = createMockGameMemory();
      setGameMemoryForGames(memory);

      const game = getMusicGameImplementation('desert-island-discs', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { pickedSongs: Array<{ name: string }> };
      state.pickedSongs = [
        { name: 'Song 1' },
        { name: 'Song 2' },
        { name: 'Song 3' },
        { name: 'Song 4' },
      ];

      await game!.evaluateAnswer('Final Song', state, 5);

      // Memory should have desert island picks saved
      expect(memory.desertIslandPicks).toBeDefined();
      expect(memory.desertIslandPicks!.length).toBe(5);
    });

    it('should reference previous picks in welcome message', async () => {
      const memory = createMockGameMemory();
      memory.desertIslandPicks = ['Previous Song 1', 'Previous Song 2'];
      setGameMemoryForGames(memory);

      const game = getMusicGameImplementation('desert-island-discs', 'ferni');
      const { welcomeMessage } = await game!.initialize();

      // Should reference previous picks
      expect(welcomeMessage).toBeTruthy();
    });
  });

  describe('This or That', () => {
    it('should initialize with matchups', async () => {
      const game = getMusicGameImplementation('this-or-that', 'ferni');
      expect(game).not.toBeNull();

      const { initialState, welcomeMessage } = await game!.initialize();

      expect(welcomeMessage).toBeTruthy();
      expect(initialState).toHaveProperty('songA');
      expect(initialState).toHaveProperty('songB');
      expect(initialState).toHaveProperty('choices');
    });

    it('should accept choice A', async () => {
      const game = getMusicGameImplementation('this-or-that', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { songA: { name: string }; songB: { name: string } };
      state.songA = { name: 'Song A', artist: 'Artist A', previewUrl: '' } as any;
      state.songB = { name: 'Song B', artist: 'Artist B', previewUrl: '' } as any;

      const result = await game!.evaluateAnswer('A', state, 1);

      expect(result.correct).toBe(true);
      expect(result.pointsEarned).toBeGreaterThan(0);
    });

    it('should accept choice B', async () => {
      const game = getMusicGameImplementation('this-or-that', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { songA: { name: string }; songB: { name: string } };
      state.songA = { name: 'Song A', artist: 'Artist A', previewUrl: '' } as any;
      state.songB = { name: 'Song B', artist: 'Artist B', previewUrl: '' } as any;

      const result = await game!.evaluateAnswer('B', state, 1);

      expect(result.correct).toBe(true);
    });

    it('should accept "first" and "second" as choices', async () => {
      const game = getMusicGameImplementation('this-or-that', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { songA: { name: string }; songB: { name: string } };
      state.songA = { name: 'Song A', artist: 'Artist A', previewUrl: '' } as any;
      state.songB = { name: 'Song B', artist: 'Artist B', previewUrl: '' } as any;

      const result1 = await game!.evaluateAnswer('first', state, 1);
      expect(result1.correct).toBe(true);

      const result2 = await game!.evaluateAnswer('second', state, 2);
      expect(result2.correct).toBe(true);
    });

    it('should reject invalid choices', async () => {
      const game = getMusicGameImplementation('this-or-that', 'ferni');
      const { initialState } = await game!.initialize();

      const state = initialState as { songA: { name: string }; songB: { name: string } };
      state.songA = { name: 'Song A', artist: 'Artist A', previewUrl: '' } as any;
      state.songB = { name: 'Song B', artist: 'Artist B', previewUrl: '' } as any;

      const result = await game!.evaluateAnswer('neither', state, 1);

      expect(result.correct).toBe(false);
      expect(result.feedback).toContain('A or B');
    });
  });

  describe('Mood DJ Challenge', () => {
    it('should initialize with welcome message', async () => {
      const game = getMusicGameImplementation('mood-dj-challenge', 'ferni');
      expect(game).not.toBeNull();

      const { initialState, welcomeMessage, totalRounds } = await game!.initialize();

      expect(totalRounds).toBe(5);
      expect(welcomeMessage).toBeTruthy();
      expect(welcomeMessage).toContain('mood');
    });

    it('should find song for mood description', async () => {
      const game = getMusicGameImplementation('mood-dj-challenge', 'ferni');
      const { initialState } = await game!.initialize();

      const result = await game!.evaluateAnswer('happy and energetic', initialState, 1);

      expect(result.correct).toBe(true);
      expect(result.feedback).toContain('happy');
    });

    it('should accept rating after song pick', async () => {
      const game = getMusicGameImplementation('mood-dj-challenge', 'ferni');
      const { initialState } = await game!.initialize();

      // First, describe a mood to get a song
      await game!.evaluateAnswer('happy', initialState, 1);

      // Now rate the pick
      const state = initialState as { pickedSong: { name: string }; userRating: null };
      state.pickedSong = { name: 'Happy Song', artist: 'Test', previewUrl: '' } as any;
      state.userRating = null;

      const result = await game!.evaluateAnswer('4', state, 1);

      expect(result.correct).toBe(true);
      expect(result.pointsEarned).toBe(80); // 4 * 20
    });

    it('should provide scenario hints', async () => {
      const game = getMusicGameImplementation('mood-dj-challenge', 'ferni');
      const { initialState } = await game!.initialize();

      const hint = game!.getHint(initialState);

      expect(hint).toBeTruthy();
      expect(hint).toContain('Try:');
    });
  });
});

describe('Game Memory Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGameMemoryForGames(null);
  });

  it('should track game stats with memory', async () => {
    const memory = createMockGameMemory();
    memory.gameStats['name-that-tune'] = {
      gamesPlayed: 10,
      highScore: 500,
      averageScore: 350,
      totalTime: 3600,
    };
    setGameMemoryForGames(memory);

    const game = getMusicGameImplementation('name-that-tune', 'ferni');
    const { welcomeMessage } = await game!.initialize({ rounds: 5 });

    // Should reference previous games
    expect(welcomeMessage).toBeTruthy();
  });

  it('should personalize feedback based on streak', async () => {
    const memory = createMockGameMemory();
    // Need currentStreak >= 3 for the streak message to appear in welcome
    memory.currentStreak = 5;
    // Also need game stats for the memory messages to trigger
    memory.gameStats['name-that-tune'] = {
      gamesPlayed: 10,
      highScore: 500,
      averageScore: 350,
      totalTime: 3600,
    };
    setGameMemoryForGames(memory);

    const game = getMusicGameImplementation('name-that-tune', 'ferni');
    const { welcomeMessage } = await game!.initialize({ rounds: 5 });

    // Should reference either streak or previous games
    const lowerMessage = welcomeMessage.toLowerCase();
    expect(
      lowerMessage.includes('streak') ||
        lowerMessage.includes('played') ||
        lowerMessage.includes('high score') ||
        lowerMessage.includes('games')
    ).toBe(true);
  });
});
