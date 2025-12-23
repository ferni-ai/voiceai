/**
 * Billing Persistence
 *
 * Firestore persistence for billing data including usage records,
 * monthly aggregates, and revenue shares.
 *
 * Collections:
 * - marketplace_usage/{recordId} - Individual usage records (TTL: 90 days)
 * - marketplace_monthly_usage/{userId_itemId_period} - Monthly aggregates
 * - marketplace_revenue_shares/{publisherId_period} - Revenue share calculations
 */

import { removeUndefined } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, UserId } from '../schema/types.js';
import type { RevenueShare, UsageMetrics, UsageRecord } from './index.js';

const log = getLogger().child({ module: 'billing-persistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface BillingStore {
  // Usage records
  saveUsageRecord(record: UsageRecord): Promise<void>;
  getUsageRecords(
    userId: UserId,
    options?: { itemId?: MarketplaceId; startDate?: string; endDate?: string; limit?: number }
  ): Promise<UsageRecord[]>;

  // Monthly usage aggregates
  getMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string
  ): Promise<UsageMetrics | null>;
  updateMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string,
    metrics: UsageMetrics
  ): Promise<void>;

  // Revenue shares
  saveRevenueShare(share: RevenueShare): Promise<void>;
  getRevenueShares(publisherId: string, options?: { status?: string }): Promise<RevenueShare[]>;
  updateRevenueShareStatus(
    itemId: MarketplaceId,
    period: string,
    status: RevenueShare['status']
  ): Promise<void>;

  // Initialization
  initialize(): Promise<void>;
  isAvailable(): boolean;
}

// ============================================================================
// FIRESTORE IMPLEMENTATION
// ============================================================================

const COLLECTIONS = {
  USAGE: 'marketplace_usage',
  MONTHLY_USAGE: 'marketplace_monthly_usage',
  REVENUE_SHARES: 'marketplace_revenue_shares',
} as const;

class FirestoreBillingStore implements BillingStore {
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
      log.info('Firestore billing store initialized');
    } catch (error) {
      log.warn({ error }, 'Firestore not available for billing');
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.db !== null;
  }

  // ---- Usage Records ----

  async saveUsageRecord(record: UsageRecord): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    await this.db
      .collection(COLLECTIONS.USAGE)
      .doc(record.id)
      .set(
        removeUndefined({
          ...record,
          _createdAt: new Date(),
        })
      );
  }

  async getUsageRecords(
    userId: UserId,
    options?: { itemId?: MarketplaceId; startDate?: string; endDate?: string; limit?: number }
  ): Promise<UsageRecord[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db
      .collection(COLLECTIONS.USAGE)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc');

    if (options?.itemId) {
      query = query.where('itemId', '==', options.itemId);
    }

    if (options?.startDate) {
      query = query.where('timestamp', '>=', options.startDate);
    }

    if (options?.endDate) {
      query = query.where('timestamp', '<=', options.endDate);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const { _createdAt, ...record } = data;
      return record as UsageRecord;
    });
  }

  // ---- Monthly Usage ----

  async getMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string
  ): Promise<UsageMetrics | null> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${userId}:${itemId}:${period}`;
    const doc = await this.db.collection(COLLECTIONS.MONTHLY_USAGE).doc(docId).get();

    if (!doc.exists) return null;

    const data = doc.data();
    if (!data) return null;

    return data.metrics as UsageMetrics;
  }

  async updateMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string,
    metrics: UsageMetrics
  ): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${userId}:${itemId}:${period}`;
    await this.db
      .collection(COLLECTIONS.MONTHLY_USAGE)
      .doc(docId)
      .set(
        removeUndefined({
          userId,
          itemId,
          period,
          metrics,
          _updatedAt: new Date(),
        }),
        { merge: true }
      );
  }

  // ---- Revenue Shares ----

  async saveRevenueShare(share: RevenueShare): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    const docId = `${share.publisherId}:${share.period}:${share.itemId}`;
    await this.db
      .collection(COLLECTIONS.REVENUE_SHARES)
      .doc(docId)
      .set(
        removeUndefined({
          ...share,
          _updatedAt: new Date(),
        })
      );
  }

  async getRevenueShares(
    publisherId: string,
    options?: { status?: string }
  ): Promise<RevenueShare[]> {
    if (!this.db) throw new Error('Firestore not initialized');

    let query: FirebaseFirestore.Query = this.db
      .collection(COLLECTIONS.REVENUE_SHARES)
      .where('publisherId', '==', publisherId);

    if (options?.status) {
      query = query.where('status', '==', options.status);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const { _updatedAt, ...share } = data;
      return share as RevenueShare;
    });
  }

  async updateRevenueShareStatus(
    itemId: MarketplaceId,
    period: string,
    status: RevenueShare['status']
  ): Promise<void> {
    if (!this.db) throw new Error('Firestore not initialized');

    // Find and update the revenue share
    const snapshot = await this.db
      .collection(COLLECTIONS.REVENUE_SHARES)
      .where('itemId', '==', itemId)
      .where('period', '==', period)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        status,
        _updatedAt: new Date(),
      });
    }
  }
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION
// ============================================================================

class InMemoryBillingStore implements BillingStore {
  private usageRecords: UsageRecord[] = [];
  private monthlyUsage = new Map<string, UsageMetrics>();
  private revenueShares: RevenueShare[] = [];

  async initialize(): Promise<void> {
    log.info('In-memory billing store initialized');
  }

  isAvailable(): boolean {
    return true;
  }

  async saveUsageRecord(record: UsageRecord): Promise<void> {
    this.usageRecords.push(record);
  }

  async getUsageRecords(
    userId: UserId,
    options?: { itemId?: MarketplaceId; startDate?: string; endDate?: string; limit?: number }
  ): Promise<UsageRecord[]> {
    let records = this.usageRecords.filter((r) => r.userId === userId);

    if (options?.itemId) {
      records = records.filter((r) => r.itemId === options.itemId);
    }

    if (options?.startDate) {
      records = records.filter((r) => r.timestamp >= options.startDate!);
    }

    if (options?.endDate) {
      records = records.filter((r) => r.timestamp <= options.endDate!);
    }

    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (options?.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  async getMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string
  ): Promise<UsageMetrics | null> {
    const key = `${userId}:${itemId}:${period}`;
    return this.monthlyUsage.get(key) || null;
  }

  async updateMonthlyUsage(
    userId: UserId,
    itemId: MarketplaceId,
    period: string,
    metrics: UsageMetrics
  ): Promise<void> {
    const key = `${userId}:${itemId}:${period}`;
    this.monthlyUsage.set(key, metrics);
  }

  async saveRevenueShare(share: RevenueShare): Promise<void> {
    // Update if exists, otherwise add
    const index = this.revenueShares.findIndex(
      (s) =>
        s.publisherId === share.publisherId &&
        s.period === share.period &&
        s.itemId === share.itemId
    );
    if (index >= 0) {
      this.revenueShares[index] = share;
    } else {
      this.revenueShares.push(share);
    }
  }

  async getRevenueShares(
    publisherId: string,
    options?: { status?: string }
  ): Promise<RevenueShare[]> {
    let shares = this.revenueShares.filter((s) => s.publisherId === publisherId);

    if (options?.status) {
      shares = shares.filter((s) => s.status === options.status);
    }

    return shares;
  }

  async updateRevenueShareStatus(
    itemId: MarketplaceId,
    period: string,
    status: RevenueShare['status']
  ): Promise<void> {
    const share = this.revenueShares.find((s) => s.itemId === itemId && s.period === period);
    if (share) {
      share.status = status;
    }
  }

  // For testing
  clear(): void {
    this.usageRecords = [];
    this.monthlyUsage.clear();
    this.revenueShares = [];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let storeInstance: BillingStore | null = null;

/**
 * Get the billing store instance.
 * Returns Firestore in production, in-memory for development.
 */
export async function getBillingStore(): Promise<BillingStore> {
  if (storeInstance) return storeInstance;

  // Try Firestore first in production
  const useFirestore =
    process.env.NODE_ENV === 'production' ||
    process.env.USE_FIRESTORE_BILLING === 'true' ||
    process.env.GCP_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;

  if (useFirestore) {
    try {
      const firestoreStore = new FirestoreBillingStore();
      await firestoreStore.initialize();
      storeInstance = firestoreStore;
      log.info('Using Firestore billing store');
      return storeInstance;
    } catch (error) {
      log.warn({ error }, 'Firestore not available for billing, falling back to in-memory');
    }
  }

  // Fall back to in-memory
  storeInstance = new InMemoryBillingStore();
  await storeInstance.initialize();
  log.info('Using in-memory billing store');
  return storeInstance;
}

/**
 * Reset the store (for testing)
 */
export function resetBillingStore(): void {
  storeInstance = null;
}

/**
 * Create an in-memory store (for testing)
 */
export function createInMemoryBillingStore(): InMemoryBillingStore {
  return new InMemoryBillingStore();
}
