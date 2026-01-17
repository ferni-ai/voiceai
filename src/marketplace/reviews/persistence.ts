/**
 * Reviews Firestore Persistence
 *
 * Persists reviews data to Firestore for production use.
 *
 * Collections:
 * - marketplace_reviews/{reviewId} - Review documents
 * - marketplace_review_votes/{reviewId_userId} - Vote records
 * - marketplace_review_stats/{itemId} - Aggregated statistics
 */

import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, UserId } from '../schema/types.js';
import type { Review, ReviewStats, ReviewVote } from './types.js';

const log = getLogger().child({ module: 'reviews-persistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewsStore {
  // Reviews
  saveReview(review: Review): Promise<void>;
  getReview(reviewId: string): Promise<Review | null>;
  listReviews(
    itemId: MarketplaceId,
    options?: {
      status?: Review['status'];
      sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ reviews: Review[]; total: number }>;
  updateReview(reviewId: string, updates: Partial<Review>): Promise<void>;
  deleteReview(reviewId: string): Promise<void>;
  getUserReviews(userId: UserId): Promise<Review[]>;
  getPendingReviews(limit?: number): Promise<Review[]>;

  // Votes
  saveVote(vote: ReviewVote): Promise<void>;
  getVote(reviewId: string, userId: UserId): Promise<ReviewVote | null>;
  deleteVote(reviewId: string, userId: UserId): Promise<void>;

  // Stats
  getStats(itemId: MarketplaceId): Promise<ReviewStats | null>;
  updateStats(itemId: MarketplaceId, stats: ReviewStats): Promise<void>;

  // Initialization
  initialize(): Promise<void>;
  isAvailable(): boolean;
}

// ============================================================================
// FIRESTORE IMPLEMENTATION
// ============================================================================

const COLLECTIONS = {
  REVIEWS: 'marketplace_reviews',
  VOTES: 'marketplace_review_votes',
  STATS: 'marketplace_review_stats',
} as const;

class FirestoreReviewsStore implements ReviewsStore {
  private db: FirebaseFirestore.Firestore | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const admin = await import('firebase-admin');

      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        });
      }

      this.db = admin.firestore();
      this.initialized = true;
      log.info('Firestore reviews store initialized');
    } catch (error) {
      log.warn({ error }, 'Firestore not available for reviews');
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.db !== null;
  }

  // ---- Reviews ----

  async saveReview(review: Review): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.REVIEWS)
      .doc(review.id)
      .set(
        removeUndefined({
          ...review,
          _updatedAt: new Date(),
        })
      );
    log.debug({ reviewId: review.id }, 'Review saved to Firestore');
  }

  async getReview(reviewId: string): Promise<Review | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.REVIEWS).doc(reviewId).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    // Strip internal fields
    const { _updatedAt, _createdAt, ...review } = data;
    return review as Review;
  }

  async listReviews(
    itemId: MarketplaceId,
    options?: {
      status?: Review['status'];
      sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ reviews: Review[]; total: number }> {
    if (!this.db) throw new Error('Firestore not initialized');

    // Build base query
    let query: FirebaseFirestore.Query = this.db
      .collection(COLLECTIONS.REVIEWS)
      .where('itemId', '==', itemId);

    // Filter by status
    const status = options?.status || 'approved';
    query = query.where('status', '==', status);

    // Get total count first (requires separate query in Firestore)
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Apply sorting
    const sortBy = options?.sortBy || 'recent';
    switch (sortBy) {
      case 'recent':
        query = query.orderBy('createdAt', 'desc');
        break;
      case 'helpful':
        query = query.orderBy('helpfulCount', 'desc');
        break;
      case 'rating_high':
        query = query.orderBy('rating', 'desc');
        break;
      case 'rating_low':
        query = query.orderBy('rating', 'asc');
        break;
    }

    // Apply pagination
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    if (offset > 0) {
      // Firestore doesn't have offset, need to use cursor-based pagination
      // For simplicity, we'll fetch all and slice (not ideal for large datasets)
      const allDocs = await query.get();
      const reviews = allDocs.docs.slice(offset, offset + limit).map((doc) => {
        const { _updatedAt, _createdAt, ...review } = doc.data();
        return review as Review;
      });
      return { reviews, total };
    }

    query = query.limit(limit);
    const snapshot = await query.get();
    const reviews = snapshot.docs.map((doc) => {
      const { _updatedAt, _createdAt, ...review } = doc.data();
      return review as Review;
    });

    return { reviews, total };
  }

  async updateReview(reviewId: string, updates: Partial<Review>): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.REVIEWS)
      .doc(reviewId)
      .update(
        cleanForFirestore({
          ...updates,
          _updatedAt: new Date(),
        })
      );
    log.debug({ reviewId }, 'Review updated in Firestore');
  }

  async deleteReview(reviewId: string): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db.collection(COLLECTIONS.REVIEWS).doc(reviewId).delete();
    log.debug({ reviewId }, 'Review deleted from Firestore');
  }

  async getUserReviews(userId: UserId): Promise<Review[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    const snapshot = await this.db
      .collection(COLLECTIONS.REVIEWS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const { _updatedAt, _createdAt, ...review } = doc.data();
      return review as Review;
    });
  }

  async getPendingReviews(limit = 50): Promise<Review[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    const snapshot = await this.db
      .collection(COLLECTIONS.REVIEWS)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const { _updatedAt, _createdAt, ...review } = doc.data();
      return review as Review;
    });
  }

  // ---- Votes ----

  async saveVote(vote: ReviewVote): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${vote.reviewId}_${vote.userId}`;
    await this.db.collection(COLLECTIONS.VOTES).doc(docId).set(removeUndefined(vote));
  }

  async getVote(reviewId: string, userId: UserId): Promise<ReviewVote | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${reviewId}_${userId}`;
    const doc = await this.db.collection(COLLECTIONS.VOTES).doc(docId).get();

    if (!doc.exists) return null;
    return doc.data() as ReviewVote;
  }

  async deleteVote(reviewId: string, userId: UserId): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${reviewId}_${userId}`;
    await this.db.collection(COLLECTIONS.VOTES).doc(docId).delete();
  }

  // ---- Stats ----

  async getStats(itemId: MarketplaceId): Promise<ReviewStats | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const doc = await this.db.collection(COLLECTIONS.STATS).doc(itemId).get();
    if (!doc.exists) return null;

    return doc.data() as ReviewStats;
  }

  async updateStats(itemId: MarketplaceId, stats: ReviewStats): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.STATS)
      .doc(itemId)
      .set(
        removeUndefined({
          ...stats,
          _updatedAt: new Date(),
        }),
        { merge: true }
      );
  }
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION
// ============================================================================

class InMemoryReviewsStore implements ReviewsStore {
  private reviews = new Map<string, Review>();
  private votes = new Map<string, ReviewVote>();
  private stats = new Map<MarketplaceId, ReviewStats>();

  async initialize(): Promise<void> {
    log.info('In-memory reviews store initialized');
  }

  isAvailable(): boolean {
    return true;
  }

  async saveReview(review: Review): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async getReview(reviewId: string): Promise<Review | null> {
    return this.reviews.get(reviewId) || null;
  }

  async listReviews(
    itemId: MarketplaceId,
    options?: {
      status?: Review['status'];
      sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ reviews: Review[]; total: number }> {
    let reviews = Array.from(this.reviews.values()).filter((r) => r.itemId === itemId);

    const status = options?.status || 'approved';
    reviews = reviews.filter((r) => r.status === status);

    const sortBy = options?.sortBy || 'recent';
    switch (sortBy) {
      case 'recent':
        reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'helpful':
        reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
        break;
      case 'rating_high':
        reviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'rating_low':
        reviews.sort((a, b) => a.rating - b.rating);
        break;
    }

    const total = reviews.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;

    return {
      reviews: reviews.slice(offset, offset + limit),
      total,
    };
  }

  async updateReview(reviewId: string, updates: Partial<Review>): Promise<void> {
    const existing = this.reviews.get(reviewId);
    if (existing) {
      this.reviews.set(reviewId, { ...existing, ...updates });
    }
  }

  async deleteReview(reviewId: string): Promise<void> {
    this.reviews.delete(reviewId);
  }

  async getUserReviews(userId: UserId): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter((r) => r.userId === userId);
  }

  async getPendingReviews(limit = 50): Promise<Review[]> {
    return Array.from(this.reviews.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, limit);
  }

  async saveVote(vote: ReviewVote): Promise<void> {
    const key = `${vote.reviewId}_${vote.userId}`;
    this.votes.set(key, vote);
  }

  async getVote(reviewId: string, userId: UserId): Promise<ReviewVote | null> {
    const key = `${reviewId}_${userId}`;
    return this.votes.get(key) || null;
  }

  async deleteVote(reviewId: string, userId: UserId): Promise<void> {
    const key = `${reviewId}_${userId}`;
    this.votes.delete(key);
  }

  async getStats(itemId: MarketplaceId): Promise<ReviewStats | null> {
    return this.stats.get(itemId) || null;
  }

  async updateStats(itemId: MarketplaceId, stats: ReviewStats): Promise<void> {
    this.stats.set(itemId, stats);
  }

  // For testing
  clear(): void {
    this.reviews.clear();
    this.votes.clear();
    this.stats.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let storeInstance: ReviewsStore | null = null;

/**
 * Get the reviews store instance
 */
export async function getReviewsStore(): Promise<ReviewsStore> {
  if (storeInstance) return storeInstance;

  const useFirestore =
    process.env.NODE_ENV === 'production' ||
    process.env.USE_FIRESTORE_REVIEWS === 'true' ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;

  if (useFirestore) {
    try {
      const firestoreStore = new FirestoreReviewsStore();
      await firestoreStore.initialize();
      storeInstance = firestoreStore;
      log.info('Using Firestore reviews store');
      return storeInstance;
    } catch (error) {
      log.warn({ error }, 'Firestore not available for reviews, falling back to in-memory');
    }
  }

  storeInstance = new InMemoryReviewsStore();
  await storeInstance.initialize();
  log.info('Using in-memory reviews store');
  return storeInstance;
}

/**
 * Reset the store (for testing)
 */
export function resetReviewsStore(): void {
  storeInstance = null;
}

/**
 * Create an in-memory store (for testing)
 */
export function createInMemoryReviewsStore(): InMemoryReviewsStore {
  return new InMemoryReviewsStore();
}
