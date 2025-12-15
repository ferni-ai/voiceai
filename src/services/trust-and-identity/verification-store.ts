/**
 * Verification Code Storage
 *
 * Persistent storage for phone verification codes using Firestore.
 * Codes expire after 10 minutes and are automatically cleaned up.
 *
 * Storage path: verification_codes/{codeId}
 *
 * @module VerificationStore
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval } from '../../utils/interval-manager.js';

const log = getLogger().child({ module: 'VerificationStore' });

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationCode {
  userId: string;
  phone: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  verifiedAt?: Date;
}

interface StoredVerificationCode {
  userId: string;
  phone: string;
  code: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  attempts: number;
  verified: boolean;
  verifiedAt?: FirebaseFirestore.Timestamp;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'verification_codes';
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let firestoreInstance: Firestore | null = null;

function getFirestoreInstance(): Firestore | null {
  if (!firestoreInstance) {
    try {
      firestoreInstance = getFirestore();
    } catch {
      log.warn('Firestore not available - using in-memory fallback');
      return null;
    }
  }
  return firestoreInstance;
}

// ============================================================================
// IN-MEMORY FALLBACK (for development without Firestore)
// ============================================================================

const inMemoryStore = new Map<string, VerificationCode>();

// Cleanup expired codes periodically (every 5 minutes, managed by IntervalManager)
registerInterval('verification-code-cleanup', () => {
  const now = new Date();
  for (const [key, code] of inMemoryStore.entries()) {
    if (code.expiresAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a new verification code for a user
 */
export async function createVerificationCode(
  userId: string,
  phone: string
): Promise<{ code: string; expiresAt: Date }> {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MS);

  const verificationCode: VerificationCode = {
    userId,
    phone,
    code,
    createdAt: now,
    expiresAt,
    attempts: 0,
    verified: false,
  };

  // Try Firestore first
  const db = getFirestoreInstance();
  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(userId);
      await docRef.set({
        ...verificationCode,
        createdAt: now,
        expiresAt,
      });

      log.info(
        { userId, phone: phone.slice(-4), expiresAt },
        'Verification code created in Firestore'
      );
    } catch (error) {
      log.warn({ error, userId }, 'Failed to save to Firestore - using in-memory');
      inMemoryStore.set(userId, verificationCode);
    }
  } else {
    // Use in-memory fallback
    inMemoryStore.set(userId, verificationCode);
    log.debug({ userId, phone: phone.slice(-4) }, 'Verification code created in-memory');
  }

  return { code, expiresAt };
}

/**
 * Verify a code provided by the user
 */
export async function verifyCode(
  userId: string,
  providedCode: string
): Promise<{
  valid: boolean;
  reason: 'success' | 'expired' | 'invalid' | 'max_attempts' | 'not_found';
  phone?: string;
}> {
  // Try Firestore first
  const db = getFirestoreInstance();
  let storedCode: VerificationCode | null = null;

  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(userId);
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data() as StoredVerificationCode;
        storedCode = {
          ...data,
          createdAt: data.createdAt.toDate(),
          expiresAt: data.expiresAt.toDate(),
          verifiedAt: data.verifiedAt?.toDate(),
        };
      }
    } catch (error) {
      log.warn({ error, userId }, 'Failed to read from Firestore - checking in-memory');
    }
  }

  // Fallback to in-memory
  if (!storedCode) {
    storedCode = inMemoryStore.get(userId) || null;
  }

  // No code found
  if (!storedCode) {
    return { valid: false, reason: 'not_found' };
  }

  // Already verified
  if (storedCode.verified) {
    return { valid: true, reason: 'success', phone: storedCode.phone };
  }

  // Expired
  if (storedCode.expiresAt < new Date()) {
    await deleteVerificationCode(userId);
    return { valid: false, reason: 'expired' };
  }

  // Too many attempts
  if (storedCode.attempts >= MAX_ATTEMPTS) {
    await deleteVerificationCode(userId);
    return { valid: false, reason: 'max_attempts' };
  }

  // Increment attempts
  storedCode.attempts++;

  // Check code
  if (storedCode.code === providedCode) {
    // Success! Mark as verified
    storedCode.verified = true;
    storedCode.verifiedAt = new Date();

    // Update in store
    if (db) {
      try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        await docRef.update({
          verified: true,
          verifiedAt: storedCode.verifiedAt,
          attempts: storedCode.attempts,
        });
      } catch (error) {
        log.warn({ error, userId }, 'Failed to update Firestore - updating in-memory');
        inMemoryStore.set(userId, storedCode);
      }
    } else {
      inMemoryStore.set(userId, storedCode);
    }

    log.info({ userId, phone: storedCode.phone.slice(-4) }, '✅ Verification code validated');
    return { valid: true, reason: 'success', phone: storedCode.phone };
  }

  // Wrong code - update attempts
  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(userId);
      await docRef.update({ attempts: storedCode.attempts });
    } catch {
      inMemoryStore.set(userId, storedCode);
    }
  } else {
    inMemoryStore.set(userId, storedCode);
  }

  log.debug({ userId, attempts: storedCode.attempts }, 'Invalid verification code attempt');
  return { valid: false, reason: 'invalid' };
}

/**
 * Get pending verification code for a user (without revealing the code)
 */
export async function getVerificationStatus(userId: string): Promise<{
  hasPendingCode: boolean;
  phone?: string;
  expiresAt?: Date;
  attemptsRemaining?: number;
  verified?: boolean;
} | null> {
  const db = getFirestoreInstance();
  let storedCode: VerificationCode | null = null;

  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(userId);
      const doc = await docRef.get();

      if (doc.exists) {
        const data = doc.data() as StoredVerificationCode;
        storedCode = {
          ...data,
          createdAt: data.createdAt.toDate(),
          expiresAt: data.expiresAt.toDate(),
          verifiedAt: data.verifiedAt?.toDate(),
        };
      }
    } catch {
      // Fall through to in-memory
    }
  }

  if (!storedCode) {
    storedCode = inMemoryStore.get(userId) || null;
  }

  if (!storedCode) {
    return null;
  }

  // Check if expired
  if (storedCode.expiresAt < new Date()) {
    await deleteVerificationCode(userId);
    return null;
  }

  return {
    hasPendingCode: true,
    phone: storedCode.phone,
    expiresAt: storedCode.expiresAt,
    attemptsRemaining: MAX_ATTEMPTS - storedCode.attempts,
    verified: storedCode.verified,
  };
}

/**
 * Delete verification code (after verification or expiry)
 */
export async function deleteVerificationCode(userId: string): Promise<void> {
  const db = getFirestoreInstance();

  if (db) {
    try {
      const docRef = db.collection(COLLECTION_NAME).doc(userId);
      await docRef.delete();
    } catch (error) {
      log.warn({ error, userId }, 'Failed to delete from Firestore');
    }
  }

  inMemoryStore.delete(userId);
}

/**
 * Cleanup expired codes (called periodically or on startup)
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const db = getFirestoreInstance();
  let cleanedCount = 0;

  if (db) {
    try {
      const now = new Date();
      const expiredQuery = db.collection(COLLECTION_NAME).where('expiresAt', '<', now);

      const snapshot = await expiredQuery.get();

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        cleanedCount++;
      });

      if (cleanedCount > 0) {
        await batch.commit();
        log.info({ cleanedCount }, 'Expired verification codes cleaned up');
      }
    } catch (error) {
      log.warn({ error }, 'Failed to cleanup expired codes in Firestore');
    }
  }

  // Also cleanup in-memory
  const now = new Date();
  for (const [key, code] of inMemoryStore.entries()) {
    if (code.expiresAt < now) {
      inMemoryStore.delete(key);
      cleanedCount++;
    }
  }

  return cleanedCount;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createVerificationCode,
  verifyCode,
  getVerificationStatus,
  deleteVerificationCode,
  cleanupExpiredCodes,
};
