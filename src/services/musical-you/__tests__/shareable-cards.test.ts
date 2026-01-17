/**
 * Shareable Cards Unit Tests
 *
 * Tests for card generation, SVG rendering, and storage.
 */

import { describe, it, expect } from 'vitest';
import {
  generateMusicalDNACard,
  generateDesertIslandCard,
  generateGameVictoryCard,
  getCard,
  getUserCards,
  generateMusicalDNASVG,
  generateDesertIslandSVG,
  generateVictorySVG,
} from '../shareable-cards.js';
import type { MusicalDNA, DesertIslandPicks } from '../types.js';

describe('Shareable Cards', () => {
  const mockUserId = 'test-user-123';

  describe('generateMusicalDNACard', () => {
    it('should generate a Musical DNA card', () => {
      // Create a mock that satisfies the function
      const mockDNA = {
        userId: mockUserId,
        personalityType: 'explorer',
        personalityLabel: 'The Explorer',
        personalityDescription: 'You love discovering new music across genres',
        genreAffinities: [
          {
            genre: 'rock',
            displayName: 'Rock',
            affinityScore: 85,
            accuracy: 0.8,
            avgGuessTimeMs: 3000,
            totalGuesses: 100,
            correctGuesses: 80,
            trend: 'up',
          },
        ],
        decadeAffinities: [],
        artistAffinities: [],
        behavioralTraits: [],
        totalGamesPlayed: 25,
      } as unknown as MusicalDNA;

      const card = generateMusicalDNACard(mockUserId, mockDNA);

      expect(card).toBeDefined();
      expect(card.type).toBe('musical-dna');
      expect(card.userId).toBe(mockUserId);
      expect(card.id).toContain('dna-');
      expect(card.shareUrl).toContain('ferni.ai/share/');
      expect(card.viewCount).toBe(0);
    });
  });

  describe('generateDesertIslandCard', () => {
    it('should generate a Desert Island card', () => {
      const mockPicks = {
        userId: mockUserId,
        picks: [
          {
            rank: 1,
            trackId: 'track-1',
            trackName: 'Bohemian Rhapsody',
            artistName: 'Queen',
            reason: 'The ultimate epic rock song',
            addedAt: new Date(),
          },
          {
            rank: 2,
            trackId: 'track-2',
            trackName: 'Imagine',
            artistName: 'John Lennon',
            reason: 'A song of hope',
            addedAt: new Date(),
          },
        ],
        completedAt: new Date(),
        version: 1,
      } as unknown as DesertIslandPicks;

      const card = generateDesertIslandCard(mockUserId, mockPicks);

      expect(card).toBeDefined();
      expect(card.type).toBe('desert-island');
      expect(card.userId).toBe(mockUserId);
      expect(card.id).toContain('island-');
      expect(card.expiresAt).toBeNull(); // Desert Island cards don't expire
    });
  });

  describe('generateGameVictoryCard', () => {
    it('should generate a Game Victory card', () => {
      const card = generateGameVictoryCard(
        mockUserId,
        'name-that-tune',
        'Name That Tune',
        95,
        'Hotel California',
        'Eagles',
        2500,
        true
      );

      expect(card).toBeDefined();
      expect(card.type).toBe('game-victory');
      expect(card.userId).toBe(mockUserId);
      expect(card.id).toContain('victory-');
    });

    it('should generate card with different parameters', () => {
      const card = generateGameVictoryCard(
        mockUserId,
        'name-that-tune',
        'Name That Tune',
        75,
        'Yesterday',
        'The Beatles',
        undefined,
        false
      );

      expect(card).toBeDefined();
      expect(card.type).toBe('game-victory');
    });
  });

  describe('getCard', () => {
    it('should retrieve a generated card by ID', () => {
      const mockDNA = {
        userId: mockUserId,
        personalityType: 'specialist',
        personalityLabel: 'The Specialist',
        personalityDescription: 'Deep expertise in specific genres',
        genreAffinities: [
          {
            genre: 'jazz',
            displayName: 'Jazz',
            affinityScore: 95,
            accuracy: 0.9,
            avgGuessTimeMs: 2000,
            totalGuesses: 200,
            correctGuesses: 180,
            trend: 'stable',
          },
        ],
        decadeAffinities: [],
        artistAffinities: [],
        behavioralTraits: [],
        totalGamesPlayed: 100,
      } as unknown as MusicalDNA;

      const createdCard = generateMusicalDNACard(mockUserId, mockDNA);
      const retrievedCard = getCard(createdCard.id);

      expect(retrievedCard).toBeDefined();
      expect(retrievedCard?.id).toBe(createdCard.id);
    });

    it('should return null for non-existent card', () => {
      const card = getCard('non-existent-card-id');
      expect(card).toBeNull();
    });
  });

  describe('getUserCards', () => {
    it('should return all cards for a user', () => {
      const cards = getUserCards(mockUserId);

      expect(cards).toBeDefined();
      expect(Array.isArray(cards)).toBe(true);
    });

    it('should filter cards by type', () => {
      const dnaCards = getUserCards(mockUserId, 'musical-dna');

      expect(dnaCards).toBeDefined();
      dnaCards.forEach((card) => {
        expect(card.type).toBe('musical-dna');
      });
    });
  });

  describe('SVG Generation', () => {
    describe('generateMusicalDNASVG', () => {
      it('should generate valid SVG for Musical DNA', () => {
        const svg = generateMusicalDNASVG({
          type: 'musical-dna',
          personalityLabel: 'The Explorer',
          personalityDescription: 'Loves discovering new music',
          topGenres: [
            { name: 'Rock', score: 85 },
            { name: 'Jazz', score: 70 },
            { name: 'Electronic', score: 65 },
          ],
          totalGames: 25,
          currentStreak: 5,
        });

        expect(svg).toBeDefined();
        expect(typeof svg).toBe('string');
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).toContain('The Explorer');
        expect(svg).toContain('MUSICAL DNA');
      });

      it('should use design system colors', () => {
        const svg = generateMusicalDNASVG({
          type: 'musical-dna',
          personalityLabel: 'Test',
          personalityDescription: 'Test description',
          topGenres: [{ name: 'Rock', score: 85 }],
          totalGames: 10,
          currentStreak: 0,
        });

        // Should use colors from CARD_COLORS constant
        expect(svg).toContain('#2C2520'); // naturalInk
        expect(svg).toContain('#4a6741'); // ferniPrimary
        expect(svg).toContain('#faf6f0'); // textPrimary
      });
    });

    describe('generateDesertIslandSVG', () => {
      it('should generate valid SVG for Desert Island', () => {
        const svg = generateDesertIslandSVG({
          type: 'desert-island',
          picks: [
            { rank: 1, trackName: 'Bohemian Rhapsody', artistName: 'Queen', reason: 'Epic' },
            { rank: 2, trackName: 'Imagine', artistName: 'John Lennon', reason: 'Peaceful' },
          ],
          curatedDate: new Date(),
        });

        expect(svg).toBeDefined();
        expect(svg).toContain('<svg');
        expect(svg).toContain('DESERT ISLAND DISCS');
        expect(svg).toContain('Bohemian Rhapsody');
      });
    });

    describe('generateVictorySVG', () => {
      it('should generate valid SVG for Victory card', () => {
        const svg = generateVictorySVG({
          type: 'game-victory',
          gameType: 'name-that-tune',
          gameDisplayName: 'Name That Tune',
          score: 95,
          trackName: 'Hotel California',
          artistName: 'Eagles',
          guessTimeMs: 2500,
          isPersonalBest: true,
        });

        expect(svg).toBeDefined();
        expect(svg).toContain('<svg');
        expect(svg).toContain('NAME THAT TUNE');
        expect(svg).toContain('95');
        expect(svg).toContain('PERSONAL BEST');
      });

      it('should not show personal best banner when false', () => {
        const svg = generateVictorySVG({
          type: 'game-victory',
          gameType: 'name-that-tune',
          gameDisplayName: 'Name That Tune',
          score: 75,
          isPersonalBest: false,
        });

        expect(svg).not.toContain('PERSONAL BEST');
      });
    });
  });
});
