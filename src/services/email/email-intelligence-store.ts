/**
 * Email Intelligence Store
 *
 * Firestore persistence for email intelligence data:
 * - Sender profiles
 * - Follow-up tracking
 * - Newsletter subscriptions
 * - User preferences
 *
 * @module services/email/email-intelligence-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
} from '../../utils/firestore-utils.js';
import type { SenderProfile, EmailIntelligenceConfig } from './email-intelligence.js';
import type { FollowUp, ContactResponsePattern } from './follow-up-tracker.js';
import type { NewsletterSubscription, UnsubscribeRequest } from './unsubscribe-detector.js';

const log = createLogger({ module: 'email-intelligence-store' });

// ============================================================================
// TYPES
// ============================================================================

export interface EmailIntelligenceData {
  config: EmailIntelligenceConfig;
  senderProfiles: Record<string, SenderProfile>;
  followUps: Record<string, FollowUp>;
  contactPatterns: Record<string, ContactResponsePattern>;
  newsletters: Record<string, NewsletterSubscription>;
  unsubscribeRequests: Record<string, UnsubscribeRequest>;
  lastUpdated: string;
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const COLLECTION_NAME = 'email_intelligence';

function getDocRef(db: FirebaseFirestore.Firestore, userId: string) {
  return db.collection('users').doc(userId).collection(COLLECTION_NAME).doc('data');
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

/**
 * Get email intelligence data for a user
 */
export async function getEmailIntelligenceData(
  userId: string
): Promise<EmailIntelligenceData | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('email-intelligence-store', 'getEmailIntelligenceData');
    return null;
  }

  try {
    const doc = await getDocRef(db, userId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as EmailIntelligenceData;
    
    // Hydrate dates
    if (data.senderProfiles) {
      for (const profile of Object.values(data.senderProfiles)) {
        if (profile.updatedAt) profile.updatedAt = new Date(profile.updatedAt as unknown as string);
        if (profile.lastEmailAt) profile.lastEmailAt = new Date(profile.lastEmailAt as unknown as string);
        if (profile.lastResponseAt) profile.lastResponseAt = new Date(profile.lastResponseAt as unknown as string);
      }
    }

    if (data.followUps) {
      for (const followUp of Object.values(data.followUps)) {
        if (followUp.sentAt) followUp.sentAt = new Date(followUp.sentAt as unknown as string);
        if (followUp.dueDate) followUp.dueDate = new Date(followUp.dueDate as unknown as string);
        if (followUp.responseReceivedAt) followUp.responseReceivedAt = new Date(followUp.responseReceivedAt as unknown as string);
        if (followUp.reminderSentAt) followUp.reminderSentAt = new Date(followUp.reminderSentAt as unknown as string);
        if (followUp.createdAt) followUp.createdAt = new Date(followUp.createdAt as unknown as string);
        if (followUp.updatedAt) followUp.updatedAt = new Date(followUp.updatedAt as unknown as string);
      }
    }

    if (data.contactPatterns) {
      for (const pattern of Object.values(data.contactPatterns)) {
        if (pattern.updatedAt) pattern.updatedAt = new Date(pattern.updatedAt as unknown as string);
      }
    }

    if (data.newsletters) {
      for (const newsletter of Object.values(data.newsletters)) {
        if (newsletter.firstSeenAt) newsletter.firstSeenAt = new Date(newsletter.firstSeenAt as unknown as string);
        if (newsletter.lastSeenAt) newsletter.lastSeenAt = new Date(newsletter.lastSeenAt as unknown as string);
        if (newsletter.unsubscribedAt) newsletter.unsubscribedAt = new Date(newsletter.unsubscribedAt as unknown as string);
      }
    }

    if (data.unsubscribeRequests) {
      for (const request of Object.values(data.unsubscribeRequests)) {
        if (request.requestedAt) request.requestedAt = new Date(request.requestedAt as unknown as string);
        if (request.completedAt) request.completedAt = new Date(request.completedAt as unknown as string);
        if (request.link?.detectedAt) request.link.detectedAt = new Date(request.link.detectedAt as unknown as string);
      }
    }

    log.debug({ userId }, 'Email intelligence data loaded from Firestore');
    return data;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get email intelligence data');
    return null;
  }
}

/**
 * Save email intelligence data for a user
 */
export async function saveEmailIntelligenceData(
  userId: string,
  data: EmailIntelligenceData
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('email-intelligence-store', 'saveEmailIntelligenceData');
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    const cleanedData = cleanForFirestore({
      ...data,
      lastUpdated: new Date().toISOString(),
    });

    await getDocRef(db, userId).set(cleanedData, { merge: true });
    log.debug({ userId }, 'Email intelligence data saved to Firestore');
    return { success: true };
  } catch (error) {
    const errorMsg = String(error);
    log.error({ error: errorMsg, userId }, 'Failed to save email intelligence data');
    return { success: false, error: errorMsg };
  }
}

/**
 * Save just sender profiles (partial update)
 */
export async function saveSenderProfiles(
  userId: string,
  profiles: Record<string, SenderProfile>
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    await getDocRef(db, userId).set(
      cleanForFirestore({ senderProfiles: profiles, lastUpdated: new Date().toISOString() }),
      { merge: true }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Save just follow-ups (partial update)
 */
export async function saveFollowUps(
  userId: string,
  followUps: Record<string, FollowUp>
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    await getDocRef(db, userId).set(
      cleanForFirestore({ followUps, lastUpdated: new Date().toISOString() }),
      { merge: true }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Save just newsletters (partial update)
 */
export async function saveNewsletters(
  userId: string,
  newsletters: Record<string, NewsletterSubscription>
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    await getDocRef(db, userId).set(
      cleanForFirestore({ newsletters, lastUpdated: new Date().toISOString() }),
      { merge: true }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Save email intelligence config
 */
export async function saveEmailConfig(
  userId: string,
  config: EmailIntelligenceConfig
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    await getDocRef(db, userId).set(
      cleanForFirestore({ config, lastUpdated: new Date().toISOString() }),
      { merge: true }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Delete email intelligence data
 */
export async function deleteEmailIntelligenceData(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) {
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    await getDocRef(db, userId).delete();
    log.info({ userId }, 'Email intelligence data deleted');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
