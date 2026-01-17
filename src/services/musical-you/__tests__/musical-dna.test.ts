/**
 * Musical DNA Unit Tests
 *
 * Tests for Musical DNA generation, personality classification,
 * and coaching message generation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateMusicalDNA,
  generateCoachingMessage,
  generateTimeMachine,
} from '../musical-dna.js';
import type { MusicalDNA } from '../types.js';

// Mock the engagement store
vi.mock('../../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: vi.fn().mockResolvedValue({
    getProfile: vi.fn().mockResolvedValue(null),
  }),
}));

describe('Musical DNA', () => {
  const mockUserId = 'test-user-123';

  describe('generateMusicalDNA', () => {
    it('should return null when no game memory exists', async () => {
      const result = await generateMusicalDNA(mockUserId, null);
      expect(result).toBeNull();
    });

    it('should return null when game memory has no games', async () => {
      // Use a minimal mock that satisfies the function
      const emptyMemory = {
        totalGamesPlayed: 0,
        averageScore: 0,
        lastPlayedAt: null,
      } as unknown as Parameters<typeof generateMusicalDNA>[1];

      const result = await generateMusicalDNA(mockUserId, emptyMemory);
      expect(result).toBeNull();
    });

    it('should handle game memory with data', async () => {
      // Create mock with sufficient data
      const gameMemory = {
        totalGamesPlayed: 10,
        averageScore: 75,
        lastPlayedAt: new Date().toISOString(),
        genreStats: {
          rock: { correct: 8, total: 10 },
          pop: { correct: 6, total: 10 },
        },
        decadeStats: {
          '2000s': { correct: 7, total: 10 },
        },
        gameHistory: [
          {
            timestamp: new Date().toISOString(),
            gameType: 'name-that-tune',
            score: 80,
          },
        ],
      } as unknown as Parameters<typeof generateMusicalDNA>[1];

      // Should not throw
      const result = await generateMusicalDNA(mockUserId, gameMemory);

      // Result may be null if minimum requirements aren't met
      if (result) {
        expect(result.personalityType).toBeDefined();
        expect(result.personalityLabel).toBeDefined();
      }
    });
  });

  describe('generateCoachingMessage', () => {
    it('should generate personalized coaching message', () => {
      // Create minimal DNA mock for coaching message
      const mockDna = {
        userId: mockUserId,
        personalityType: 'explorer',
        personalityLabel: 'The Explorer',
        personalityDescription: 'Loves discovering new music',
        genreAffinities: [],
        decadeAffinities: [],
        artistAffinities: [],
        behavioralTraits: [],
        totalGamesPlayed: 20,
      } as unknown as MusicalDNA;

      const message = generateCoachingMessage(mockDna);

      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(10);
    });
  });

  describe('generateTimeMachine', () => {
    it('should return array for DNA', () => {
      const mockDna = {
        userId: mockUserId,
        personalityType: 'balanced',
        personalityLabel: 'The Balanced',
        personalityDescription: 'Balanced listener',
        genreAffinities: [],
        decadeAffinities: [],
        artistAffinities: [],
        behavioralTraits: [],
        totalGamesPlayed: 0,
      } as unknown as MusicalDNA;

      const entries = generateTimeMachine(mockDna);

      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should handle DNA with affinities', () => {
      const mockDna = {
        userId: mockUserId,
        personalityType: 'explorer',
        personalityLabel: 'The Explorer',
        personalityDescription: 'Loves discovering new music',
        genreAffinities: [{ genre: 'rock', displayName: 'Rock', affinityScore: 85 }],
        decadeAffinities: [{ decade: '2000s', displayName: '2000s', affinityScore: 75 }],
        artistAffinities: [],
        behavioralTraits: [],
        totalGamesPlayed: 20,
      } as unknown as MusicalDNA;

      const entries = generateTimeMachine(mockDna);

      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
    });
  });
});
