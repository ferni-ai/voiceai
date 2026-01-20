/**
 * Helpers for Unified Data Service
 *
 * @module services/ceo/unified-data/helpers
 */

import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import type { Period } from './types.js';

// ============================================================================
// PERIOD HELPERS
// ============================================================================

export function getPeriodStartDate(period: Period): Date {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'quarter':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

export function getUserCollection(userId: string, collectionName: string) {
  const db = getFirestoreDb();
  if (!db) return null;
  return db.collection('users').doc(userId).collection(collectionName);
}

export function getGlobalCollection(collectionName: string) {
  const db = getFirestoreDb();
  if (!db) return null;
  return db.collection(collectionName);
}
