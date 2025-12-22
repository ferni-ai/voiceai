/**
 * Tests for Creative DNA Identity Card Generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateIdentityCardData,
  generateIdentityCardHTML,
  generateShareableCardData,
  parseShareableCardData,
  generateOGMetaTags,
  getPersonalityStyles,
  type IdentityCardData,
} from '../../services/creative-you/identity-card-generator.js';
import type { CreativeDNA } from '../../services/creative-you/creative-dna.js';

describe('Identity Card Generator', () => {
  const mockDNA: CreativeDNA = {
    userId: 'test-user-123',
    personalityLabel: 'Deep Diver',
    personalityDescription: 'You go deep into topics that matter.',
    topTopics: [
      { topic: 'philosophy', score: 95 },
      { topic: 'creativity', score: 85 },
      { topic: 'psychology', score: 75 },
    ],
    totalVideosWatched: 42,
    totalPodcastsListened: 18,
    totalInsightsSaved: 25,
    learningStyle: 'deep-dive',
    topVideoCategories: [],
    topPodcastCategories: [],
    preferredContentLength: 'medium',
    preferredMoods: ['learn', 'reflect'],
    engagementPattern: 'night-owl',
    emergingInterests: [],
    averageWatchCompletion: 85,
    discussionParticipation: 60,
    lastUpdated: new Date().toISOString(),
    firstCreated: new Date().toISOString(),
  };

  describe('generateIdentityCardData', () => {
    it('should create card data from CreativeDNA', () => {
      const cardData = generateIdentityCardData(mockDNA);

      expect(cardData.userId).toBe('test-user-123');
      expect(cardData.personalityLabel).toBe('Deep Diver');
      expect(cardData.personalityDescription).toBe('You go deep into topics that matter.');
      expect(cardData.stats.videosWatched).toBe(42);
      expect(cardData.stats.podcastsListened).toBe(18);
      expect(cardData.stats.insightsSaved).toBe(25);
    });

    it('should limit top topics to 5', () => {
      const dnaWithManyTopics: CreativeDNA = {
        ...mockDNA,
        topTopics: [
          { topic: 'topic1', score: 100 },
          { topic: 'topic2', score: 90 },
          { topic: 'topic3', score: 80 },
          { topic: 'topic4', score: 70 },
          { topic: 'topic5', score: 60 },
          { topic: 'topic6', score: 50 },
          { topic: 'topic7', score: 40 },
        ],
      };

      const cardData = generateIdentityCardData(dnaWithManyTopics);
      expect(cardData.topTopics.length).toBe(5);
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalDNA: Partial<CreativeDNA> = {
        userId: 'minimal-user',
        personalityLabel: '',
        personalityDescription: '',
        topTopics: [],
        totalVideosWatched: 0,
        totalPodcastsListened: 0,
        totalInsightsSaved: 0,
      };

      const cardData = generateIdentityCardData(minimalDNA as CreativeDNA);
      expect(cardData.personalityLabel).toBe('Creative Soul');
      expect(cardData.personalityDescription).toBe('Every journey is unique.');
    });
  });

  describe('getPersonalityStyles', () => {
    it('should return correct styles for Deep Diver', () => {
      const styles = getPersonalityStyles('Deep Diver');
      expect(styles.primaryColor).toBe('#3a6b73');
    });

    it('should return correct styles for Growth Seeker', () => {
      const styles = getPersonalityStyles('Growth Seeker');
      expect(styles.primaryColor).toBe('#4a6741');
    });

    it('should return default styles for unknown personality', () => {
      const styles = getPersonalityStyles('Unknown Type');
      expect(styles.primaryColor).toBe('#4a6741'); // Default Ferni green
    });
  });

  describe('generateIdentityCardHTML', () => {
    it('should generate valid HTML', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const html = generateIdentityCardHTML(cardData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain(cardData.personalityLabel);
    });

    it('should include personality emoji', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const html = generateIdentityCardHTML(cardData);

      // Deep Diver should have ocean emoji
      expect(html).toContain('🌊');
    });

    it('should include stats in HTML', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const html = generateIdentityCardHTML(cardData);

      expect(html).toContain('42'); // videos watched
      expect(html).toContain('18'); // podcasts listened
      expect(html).toContain('25'); // insights saved
    });

    it('should include topic bars', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const html = generateIdentityCardHTML(cardData);

      expect(html).toContain('philosophy');
      expect(html).toContain('creativity');
      expect(html).toContain('psychology');
    });

    it('should include Ferni branding', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const html = generateIdentityCardHTML(cardData);

      expect(html).toContain('ferni.ai');
    });
  });

  describe('Shareable Card Data', () => {
    it('should encode and decode card data correctly', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const encoded = generateShareableCardData(cardData);

      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = parseShareableCardData(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.personalityLabel).toBe('Deep Diver');
    });

    it('should handle invalid encoded data gracefully', () => {
      const invalidData = 'not-valid-base64-data!!!';
      const decoded = parseShareableCardData(invalidData);
      expect(decoded).toBeNull();
    });

    it('should create compact shareable data', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const encoded = generateShareableCardData(cardData);

      // Should be reasonably compact for URL sharing
      expect(encoded.length).toBeLessThan(500);
    });
  });

  describe('generateOGMetaTags', () => {
    it('should generate Open Graph meta tags', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const metaTags = generateOGMetaTags(cardData);

      expect(metaTags).toContain('og:title');
      expect(metaTags).toContain('og:description');
      expect(metaTags).toContain('twitter:card');
      expect(metaTags).toContain("I'm a Deep Diver");
    });

    it('should include top topics in description', () => {
      const cardData = generateIdentityCardData(mockDNA);
      const metaTags = generateOGMetaTags(cardData);

      expect(metaTags).toContain('philosophy');
    });
  });
});

