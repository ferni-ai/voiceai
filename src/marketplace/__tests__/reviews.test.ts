/**
 * Marketplace Reviews Tests
 *
 * Tests for the ratings and reviews system:
 * - Creating, updating, deleting reviews
 * - Helpfulness voting
 * - Publisher responses
 * - Moderation workflow
 * - Review statistics
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

import {
  addPublisherResponse,
  clearReviewsData,
  createReview,
  deleteReview,
  flagReview,
  getPendingReviews,
  getReview,
  getReviewStats,
  listReviews,
  moderateReview,
  updateReview,
  voteReview,
} from '../reviews/index.js';

describe('Marketplace Reviews', () => {
  beforeEach(() => {
    clearReviewsData();
  });

  afterEach(() => {
    clearReviewsData();
  });

  describe('createReview', () => {
    it('should create a review with valid input', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 5,
        title: 'Great tool!',
        body: 'This tool really helped me with my workflow.',
      });

      expect(review).toBeDefined();
      expect(review.id).toBeDefined();
      expect(review.rating).toBe(5);
      expect(review.title).toBe('Great tool!');
      expect(review.status).toBe('pending');
    });

    it('should reject invalid ratings', () => {
      expect(() =>
        createReview({
          itemId: 'tool-123',
          itemType: 'tool',
          userId: 'user-456',
          rating: 6, // Invalid - max is 5
          title: 'Test',
          body: 'Test body',
        })
      ).toThrow();

      expect(() =>
        createReview({
          itemId: 'tool-123',
          itemType: 'tool',
          userId: 'user-456',
          rating: 0, // Invalid - min is 1
          title: 'Test',
          body: 'Test body',
        })
      ).toThrow();
    });

    it('should prevent duplicate reviews from same user', () => {
      createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'First review',
        body: 'Good tool',
      });

      expect(() =>
        createReview({
          itemId: 'tool-123',
          itemType: 'tool',
          userId: 'user-456', // Same user
          rating: 5,
          title: 'Second review',
          body: 'Trying again',
        })
      ).toThrow(/already reviewed/i);
    });
  });

  describe('getReview', () => {
    it('should retrieve an existing review', () => {
      const created = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      const retrieved = getReview(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return null for non-existent review', () => {
      const retrieved = getReview('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateReview', () => {
    it('should allow author to update their review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'Original',
        body: 'Original body',
      });

      const updated = updateReview(review.id, 'user-456', {
        rating: 5,
        title: 'Updated',
        body: 'Updated body',
      });

      expect(updated.rating).toBe(5);
      expect(updated.title).toBe('Updated');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should reject updates from non-author', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      expect(() =>
        updateReview(review.id, 'different-user', {
          rating: 1,
          title: 'Hacked',
        })
      ).toThrow(/not authorized/i);
    });
  });

  describe('deleteReview', () => {
    it('should allow author to delete their review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      deleteReview(review.id, 'user-456');

      const retrieved = getReview(review.id);
      expect(retrieved).toBeNull();
    });

    it('should reject deletion from non-author', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-456',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      expect(() => deleteReview(review.id, 'different-user')).toThrow(/not authorized/i);
    });
  });

  describe('listReviews', () => {
    beforeEach(() => {
      // Create multiple reviews for testing (use status: pending to find them)
      createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-1',
        rating: 5,
        title: 'Excellent',
        body: 'Best tool ever',
      });
      createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-2',
        rating: 3,
        title: 'Okay',
        body: 'Does the job',
      });
      createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-3',
        rating: 4,
        title: 'Good',
        body: 'Recommended',
      });
    });

    it('should list all reviews for an item', () => {
      const result = listReviews('tool-123', { status: 'pending' });
      expect(result.reviews).toHaveLength(3);
    });

    it('should sort by recent by default', () => {
      const result = listReviews('tool-123', { status: 'pending', sortBy: 'recent' });
      expect(result.reviews).toHaveLength(3);
      // Most recent first
      expect(new Date(result.reviews[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result.reviews[1].createdAt).getTime()
      );
    });

    it('should sort by rating high', () => {
      const result = listReviews('tool-123', { status: 'pending', sortBy: 'rating_high' });
      expect(result.reviews[0].rating).toBe(5);
      expect(result.reviews[2].rating).toBe(3);
    });

    it('should support pagination', () => {
      const page1 = listReviews('tool-123', { status: 'pending', limit: 2, offset: 0 });
      const page2 = listReviews('tool-123', { status: 'pending', limit: 2, offset: 2 });

      expect(page1.reviews).toHaveLength(2);
      expect(page2.reviews).toHaveLength(1);
    });
  });

  describe('voteReview', () => {
    it('should record helpful vote', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      const updated = voteReview(review.id, 'voter-1', true);
      expect(updated.helpfulCount).toBe(1);
    });

    it('should record unhelpful vote', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      const updated = voteReview(review.id, 'voter-1', false);
      expect(updated.notHelpfulCount).toBe(1);
    });

    it('should prevent author from voting on own review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      expect(() => voteReview(review.id, 'author', true)).toThrow(/own review/i);
    });

    it('should allow changing vote', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      voteReview(review.id, 'voter-1', true);
      const updated = voteReview(review.id, 'voter-1', false);

      expect(updated.helpfulCount).toBe(0);
      expect(updated.notHelpfulCount).toBe(1);
    });
  });

  describe('flagReview', () => {
    it('should flag a review for moderation', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      flagReview(review.id, 'reporter', 'This is clearly spam');

      const flagged = getReview(review.id);
      expect(flagged?.status).toBe('flagged');
      expect(flagged?.moderationNote).toContain('spam');
    });

    it('should track reporter in moderation note', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      flagReview(review.id, 'reporter-123', 'Suspicious content');

      const flagged = getReview(review.id);
      expect(flagged?.moderationNote).toContain('reporter-123');
    });
  });

  describe('moderateReview', () => {
    it('should approve a flagged review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 4,
        title: 'Test',
        body: 'Test body',
      });

      flagReview(review.id, 'reporter', 'spam');

      const moderated = moderateReview(review.id, 'admin-1', 'approved', 'Review is legitimate');

      expect(moderated.status).toBe('approved');
      expect(moderated.moderatedAt).toBeDefined();
      expect(moderated.moderatedBy).toBe('admin-1');
    });

    it('should reject a review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'author',
        rating: 1,
        title: 'SPAM',
        body: 'Buy my stuff!',
      });

      const moderated = moderateReview(review.id, 'admin-1', 'rejected', 'Spam content');

      expect(moderated.status).toBe('rejected');
    });
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews', () => {
      // Create pending review
      createReview({
        itemId: 'tool-1',
        itemType: 'tool',
        userId: 'user-1',
        rating: 4,
        title: 'Pending',
        body: 'New review',
      });

      // Create another pending review
      createReview({
        itemId: 'tool-2',
        itemType: 'tool',
        userId: 'user-2',
        rating: 1,
        title: 'Also Pending',
        body: 'Another new review',
      });

      const pending = getPendingReviews();
      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.every((r) => r.status === 'pending')).toBe(true);
    });
  });

  describe('addPublisherResponse', () => {
    it('should allow publisher to respond to review', () => {
      const review = createReview({
        itemId: 'tool-123',
        itemType: 'tool',
        userId: 'user-1',
        rating: 2,
        title: 'Not great',
        body: 'Had issues',
      });

      const withResponse = addPublisherResponse(
        review.id,
        'pub-123',
        'Thank you for the feedback. We have addressed the issues in version 2.0.'
      );

      expect(withResponse.publisherResponse).toBeDefined();
      expect(withResponse.publisherResponse?.body).toContain('version 2.0');
      expect(withResponse.publisherResponse?.respondedBy).toBe('pub-123');
    });
  });

  describe('getReviewStats', () => {
    beforeEach(() => {
      // Create reviews with various ratings and approve them
      const review1 = createReview({
        itemId: 'tool-stats',
        itemType: 'tool',
        userId: 'user-1',
        rating: 5,
        title: 'A',
        body: 'Body',
      });
      moderateReview(review1.id, 'admin', 'approved');

      const review2 = createReview({
        itemId: 'tool-stats',
        itemType: 'tool',
        userId: 'user-2',
        rating: 5,
        title: 'B',
        body: 'Body',
      });
      moderateReview(review2.id, 'admin', 'approved');

      const review3 = createReview({
        itemId: 'tool-stats',
        itemType: 'tool',
        userId: 'user-3',
        rating: 4,
        title: 'C',
        body: 'Body',
      });
      moderateReview(review3.id, 'admin', 'approved');

      const review4 = createReview({
        itemId: 'tool-stats',
        itemType: 'tool',
        userId: 'user-4',
        rating: 3,
        title: 'D',
        body: 'Body',
      });
      moderateReview(review4.id, 'admin', 'approved');
    });

    it('should calculate correct average rating', () => {
      const stats = getReviewStats('tool-stats');

      expect(stats.totalReviews).toBe(4);
      expect(stats.averageRating).toBeCloseTo(4.3, 1); // (5+5+4+3)/4 = 4.25, rounded to 4.3
    });

    it('should provide rating distribution', () => {
      const stats = getReviewStats('tool-stats');

      expect(stats.ratingDistribution[5]).toBe(2);
      expect(stats.ratingDistribution[4]).toBe(1);
      expect(stats.ratingDistribution[3]).toBe(1);
      expect(stats.ratingDistribution[2]).toBe(0);
      expect(stats.ratingDistribution[1]).toBe(0);
    });

    it('should return empty stats for item with no reviews', () => {
      const stats = getReviewStats('no-reviews');

      expect(stats.totalReviews).toBe(0);
      expect(stats.averageRating).toBe(0);
    });
  });
});
