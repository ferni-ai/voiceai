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
import { getFirestoreDb, cleanForFirestore, recordDegradation, } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'email-intelligence-store' });
// ============================================================================
// COLLECTION PATHS
// ============================================================================
const COLLECTION_NAME = 'email_intelligence';
function getDocRef(db, userId) {
    return db.collection('users').doc(userId).collection(COLLECTION_NAME).doc('data');
}
// ============================================================================
// STORE OPERATIONS
// ============================================================================
/**
 * Get email intelligence data for a user
 */
export async function getEmailIntelligenceData(userId) {
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
        const data = doc.data();
        // Hydrate dates
        if (data.senderProfiles) {
            for (const profile of Object.values(data.senderProfiles)) {
                if (profile.updatedAt)
                    profile.updatedAt = new Date(profile.updatedAt);
                if (profile.lastEmailAt)
                    profile.lastEmailAt = new Date(profile.lastEmailAt);
                if (profile.lastResponseAt)
                    profile.lastResponseAt = new Date(profile.lastResponseAt);
            }
        }
        if (data.followUps) {
            for (const followUp of Object.values(data.followUps)) {
                if (followUp.sentAt)
                    followUp.sentAt = new Date(followUp.sentAt);
                if (followUp.dueDate)
                    followUp.dueDate = new Date(followUp.dueDate);
                if (followUp.responseReceivedAt)
                    followUp.responseReceivedAt = new Date(followUp.responseReceivedAt);
                if (followUp.reminderSentAt)
                    followUp.reminderSentAt = new Date(followUp.reminderSentAt);
                if (followUp.createdAt)
                    followUp.createdAt = new Date(followUp.createdAt);
                if (followUp.updatedAt)
                    followUp.updatedAt = new Date(followUp.updatedAt);
            }
        }
        if (data.contactPatterns) {
            for (const pattern of Object.values(data.contactPatterns)) {
                if (pattern.updatedAt)
                    pattern.updatedAt = new Date(pattern.updatedAt);
            }
        }
        if (data.newsletters) {
            for (const newsletter of Object.values(data.newsletters)) {
                if (newsletter.firstSeenAt)
                    newsletter.firstSeenAt = new Date(newsletter.firstSeenAt);
                if (newsletter.lastSeenAt)
                    newsletter.lastSeenAt = new Date(newsletter.lastSeenAt);
                if (newsletter.unsubscribedAt)
                    newsletter.unsubscribedAt = new Date(newsletter.unsubscribedAt);
            }
        }
        if (data.unsubscribeRequests) {
            for (const request of Object.values(data.unsubscribeRequests)) {
                if (request.requestedAt)
                    request.requestedAt = new Date(request.requestedAt);
                if (request.completedAt)
                    request.completedAt = new Date(request.completedAt);
                if (request.link?.detectedAt)
                    request.link.detectedAt = new Date(request.link.detectedAt);
            }
        }
        log.debug({ userId }, 'Email intelligence data loaded from Firestore');
        return data;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get email intelligence data');
        return null;
    }
}
/**
 * Save email intelligence data for a user
 */
export async function saveEmailIntelligenceData(userId, data) {
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
    }
    catch (error) {
        const errorMsg = String(error);
        log.error({ error: errorMsg, userId }, 'Failed to save email intelligence data');
        return { success: false, error: errorMsg };
    }
}
/**
 * Save just sender profiles (partial update)
 */
export async function saveSenderProfiles(userId, profiles) {
    const db = getFirestoreDb();
    if (!db) {
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        await getDocRef(db, userId).set(cleanForFirestore({ senderProfiles: profiles, lastUpdated: new Date().toISOString() }), { merge: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
/**
 * Save just follow-ups (partial update)
 */
export async function saveFollowUps(userId, followUps) {
    const db = getFirestoreDb();
    if (!db) {
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        await getDocRef(db, userId).set(cleanForFirestore({ followUps, lastUpdated: new Date().toISOString() }), { merge: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
/**
 * Save just newsletters (partial update)
 */
export async function saveNewsletters(userId, newsletters) {
    const db = getFirestoreDb();
    if (!db) {
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        await getDocRef(db, userId).set(cleanForFirestore({ newsletters, lastUpdated: new Date().toISOString() }), { merge: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
/**
 * Save email intelligence config
 */
export async function saveEmailConfig(userId, config) {
    const db = getFirestoreDb();
    if (!db) {
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        await getDocRef(db, userId).set(cleanForFirestore({ config, lastUpdated: new Date().toISOString() }), { merge: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
/**
 * Delete email intelligence data
 */
export async function deleteEmailIntelligenceData(userId) {
    const db = getFirestoreDb();
    if (!db) {
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        await getDocRef(db, userId).delete();
        log.info({ userId }, 'Email intelligence data deleted');
        return { success: true };
    }
    catch (error) {
        return { success: false, error: String(error) };
    }
}
//# sourceMappingURL=email-intelligence-store.js.map