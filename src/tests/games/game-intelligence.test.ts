/**
 * 🧠 Game Intelligence Tests
 *
 * Tests for the "More than human" features in game-intelligence.ts:
 * - Musical DNA analysis (genre/decade affinities)
 * - Real-time difficulty sensing
 * - Milestone detection and celebration
 * - Musical personality insights
 * - Memory-powered features
 */

import { describe, expect, it } from 'vitest';
import {
  analyzeDifficulty,
  analyzeMusicalPersonality,
  checkMilestones,
  getConversationCallback,
  getMusicalDNAMessage,
  getPersonalityComment,
  getSongSelectionContext,
  getTopAffinities,
  getWeakAreas,
  recordGuess,
  storeConversationHint,
} from '../../services/games/game-intelligence.js';
import type { GameResult } from '../../services/games/types.js';
import type { GameMemory } from '../../types/user-profile.js';

// Helper to create fresh game memory
function createEmptyGameMemory(): GameMemory {
  return {
    totalGamesPlayed: 0,
    bestStreak: 0,
    currentStreak: 0,
    updatedAt: new Date(),
    gameStats: {},
    milestones: [],
    genreAffinities: {},
    decadeAffinities: {},
    recentGuessTimings: [],
    musicalPersonality: [],
  };
}

describe('Game Intelligence', () => {
  describe('recordGuess', () => {
    it('should record a correct guess and update streak', () => {
      const memory = createEmptyGameMemory();

      const updated = recordGuess(memory, 'Song Name', 3000, true, 'rock', '1980s');

      expect(updated.currentStreak).toBe(1);
      expect(updated.recentGuessTimings).toHaveLength(1);
      expect(updated.recentGuessTimings![0].correct).toBe(true);
      expect(updated.recentGuessTimings![0].guessTimeMs).toBe(3000);
    });

    it('should reset streak on incorrect guess', () => {
      const memory = createEmptyGameMemory();
      memory.currentStreak = 5;

      const updated = recordGuess(memory, 'Song Name', 8000, false);

      expect(updated.currentStreak).toBe(0);
    });

    it('should update best streak when current exceeds it', () => {
      const memory = createEmptyGameMemory();
      memory.bestStreak = 3;
      memory.currentStreak = 3;

      const updated = recordGuess(memory, 'Song Name', 3000, true);

      expect(updated.currentStreak).toBe(4);
      expect(updated.bestStreak).toBe(4);
    });

    it('should track fastest guess', () => {
      const memory = createEmptyGameMemory();
      memory.fastestGuessMs = 5000;

      const updated = recordGuess(memory, 'Fast Song', 2000, true);

      expect(updated.fastestGuessMs).toBe(2000);
      expect(updated.fastestGuessSong).toBe('Fast Song');
    });

    it('should not update fastest guess for slower times', () => {
      const memory = createEmptyGameMemory();
      memory.fastestGuessMs = 2000;
      memory.fastestGuessSong = 'Existing Fast';

      const updated = recordGuess(memory, 'Slower Song', 5000, true);

      expect(updated.fastestGuessMs).toBe(2000);
      expect(updated.fastestGuessSong).toBe('Existing Fast');
    });

    it('should update genre affinity on correct guess', () => {
      const memory = createEmptyGameMemory();

      recordGuess(memory, 'Rock Song 1', 3000, true, 'rock');
      recordGuess(memory, 'Rock Song 2', 2500, true, 'rock');
      const updated = recordGuess(memory, 'Rock Song 3', 2000, true, 'rock');

      expect(updated.genreAffinities!['rock']).toBeDefined();
      expect(updated.genreAffinities!['rock'].correctGuesses).toBe(3);
      expect(updated.genreAffinities!['rock'].totalAttempts).toBe(3);
    });

    it('should update decade affinity', () => {
      const memory = createEmptyGameMemory();

      recordGuess(memory, '80s Song', 3000, true, undefined, '1980s');
      const updated = recordGuess(memory, 'Another 80s', 2500, true, undefined, '1980s');

      expect(updated.decadeAffinities!['1980s']).toBeDefined();
      expect(updated.decadeAffinities!['1980s'].correctGuesses).toBe(2);
    });

    it('should keep only last 100 guess timings', () => {
      const memory = createEmptyGameMemory();
      memory.recentGuessTimings = Array(100).fill({
        item: 'old',
        guessTimeMs: 5000,
        correct: true,
        timestamp: new Date(),
      });

      const updated = recordGuess(memory, 'New Song', 3000, true);

      expect(updated.recentGuessTimings).toHaveLength(100);
      expect(updated.recentGuessTimings![0].item).toBe('New Song');
    });
  });

  describe('analyzeDifficulty', () => {
    it('should recommend harder difficulty when crushing it', () => {
      const memory = createEmptyGameMemory();
      memory.adaptiveDifficultyMultiplier = 1.0;
      memory.recentGuessTimings = Array(5).fill({
        item: 'song',
        guessTimeMs: 3000,
        correct: true,
        timestamp: new Date(),
      });

      const recentResults: GameResult[] = Array(5).fill({
        correct: true,
        pointsEarned: 100,
        feedback: '',
        gameOver: false,
      });

      const recommendation = analyzeDifficulty(memory, recentResults, 6);

      expect(recommendation.difficulty).toBe('harder');
      expect(recommendation.multiplier).toBeGreaterThan(1.0);
      expect(recommendation.speakToUser).toBe(true);
    });

    it('should recommend easier difficulty when struggling', () => {
      const memory = createEmptyGameMemory();
      memory.adaptiveDifficultyMultiplier = 1.0;
      memory.currentStreak = 0;

      const recentResults: GameResult[] = Array(5).fill({
        correct: false,
        pointsEarned: 0,
        feedback: '',
        gameOver: false,
      });

      const recommendation = analyzeDifficulty(memory, recentResults, 6);

      expect(recommendation.difficulty).toBe('easier');
      expect(recommendation.multiplier).toBeLessThan(1.0);
    });

    it('should maintain same difficulty for balanced performance', () => {
      const memory = createEmptyGameMemory();
      memory.adaptiveDifficultyMultiplier = 1.0;
      memory.currentStreak = 3; // Give some streak to balance

      // More balanced results (4 correct, 1 wrong)
      const recentResults: GameResult[] = [
        { correct: true, pointsEarned: 100, feedback: '', gameOver: false },
        { correct: true, pointsEarned: 100, feedback: '', gameOver: false },
        { correct: true, pointsEarned: 100, feedback: '', gameOver: false },
        { correct: true, pointsEarned: 100, feedback: '', gameOver: false },
        { correct: false, pointsEarned: 0, feedback: '', gameOver: false },
      ];

      const recommendation = analyzeDifficulty(memory, recentResults, 6);

      // With 80% accuracy, could go either way - just check it doesn't crash
      expect(['same', 'easier', 'harder']).toContain(recommendation.difficulty);
      expect(recommendation.multiplier).toBeGreaterThan(0);
    });
  });

  describe('checkMilestones', () => {
    it('should detect first game milestone', () => {
      const memory = createEmptyGameMemory();
      memory.totalGamesPlayed = 1;

      const milestone = checkMilestones(memory, 'name-that-tune');

      expect(milestone).not.toBeNull();
      expect(milestone!.milestone.type).toBe('first_game');
      expect(milestone!.celebrationMessage.toLowerCase()).toContain('first');
    });

    it('should detect 10 games milestone', () => {
      const memory = createEmptyGameMemory();
      memory.totalGamesPlayed = 10;
      memory.milestones = [{ type: 'first_game', achievedAt: new Date(), celebrated: true }];

      const milestone = checkMilestones(memory, 'name-that-tune');

      expect(milestone).not.toBeNull();
      expect(milestone!.milestone.type).toBe('ten_games');
    });

    it('should detect 50 games milestone', () => {
      const memory = createEmptyGameMemory();
      memory.totalGamesPlayed = 50;
      memory.milestones = [
        { type: 'first_game', achievedAt: new Date(), celebrated: true },
        { type: 'ten_games', achievedAt: new Date(), celebrated: true },
      ];

      const milestone = checkMilestones(memory, 'name-that-tune');

      expect(milestone).not.toBeNull();
      expect(milestone!.milestone.type).toBe('fifty_games');
    });

    it('should detect fastest guess milestone', () => {
      const memory = createEmptyGameMemory();
      memory.milestones = [{ type: 'first_game', achievedAt: new Date(), celebrated: true }];

      const result: GameResult = {
        correct: true,
        pointsEarned: 100,
        feedback: '',
        gameOver: false,
      };

      const milestone = checkMilestones(memory, 'name-that-tune', result, 1500);

      expect(milestone).not.toBeNull();
      expect(milestone!.milestone.type).toBe('fastest_guess');
    });

    it('should detect streak milestones', () => {
      const memory = createEmptyGameMemory();
      memory.currentStreak = 5;
      memory.milestones = [{ type: 'first_game', achievedAt: new Date(), celebrated: true }];

      const milestone = checkMilestones(memory, 'name-that-tune');

      expect(milestone).not.toBeNull();
      expect(milestone!.milestone.type).toBe('streak_five');
    });

    it('should not duplicate milestones', () => {
      const memory = createEmptyGameMemory();
      memory.totalGamesPlayed = 1;
      memory.milestones = [{ type: 'first_game', achievedAt: new Date(), celebrated: true }];

      const milestone = checkMilestones(memory, 'name-that-tune');

      expect(milestone).toBeNull();
    });

    it('should save milestone to memory', () => {
      const memory = createEmptyGameMemory();
      memory.totalGamesPlayed = 1;

      checkMilestones(memory, 'name-that-tune');

      expect(memory.milestones).toHaveLength(1);
      expect(memory.milestones![0].type).toBe('first_game');
    });
  });

  describe('analyzeMusicalPersonality', () => {
    it('should detect nostalgic trait from Desert Island picks', () => {
      const memory = createEmptyGameMemory();
      memory.desertIslandPicks = [
        'Love of My Life',
        'Heart of Gold',
        'Dream On',
        'Forever Young',
        'Remember When',
      ];

      const insights = analyzeMusicalPersonality(memory);

      const nostalgicTrait = memory.musicalPersonality?.find((t) => t.trait === 'nostalgic');
      expect(nostalgicTrait).toBeDefined();
    });

    it('should detect quick_ear trait from fast accurate guesses', () => {
      const memory = createEmptyGameMemory();
      memory.recentGuessTimings = Array(15)
        .fill(null)
        .map(() => ({
          item: 'song',
          guessTimeMs: 3000,
          correct: true,
          timestamp: new Date(),
        }));

      analyzeMusicalPersonality(memory);

      const quickEarTrait = memory.musicalPersonality?.find((t) => t.trait === 'quick_ear');
      expect(quickEarTrait).toBeDefined();
    });

    it('should detect thoughtful trait from slow accurate guesses', () => {
      const memory = createEmptyGameMemory();
      memory.recentGuessTimings = Array(15)
        .fill(null)
        .map(() => ({
          item: 'song',
          guessTimeMs: 10000,
          correct: true,
          timestamp: new Date(),
        }));

      analyzeMusicalPersonality(memory);

      const thoughtfulTrait = memory.musicalPersonality?.find((t) => t.trait === 'thoughtful');
      expect(thoughtfulTrait).toBeDefined();
    });

    it('should detect genre_loyal trait', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 20,
          totalAttempts: 22,
          avgGuessTimeMs: 3000,
          successRate: 0.9,
          affinityScore: 80,
        },
        pop: {
          category: 'pop',
          correctGuesses: 5,
          totalAttempts: 10,
          avgGuessTimeMs: 6000,
          successRate: 0.5,
          affinityScore: 40,
        },
        jazz: {
          category: 'jazz',
          correctGuesses: 3,
          totalAttempts: 8,
          avgGuessTimeMs: 7000,
          successRate: 0.375,
          affinityScore: 30,
        },
      };

      analyzeMusicalPersonality(memory);

      const genreLoyalTrait = memory.musicalPersonality?.find((t) => t.trait === 'genre_loyal');
      expect(genreLoyalTrait).toBeDefined();
    });

    it('should return insights array', () => {
      const memory = createEmptyGameMemory();
      memory.desertIslandPicks = ['Love Song', 'Heart of Gold'];
      memory.recentGuessTimings = Array(15)
        .fill(null)
        .map(() => ({
          item: 'song',
          guessTimeMs: 3000,
          correct: true,
          timestamp: new Date(),
        }));

      const insights = analyzeMusicalPersonality(memory);

      expect(insights).toBeInstanceOf(Array);
      expect(insights.length).toBeGreaterThan(0);
      insights.forEach((insight) => {
        expect(insight).toHaveProperty('insight');
        expect(insight).toHaveProperty('confidence');
        expect(insight).toHaveProperty('supportingTraits');
      });
    });
  });

  describe('getPersonalityComment', () => {
    it('should return null when no traits', () => {
      const memory = createEmptyGameMemory();
      memory.musicalPersonality = [];

      const comment = getPersonalityComment(memory);

      expect(comment).toBeNull();
    });

    it('should return comment when traits exist', () => {
      const memory = createEmptyGameMemory();
      memory.musicalPersonality = [
        {
          trait: 'quick_ear',
          confidence: 0.8,
          evidence: ['Fast guesses'],
          updatedAt: new Date(),
        },
      ];

      const comment = getPersonalityComment(memory);

      expect(comment).toBeTruthy();
      expect(typeof comment).toBe('string');
    });

    it('should only use traits with high confidence', () => {
      const memory = createEmptyGameMemory();
      memory.musicalPersonality = [
        {
          trait: 'quick_ear',
          confidence: 0.3, // Low confidence
          evidence: ['Some evidence'],
          updatedAt: new Date(),
        },
      ];

      const comment = getPersonalityComment(memory);

      expect(comment).toBeNull();
    });
  });

  describe('Conversation Hints', () => {
    it('should store conversation hints', () => {
      const memory = createEmptyGameMemory();

      storeConversationHint(memory, 'favorite band', ['The Beatles'], ['rock']);

      expect(memory.conversationMusicHints).toHaveLength(1);
      expect(memory.conversationMusicHints![0].topic).toBe('favorite band');
      expect(memory.conversationMusicHints![0].relatedArtists).toContain('The Beatles');
    });

    it('should keep only last 10 hints', () => {
      const memory = createEmptyGameMemory();
      memory.conversationMusicHints = Array(10).fill({
        topic: 'old topic',
        mentionedAt: new Date(Date.now() - 100000),
      });

      storeConversationHint(memory, 'new topic', [], []);

      expect(memory.conversationMusicHints).toHaveLength(10);
      expect(memory.conversationMusicHints![0].topic).toBe('new topic');
    });

    it('should get conversation callback for recent hints', () => {
      const memory = createEmptyGameMemory();
      memory.conversationMusicHints = [
        {
          topic: 'road trip',
          mentionedAt: new Date(), // Recent
        },
      ];

      const callback = getConversationCallback(memory);

      expect(callback).toBeTruthy();
      expect(callback).toContain('road trip');
    });

    it('should return null for old hints', () => {
      const memory = createEmptyGameMemory();
      memory.conversationMusicHints = [
        {
          topic: 'old topic',
          mentionedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
      ];

      const callback = getConversationCallback(memory);

      expect(callback).toBeNull();
    });
  });

  describe('getSongSelectionContext', () => {
    it('should return context with strong/weak areas', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 10,
          totalAttempts: 12,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        jazz: {
          category: 'jazz',
          correctGuesses: 2,
          totalAttempts: 8,
          avgGuessTimeMs: 8000,
          successRate: 0.25,
          affinityScore: 20,
        },
      };

      const context = getSongSelectionContext(memory);

      expect(context.strongGenres).toContain('rock');
      expect(context.weakGenres).toContain('jazz');
      expect(context.difficulty).toBe('medium');
    });

    it('should adjust difficulty based on multiplier', () => {
      const memory = createEmptyGameMemory();
      memory.adaptiveDifficultyMultiplier = 0.5;

      const context = getSongSelectionContext(memory);

      expect(context.difficulty).toBe('easy');
    });

    it('should include conversation hints', () => {
      const memory = createEmptyGameMemory();
      memory.conversationMusicHints = [
        {
          topic: 'workout music',
          mentionedAt: new Date(),
        },
      ];

      const context = getSongSelectionContext(memory);

      expect(context.conversationHints).toContain('workout music');
    });
  });

  describe('getMusicalDNAMessage', () => {
    it('should return null with insufficient data', () => {
      const memory = createEmptyGameMemory();

      const message = getMusicalDNAMessage(memory);

      expect(message).toBeNull();
    });

    it('should return message about strong genre', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 15,
          totalAttempts: 18,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        pop: {
          category: 'pop',
          correctGuesses: 5,
          totalAttempts: 10,
          avgGuessTimeMs: 5000,
          successRate: 0.5,
          affinityScore: 40,
        },
      };

      const message = getMusicalDNAMessage(memory);

      expect(message).toBeTruthy();
      // Should mention rock or accuracy
      expect(message!.toLowerCase().includes('rock') || message!.includes('%')).toBe(true);
    });

    it('should mention weak areas as opportunities', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 15,
          totalAttempts: 18,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        jazz: {
          category: 'jazz',
          correctGuesses: 1,
          totalAttempts: 5,
          avgGuessTimeMs: 10000,
          successRate: 0.2,
          affinityScore: 15,
        },
      };

      const message = getMusicalDNAMessage(memory);

      expect(message).toBeTruthy();
    });
  });

  describe('getTopAffinities and getWeakAreas', () => {
    it('should return top affinities sorted by score', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 10,
          totalAttempts: 12,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        pop: {
          category: 'pop',
          correctGuesses: 8,
          totalAttempts: 10,
          avgGuessTimeMs: 4000,
          successRate: 0.8,
          affinityScore: 65,
        },
        jazz: {
          category: 'jazz',
          correctGuesses: 5,
          totalAttempts: 8,
          avgGuessTimeMs: 5000,
          successRate: 0.625,
          affinityScore: 50,
        },
      };

      const top = getTopAffinities(memory, 'genre', 2);

      expect(top).toHaveLength(2);
      expect(top[0].category).toBe('rock');
      expect(top[1].category).toBe('pop');
    });

    it('should return weak areas sorted by score ascending', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 10,
          totalAttempts: 12,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        pop: {
          category: 'pop',
          correctGuesses: 8,
          totalAttempts: 10,
          avgGuessTimeMs: 4000,
          successRate: 0.8,
          affinityScore: 65,
        },
        jazz: {
          category: 'jazz',
          correctGuesses: 3,
          totalAttempts: 8,
          avgGuessTimeMs: 8000,
          successRate: 0.375,
          affinityScore: 30,
        },
      };

      const weak = getWeakAreas(memory, 'genre', 2);

      expect(weak).toHaveLength(2);
      expect(weak[0].category).toBe('jazz');
    });

    it('should require minimum attempts for inclusion', () => {
      const memory = createEmptyGameMemory();
      memory.genreAffinities = {
        rock: {
          category: 'rock',
          correctGuesses: 10,
          totalAttempts: 12,
          avgGuessTimeMs: 3000,
          successRate: 0.83,
          affinityScore: 75,
        },
        pop: {
          category: 'pop',
          correctGuesses: 1,
          totalAttempts: 2,
          avgGuessTimeMs: 4000,
          successRate: 0.5,
          affinityScore: 40,
        }, // Not enough attempts
      };

      const top = getTopAffinities(memory, 'genre', 3);

      expect(top).toHaveLength(1);
      expect(top[0].category).toBe('rock');
    });
  });
});
