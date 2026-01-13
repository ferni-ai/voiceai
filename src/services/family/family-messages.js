/**
 * Family Messages Service
 *
 * Enables family phone callers to leave voice messages for their sponsor
 * that Ferni will deliver during the sponsor's next conversation.
 *
 * Example flow:
 * 1. Mom calls Ferni: "Tell Seth I'm thinking of him"
 * 2. Ferni confirms and stores the message
 * 3. Next time Seth talks to Ferni: "Your mom left a message for you..."
 * 4. Message marked as delivered
 *
 * @module services/family/family-messages
 */
import admin from 'firebase-admin';
import { getFirestore } from '../../memory/firestore-factory.js';
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger().child({ module: 'FamilyMessages' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION_NAME = 'family_messages';
const MESSAGE_EXPIRY_DAYS = 7; // Messages expire after 7 days if not delivered
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
// Cache pending messages by recipient user ID for quick lookup
const pendingMessagesCache = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute cache
const cacheTimestamps = new Map();
function isCacheValid(userId) {
    const timestamp = cacheTimestamps.get(userId);
    return !!timestamp && Date.now() - timestamp < CACHE_TTL_MS;
}
function invalidateCache(userId) {
    pendingMessagesCache.delete(userId);
    cacheTimestamps.delete(userId);
}
// ============================================================================
// CRUD OPERATIONS
// ============================================================================
/**
 * Create a new family message.
 */
export async function createFamilyMessage(data) {
    const db = getFirestore();
    if (!db) {
        throw new Error('Firestore not available');
    }
    const id = `fmsg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const message = {
        id,
        fromIdentityId: data.fromIdentityId,
        fromName: data.fromName,
        fromRelationship: data.fromRelationship,
        toUserId: data.toUserId,
        messageType: data.messageType,
        content: data.content,
        audioUrl: data.audioUrl,
        createdAt: new Date(),
        status: 'pending',
        sourceSessionId: data.sourceSessionId,
        emotionalContext: data.emotionalContext,
    };
    await db.collection(COLLECTION_NAME).doc(id).set({
        ...message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Invalidate cache for recipient
    invalidateCache(data.toUserId);
    log.info({
        id,
        fromName: data.fromName,
        toUserId: data.toUserId,
        messageType: data.messageType,
        contentLength: data.content.length,
    }, '✉️ Created family message');
    return message;
}
/**
 * Get a family message by ID.
 */
export async function getFamilyMessage(id) {
    const db = getFirestore();
    if (!db)
        return null;
    try {
        const doc = await db.collection(COLLECTION_NAME).doc(id).get();
        if (!doc.exists)
            return null;
        return docToMessage(doc);
    }
    catch (error) {
        log.error({ error, id }, 'Failed to get family message');
        return null;
    }
}
/**
 * Get pending messages for a user (sponsor).
 * These are messages that haven't been delivered yet.
 */
export async function getPendingMessages(userId) {
    // Check cache first
    if (isCacheValid(userId)) {
        return pendingMessagesCache.get(userId) || [];
    }
    const db = getFirestore();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection(COLLECTION_NAME)
            .where('toUserId', '==', userId)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        const messages = snapshot.docs.map(docToMessage);
        // Filter out expired messages
        const now = new Date();
        const validMessages = messages.filter((m) => {
            const expiryDate = new Date(m.createdAt);
            expiryDate.setDate(expiryDate.getDate() + MESSAGE_EXPIRY_DAYS);
            return now < expiryDate;
        });
        // Update cache
        pendingMessagesCache.set(userId, validMessages);
        cacheTimestamps.set(userId, Date.now());
        return validMessages;
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to get pending messages');
        return [];
    }
}
/**
 * Get all messages for a user (delivered and pending).
 */
export async function getAllMessages(userId, limit = 50) {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection(COLLECTION_NAME)
            .where('toUserId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(docToMessage);
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to get all messages');
        return [];
    }
}
/**
 * Get messages sent by a specific family member.
 */
export async function getMessagesByIdentity(identityId, limit = 50) {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection(COLLECTION_NAME)
            .where('fromIdentityId', '==', identityId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(docToMessage);
    }
    catch (error) {
        log.error({ error, identityId }, 'Failed to get messages by identity');
        return [];
    }
}
/**
 * Mark a message as delivered.
 */
export async function markMessageDelivered(id) {
    const db = getFirestore();
    if (!db)
        return;
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            log.warn({ id }, 'Message not found for delivery');
            return;
        }
        const message = docToMessage(doc);
        await docRef.update({
            status: 'delivered',
            deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Invalidate cache
        invalidateCache(message.toUserId);
        log.info({ id, toUserId: message.toUserId }, '✅ Message marked as delivered');
    }
    catch (error) {
        log.error({ error, id }, 'Failed to mark message as delivered');
    }
}
/**
 * Mark multiple messages as delivered.
 */
export async function markMessagesDelivered(ids) {
    for (const id of ids) {
        await markMessageDelivered(id);
    }
}
/**
 * Delete a message.
 */
export async function deleteFamilyMessage(id) {
    const db = getFirestore();
    if (!db)
        return;
    try {
        const doc = await db.collection(COLLECTION_NAME).doc(id).get();
        if (doc.exists) {
            const message = docToMessage(doc);
            await db.collection(COLLECTION_NAME).doc(id).update({
                status: 'deleted',
            });
            invalidateCache(message.toUserId);
        }
    }
    catch (error) {
        log.error({ error, id }, 'Failed to delete message');
    }
}
/**
 * Clean up expired messages.
 */
export async function cleanupExpiredMessages() {
    const db = getFirestore();
    if (!db)
        return 0;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - MESSAGE_EXPIRY_DAYS);
    try {
        const snapshot = await db
            .collection(COLLECTION_NAME)
            .where('status', '==', 'pending')
            .where('createdAt', '<', expiryDate)
            .get();
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.update(doc.ref, { status: 'expired' });
        });
        await batch.commit();
        log.info({ count: snapshot.size }, '🧹 Cleaned up expired messages');
        return snapshot.size;
    }
    catch (error) {
        log.error({ error }, 'Failed to cleanup expired messages');
        return 0;
    }
}
// ============================================================================
// MESSAGE FORMATTING
// ============================================================================
/**
 * Format a message for delivery to the sponsor.
 * Returns a human-friendly string for Ferni to speak.
 */
export function formatMessageForDelivery(message) {
    const timeAgo = getTimeAgo(message.createdAt);
    const relationshipLabel = formatRelationship(message.fromRelationship);
    if (message.emotionalContext) {
        return `Your ${relationshipLabel} ${message.fromName} left you a message ${timeAgo}. ${message.emotionalContext} They said: "${message.content}"`;
    }
    return `Your ${relationshipLabel} ${message.fromName} left you a message ${timeAgo}: "${message.content}"`;
}
/**
 * Format multiple messages for delivery.
 */
export function formatMessagesForDelivery(messages) {
    if (messages.length === 0)
        return '';
    if (messages.length === 1)
        return formatMessageForDelivery(messages[0]);
    const intro = messages.length === 2
        ? "You have a couple of messages from family. Here's what they said:"
        : `You have ${messages.length} messages from family. Here's what they said:`;
    const formatted = messages.map((m) => {
        const relationshipLabel = formatRelationship(m.fromRelationship);
        return `From your ${relationshipLabel} ${m.fromName}: "${m.content}"`;
    });
    return `${intro}\n\n${formatted.join('\n\n')}`;
}
// ============================================================================
// HELPERS
// ============================================================================
function docToMessage(doc) {
    const data = doc.data();
    return {
        id: doc.id,
        fromIdentityId: data.fromIdentityId,
        fromName: data.fromName,
        fromRelationship: data.fromRelationship,
        toUserId: data.toUserId,
        messageType: data.messageType,
        content: data.content,
        audioUrl: data.audioUrl,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        deliveredAt: data.deliveredAt?.toDate?.() || undefined,
        status: data.status,
        sourceSessionId: data.sourceSessionId,
        emotionalContext: data.emotionalContext,
    };
}
function formatRelationship(relationship) {
    const map = {
        mother: 'mom',
        father: 'dad',
        grandmother: 'grandma',
        grandfather: 'grandpa',
        grandparent: 'grandparent',
        parent: 'parent',
        sibling: 'sibling',
        child: 'child',
        spouse: 'spouse',
        partner: 'partner',
        friend: 'friend',
        other: '',
    };
    return map[relationship] || relationship;
}
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 5)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins} minutes ago`;
    if (diffHours < 2)
        return 'about an hour ago';
    if (diffHours < 24)
        return `${diffHours} hours ago`;
    if (diffDays === 1)
        return 'yesterday';
    if (diffDays < 7)
        return `${diffDays} days ago`;
    return 'last week';
}
// ============================================================================
// EXPORTS
// ============================================================================
export { COLLECTION_NAME as FAMILY_MESSAGES_COLLECTION, MESSAGE_EXPIRY_DAYS, };
//# sourceMappingURL=family-messages.js.map