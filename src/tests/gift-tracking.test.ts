/**
 * Gift Tracking Service Tests
 *
 * Tests for gift tracking including:
 * - Gift CRUD operations
 * - Gift suggestions (AI-powered)
 * - Gift history and patterns
 * - Upcoming gift occasions
 * - Analytics
 * - Integration with interaction recording
 *
 * @module tests/gift-tracking
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  recordGift,
  getGiftHistory,
  getAllGifts,
  updateGiftReaction,
  generateGiftSuggestions,
  getUpcomingGiftOccasions,
  getGiftAnalytics,
  clearGiftCache,
  type Gift,
  type GiftSuggestion,
} from '../services/contacts/gift-tracking-service.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../memory/firebase-client.js', () => ({
  getFirestoreClient: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            set: vi.fn().mockResolvedValue(undefined),
          }),
          orderBy: () => ({
            get: vi.fn().mockResolvedValue({ docs: [] }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('../services/contacts/contact-relationship-service.js', () => ({
  getContact: vi.fn().mockResolvedValue({
    contactId: 'contact-123',
    name: 'Test Contact',
    relationship: 'friend',
    topics: ['hiking', 'cooking'],
    importantDates: [{ date: '03-15', type: 'birthday', label: 'Birthday' }],
  }),
  recordInteraction: vi.fn().mockResolvedValue({
    id: 'int_123',
    contactId: 'contact-123',
    type: 'gift',
  }),
  getContacts: vi.fn().mockResolvedValue([
    {
      contactId: 'contact-123',
      name: 'Test Contact',
      importantDates: [{ date: '03-15', type: 'birthday', label: 'Birthday' }],
    },
  ]),
}));

vi.mock('../services/llm-utils.js', () => ({
  callLLM: vi.fn().mockResolvedValue(`[
    {
      "idea": "Custom hiking journal",
      "description": "A beautiful leather journal for recording trail adventures",
      "priceRange": "$30-50",
      "confidence": "high",
      "reasoning": "They love hiking and this is personal",
      "tags": ["outdoor", "personal", "thoughtful"]
    },
    {
      "idea": "Gourmet spice set",
      "description": "Collection of unique spices from around the world",
      "priceRange": "$40-60",
      "confidence": "high",
      "reasoning": "Perfect for someone who loves cooking",
      "tags": ["cooking", "gourmet", "experience"]
    }
  ]`),
}));

describe('Gift Tracking Service', () => {
  const testUserId = 'test-user-123';
  const testContactId = 'contact-123';

  beforeEach(() => {
    clearGiftCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearGiftCache();
  });

  describe('recordGift', () => {
    it('should record a gift given', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'John Doe',
        direction: 'given',
        item: 'Book about gardening',
        occasion: 'Birthday',
        date: new Date('2024-03-15'),
        price: 25,
        tags: ['books', 'gardening'],
      });

      expect(gift).toBeDefined();
      expect(gift.id).toMatch(/^gift_/);
      expect(gift.userId).toBe(testUserId);
      expect(gift.direction).toBe('given');
      expect(gift.item).toBe('Book about gardening');
      expect(gift.contactName).toBe('John Doe');
    });

    it('should record a gift received', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Jane Smith',
        direction: 'received',
        item: 'Handmade scarf',
        occasion: 'Christmas',
        date: new Date('2024-12-25'),
      });

      expect(gift.direction).toBe('received');
      expect(gift.item).toBe('Handmade scarf');
    });

    it('should record gift with optional fields', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Mom',
        direction: 'given',
        item: 'Spa gift card',
        occasion: "Mother's Day",
        date: new Date(),
        description: 'Gift card for her favorite spa',
        price: 100,
        notes: 'She mentioned wanting to relax more',
        tags: ['self-care', 'experience'],
      });

      expect(gift.description).toBe('Gift card for her favorite spa');
      expect(gift.price).toBe(100);
      expect(gift.notes).toBe('She mentioned wanting to relax more');
      expect(gift.tags).toContain('self-care');
    });

    it('should automatically record an interaction when gift is recorded', async () => {
      const { recordInteraction } =
        await import('../services/contacts/contact-relationship-service.js');

      await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Friend',
        direction: 'given',
        item: 'Test gift',
        occasion: 'Birthday',
        date: new Date(),
      });

      expect(recordInteraction).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          contactId: testContactId,
          type: 'gift_given', // Uses the proper InteractionType
          direction: 'outbound',
        })
      );
    });
  });

  describe('getGiftHistory', () => {
    it('should return gift history for a contact', async () => {
      // Record some gifts
      await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test Person',
        direction: 'given',
        item: 'First Gift',
        occasion: 'Birthday',
        date: new Date('2024-01-15'),
        tags: ['books'],
      });

      await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test Person',
        direction: 'received',
        item: 'Second Gift',
        occasion: 'Christmas',
        date: new Date('2024-12-25'),
        tags: ['electronics'],
      });

      const history = await getGiftHistory(testUserId, testContactId);

      expect(history.given).toHaveLength(1);
      expect(history.received).toHaveLength(1);
      expect(history.given[0].item).toBe('First Gift');
      expect(history.received[0].item).toBe('Second Gift');
    });

    it('should calculate patterns from gift history', async () => {
      // Record multiple gifts with overlapping tags
      await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Gift 1',
        occasion: 'Birthday',
        date: new Date(),
        price: 50,
        tags: ['books', 'personal'],
      });

      await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Gift 2',
        occasion: 'Christmas',
        date: new Date(),
        price: 100,
        tags: ['books', 'experience'],
      });

      const history = await getGiftHistory(testUserId, testContactId);

      expect(history.patterns.favoriteCategories).toContain('books');
      expect(history.patterns.averageSpending).toBe(75); // (50 + 100) / 2
      expect(history.patterns.preferredOccasions).toContain('Birthday');
      expect(history.patterns.preferredOccasions).toContain('Christmas');
    });

    it('should return empty history for contact with no gifts', async () => {
      const history = await getGiftHistory(testUserId, 'no-gifts-contact');

      expect(history.given).toHaveLength(0);
      expect(history.received).toHaveLength(0);
      expect(history.patterns.favoriteCategories).toHaveLength(0);
      expect(history.patterns.averageSpending).toBe(0);
    });
  });

  describe('getAllGifts', () => {
    it('should return all gifts for a user', async () => {
      await recordGift(testUserId, {
        contactId: 'contact-1',
        contactName: 'Person 1',
        direction: 'given',
        item: 'Gift A',
        occasion: 'Birthday',
        date: new Date(),
      });

      await recordGift(testUserId, {
        contactId: 'contact-2',
        contactName: 'Person 2',
        direction: 'received',
        item: 'Gift B',
        occasion: 'Christmas',
        date: new Date(),
      });

      const allGifts = await getAllGifts(testUserId);

      expect(allGifts).toHaveLength(2);
    });

    it('should return empty array for user with no gifts', async () => {
      const allGifts = await getAllGifts('user-no-gifts');
      expect(allGifts).toEqual([]);
    });
  });

  describe('updateGiftReaction', () => {
    it('should update gift reaction', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Test Gift',
        occasion: 'Birthday',
        date: new Date(),
      });

      const updated = await updateGiftReaction(testUserId, gift.id, 'loved');

      expect(updated).toBeDefined();
      expect(updated?.reaction).toBe('loved');
    });

    it('should return null for non-existent gift', async () => {
      const result = await updateGiftReaction(testUserId, 'non-existent-id', 'liked');
      expect(result).toBeNull();
    });

    it('should allow changing reaction', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Test Gift',
        occasion: 'Birthday',
        date: new Date(),
      });

      await updateGiftReaction(testUserId, gift.id, 'liked');
      const updated = await updateGiftReaction(testUserId, gift.id, 'neutral');

      expect(updated?.reaction).toBe('neutral');
    });
  });

  describe('generateGiftSuggestions', () => {
    it('should generate personalized gift suggestions', async () => {
      const suggestions = await generateGiftSuggestions(testUserId, testContactId, 'Birthday');

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toHaveProperty('idea');
      expect(suggestions[0]).toHaveProperty('description');
      expect(suggestions[0]).toHaveProperty('priceRange');
      expect(suggestions[0]).toHaveProperty('confidence');
      expect(suggestions[0]).toHaveProperty('reasoning');
    });

    it('should generate suggestions with budget constraints', async () => {
      const suggestions = await generateGiftSuggestions(testUserId, testContactId, 'Christmas', {
        min: 50,
        max: 100,
      });

      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should return default suggestions on LLM failure', async () => {
      const { callLLM } = await import('../services/llm-utils.js');
      vi.mocked(callLLM).mockRejectedValueOnce(new Error('LLM error'));

      const suggestions = await generateGiftSuggestions(testUserId, testContactId, 'birthday');

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('getUpcomingGiftOccasions', () => {
    it('should return upcoming occasions sorted by date', async () => {
      const occasions = await getUpcomingGiftOccasions(testUserId, 90);

      expect(Array.isArray(occasions)).toBe(true);
      // Occasions should be sorted by daysUntil
      for (let i = 1; i < occasions.length; i++) {
        expect(occasions[i].daysUntil).toBeGreaterThanOrEqual(occasions[i - 1].daysUntil);
      }
    });

    it('should include last gift information when available', async () => {
      // Record a birthday gift
      await recordGift(testUserId, {
        contactId: 'contact-123',
        contactName: 'Test Contact',
        direction: 'given',
        item: 'Last Birthday Gift',
        occasion: 'birthday',
        date: new Date('2023-03-15'),
      });

      const occasions = await getUpcomingGiftOccasions(testUserId, 365);

      const birthdayOccasion = occasions.find((o) => o.occasion.toLowerCase().includes('birthday'));
      if (birthdayOccasion) {
        expect(birthdayOccasion.lastGiftGiven?.item).toBe('Last Birthday Gift');
      }
    });
  });

  describe('getGiftAnalytics', () => {
    it('should calculate gift analytics', async () => {
      // Record multiple gifts
      await recordGift(testUserId, {
        contactId: 'contact-1',
        contactName: 'Person 1',
        direction: 'given',
        item: 'Gift 1',
        occasion: 'Birthday',
        date: new Date(),
        price: 50,
        reaction: 'loved',
        tags: ['books'],
      });

      await recordGift(testUserId, {
        contactId: 'contact-1',
        contactName: 'Person 1',
        direction: 'given',
        item: 'Gift 2',
        occasion: 'Christmas',
        date: new Date(),
        price: 100,
        reaction: 'liked',
        tags: ['electronics'],
      });

      await recordGift(testUserId, {
        contactId: 'contact-2',
        contactName: 'Person 2',
        direction: 'received',
        item: 'Gift 3',
        occasion: 'Birthday',
        date: new Date(),
        tags: ['books'],
      });

      const analytics = await getGiftAnalytics(testUserId);

      expect(analytics.totalGiven).toBe(2);
      expect(analytics.totalReceived).toBe(1);
      expect(analytics.totalSpent).toBe(150);
      expect(analytics.averagePerGift).toBe(75);
      expect(analytics.topRecipients).toHaveLength(1);
      expect(analytics.topRecipients[0].name).toBe('Person 1');
      expect(analytics.topRecipients[0].count).toBe(2);
      expect(analytics.popularCategories.some((c) => c.category === 'books')).toBe(true);
      expect(analytics.reactionBreakdown['loved']).toBe(1);
      expect(analytics.reactionBreakdown['liked']).toBe(1);
    });

    it('should handle empty analytics', async () => {
      const analytics = await getGiftAnalytics('user-no-gifts');

      expect(analytics.totalGiven).toBe(0);
      expect(analytics.totalReceived).toBe(0);
      expect(analytics.totalSpent).toBe(0);
      expect(analytics.averagePerGift).toBe(0);
      expect(analytics.topRecipients).toHaveLength(0);
      expect(analytics.popularCategories).toHaveLength(0);
    });
  });

  describe('Gift Reactions', () => {
    it('should track all reaction types', async () => {
      const reactions: Array<Gift['reaction']> = ['loved', 'liked', 'neutral', 'disliked'];

      for (const reaction of reactions) {
        const gift = await recordGift(testUserId, {
          contactId: testContactId,
          contactName: 'Test',
          direction: 'given',
          item: `Gift with ${reaction}`,
          occasion: 'Test',
          date: new Date(),
        });

        const updated = await updateGiftReaction(testUserId, gift.id, reaction);
        expect(updated?.reaction).toBe(reaction);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle gifts with no price', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Handmade card',
        occasion: 'Birthday',
        date: new Date(),
        // No price
      });

      expect(gift.price).toBeUndefined();

      const analytics = await getGiftAnalytics(testUserId);
      expect(analytics.totalSpent).toBe(0);
    });

    it('should handle gifts with string date', async () => {
      const gift = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Test Gift',
        occasion: 'Birthday',
        date: '2024-06-15' as unknown as Date,
      });

      expect(gift.date).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for each gift', async () => {
      const gift1 = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Gift 1',
        occasion: 'Test',
        date: new Date(),
      });

      const gift2 = await recordGift(testUserId, {
        contactId: testContactId,
        contactName: 'Test',
        direction: 'given',
        item: 'Gift 2',
        occasion: 'Test',
        date: new Date(),
      });

      expect(gift1.id).not.toBe(gift2.id);
    });
  });
});
