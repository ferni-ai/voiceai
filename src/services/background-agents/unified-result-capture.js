/**
 * Unified Background Result Capture
 *
 * Central system for capturing, storing, and notifying about all background
 * agent task results. This is the "BETTER THAN HUMAN" engine - we never
 * forget to follow up on what we did while you were away.
 *
 * Features:
 * - Stores results in Firestore for persistence
 * - Sends real-time notifications via LiveKit (if connected)
 * - Sends push/email notifications (if disconnected)
 * - Provides context injection for "while you were away" greetings
 * - Marks results as delivered to avoid repetition
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createBackgroundResult, sortResultsForDisplay } from './result-types.js';
const log = createLogger({ module: 'UnifiedResultCapture' });
// ============================================================================
// IN-MEMORY STORE (fallback when Firestore unavailable)
// ============================================================================
const resultStore = new Map();
// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================
/**
 * Store a background result in Firestore
 */
async function storeResult(result) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
            getFirestoreDb: null,
        }));
        const db = getFirestoreDb ? getFirestoreDb() : null;
        if (db) {
            // Clean undefined values for Firestore
            const cleanResult = JSON.parse(JSON.stringify(result));
            await db
                .collection('bogle_users')
                .doc(result.userId)
                .collection('background_results')
                .doc(result.id)
                .set(cleanResult);
            log.info({ userId: result.userId, resultId: result.id, type: result.type }, 'Result stored in Firestore');
        }
        else {
            // Fallback to in-memory
            const existing = resultStore.get(result.userId) || [];
            resultStore.set(result.userId, [...existing, result]);
            log.debug({ resultId: result.id }, 'Result stored in memory (Firestore unavailable)');
        }
    }
    catch (error) {
        // Store in memory as fallback
        const existing = resultStore.get(result.userId) || [];
        resultStore.set(result.userId, [...existing, result]);
        log.warn({ error: String(error), resultId: result.id }, 'Firestore unavailable, stored in memory');
    }
}
/**
 * Get pending (undelivered) results for a user
 */
export async function getPendingResults(userId, options = {}) {
    const { maxAge = 24, limit = 10, types } = options;
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
            getFirestoreDb: null,
        }));
        const db = getFirestoreDb ? getFirestoreDb() : null;
        if (!db) {
            log.debug({ userId }, 'Firestore not available for pending results');
            return getMemoryResults(userId, maxAge, limit, types);
        }
        // Calculate cutoff time
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - maxAge);
        // Query Firestore
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('background_results')
            .where('capturedAt', '>=', cutoff.toISOString())
            .orderBy('capturedAt', 'desc')
            .limit(limit * 2) // Get more, then filter
            .get();
        const results = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Filter out delivered results
            if (data.delivered === true)
                return;
            // Filter by type if specified
            if (types && types.length > 0 && !types.includes(data.type))
                return;
            results.push(data);
        });
        // Sort and limit
        const sorted = sortResultsForDisplay(results);
        return sorted.slice(0, limit);
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to fetch pending results from Firestore');
        return getMemoryResults(userId, maxAge, limit, types);
    }
}
/**
 * Get results from in-memory store
 */
function getMemoryResults(userId, maxAge, limit, types) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAge);
    const all = resultStore.get(userId) || [];
    const filtered = all.filter((r) => {
        if (r.delivered)
            return false;
        if (new Date(r.capturedAt) < cutoff)
            return false;
        if (types && types.length > 0 && !types.includes(r.type))
            return false;
        return true;
    });
    return sortResultsForDisplay(filtered).slice(0, limit);
}
/**
 * Mark results as delivered
 */
export async function markResultsDelivered(userId, resultIds, deliveryMethod = 'voice') {
    if (resultIds.length === 0)
        return;
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
            getFirestoreDb: null,
        }));
        const db = getFirestoreDb ? getFirestoreDb() : null;
        const deliveredAt = new Date().toISOString();
        if (db) {
            const batch = db.batch();
            for (const resultId of resultIds) {
                const ref = db
                    .collection('bogle_users')
                    .doc(userId)
                    .collection('background_results')
                    .doc(resultId);
                batch.update(ref, {
                    delivered: true,
                    deliveredAt,
                    deliveryMethod,
                });
            }
            await batch.commit();
        }
        // Also update in-memory store
        const memResults = resultStore.get(userId);
        if (memResults) {
            for (const result of memResults) {
                if (resultIds.includes(result.id)) {
                    result.delivered = true;
                    result.deliveredAt = deliveredAt;
                    result.deliveryMethod = deliveryMethod;
                }
            }
        }
        log.debug({ userId, count: resultIds.length, method: deliveryMethod }, 'Marked results as delivered');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to mark results as delivered');
    }
}
// ============================================================================
// NOTIFICATION CHANNELS
// ============================================================================
/**
 * Send result to active LiveKit session
 */
async function sendToActiveSession(sessionId, result) {
    try {
        const livekitSdk = await import('livekit-server-sdk').catch(() => null);
        if (!livekitSdk?.RoomServiceClient) {
            return false;
        }
        const { RoomServiceClient, DataPacket_Kind } = livekitSdk;
        const livekitUrl = process.env.LIVEKIT_URL;
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        if (!livekitUrl || !apiKey || !apiSecret) {
            return false;
        }
        const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
        // Check if room exists
        const rooms = await roomService.listRooms([sessionId]);
        if (rooms.length === 0) {
            return false;
        }
        // Build data message
        const dataMessage = {
            type: 'background_result_complete',
            resultId: result.id,
            resultType: result.type,
            summary: result.summary,
            status: result.status,
            priority: result.priority,
            contactName: result.contactName,
            requiresCallback: result.requiresCallback,
            actionItems: result.actionItems,
            timestamp: Date.now(),
        };
        const dataBytes = new TextEncoder().encode(JSON.stringify(dataMessage));
        await roomService.sendData(sessionId, dataBytes, DataPacket_Kind.RELIABLE, {});
        log.info({ sessionId, resultId: result.id }, 'Sent result to active session');
        return true;
    }
    catch (error) {
        log.debug({ error: String(error), sessionId }, 'Could not send to active session');
        return false;
    }
}
/**
 * Send push notification for result
 */
async function sendPushNotification(result) {
    try {
        const { sendPushNotification: sendPush, isPushNotificationsAvailable } = await import('../outreach/delivery/push-notifications.js');
        if (!isPushNotificationsAvailable()) {
            return;
        }
        const title = buildPushTitle(result);
        const body = result.summary;
        await sendPush({
            userId: result.userId,
            outreachId: result.id,
            personaId: result.initiatedBy,
            title,
            body,
            data: {
                type: 'background_result',
                resultId: result.id,
                resultType: result.type,
                status: result.status,
            },
            priority: result.priority === 'urgent' ? 'high' : 'normal',
            clickAction: '/activity', // Navigate to activity history
        });
        log.info({ userId: result.userId, resultId: result.id }, 'Push notification sent');
    }
    catch (error) {
        log.warn({ error: String(error), resultId: result.id }, 'Failed to send push notification');
    }
}
/**
 * Send email notification for result
 */
async function sendEmailNotification(result) {
    try {
        const { sendEmail, isEmailDeliveryAvailable } = await import('../outreach/delivery/email-delivery.js');
        if (!isEmailDeliveryAvailable()) {
            return;
        }
        // Get user's email
        const email = await getUserEmail(result.userId);
        if (!email) {
            return;
        }
        const subject = buildEmailSubject(result);
        const body = buildEmailBody(result);
        await sendEmail({
            to: email,
            subject,
            body,
            personaId: result.initiatedBy,
            userId: result.userId,
            outreachId: result.id,
            tags: ['background-result', result.type],
        });
        log.info({ userId: result.userId, resultId: result.id }, 'Email notification sent');
    }
    catch (error) {
        log.warn({ error: String(error), resultId: result.id }, 'Failed to send email notification');
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function buildPushTitle(result) {
    const contact = result.contactName ? ` with ${result.contactName}` : '';
    switch (result.type) {
        case 'on_behalf_call':
            return result.status === 'success'
                ? `✓ Call${contact} complete`
                : `📞 Call update${contact}`;
        case 'research_complete':
            return `🔍 Research complete`;
        case 'reservation_made':
            return result.status === 'success'
                ? `✓ Reservation confirmed`
                : `📅 Reservation update`;
        case 'follow_up_sent':
            return `📧 Follow-up sent${contact}`;
        case 'reminder_triggered':
            return `⏰ Reminder`;
        case 'commitment_check':
            return `📋 Check-in`;
        default:
            return `📋 Task update`;
    }
}
function buildEmailSubject(result) {
    const contact = result.contactName ? ` - ${result.contactName}` : '';
    switch (result.type) {
        case 'on_behalf_call':
            return result.status === 'success'
                ? `Call complete${contact}`
                : `Call update${contact}`;
        case 'research_complete':
            return `Research results ready`;
        case 'reservation_made':
            return `Reservation ${result.status === 'success' ? 'confirmed' : 'update'}`;
        case 'follow_up_sent':
            return `Follow-up sent${contact}`;
        default:
            return `Task update from Ferni`;
    }
}
function buildEmailBody(result) {
    const lines = [];
    lines.push(`Hey! Just wanted to let you know about something I did for you.\n`);
    lines.push(`**${result.summary}**\n`);
    if (result.details) {
        lines.push(`${result.details}\n`);
    }
    if (result.actionItems && result.actionItems.length > 0) {
        lines.push(`**Action items:**`);
        for (const item of result.actionItems) {
            lines.push(`• ${item}`);
        }
        lines.push('');
    }
    if (result.requiresCallback && result.callbackTime) {
        lines.push(`**Heads up:** They'd like you to call back around ${result.callbackTime}\n`);
    }
    lines.push(`*Completed: ${new Date(result.capturedAt).toLocaleString()}*`);
    return lines.join('\n');
}
async function getUserEmail(userId) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
            getFirestoreDb: null,
        }));
        const db = getFirestoreDb ? getFirestoreDb() : null;
        if (!db)
            return null;
        const doc = await db.collection('bogle_users').doc(userId).get();
        const data = doc.data();
        return data?.email || data?.profile?.email || null;
    }
    catch {
        return null;
    }
}
// ============================================================================
// MAIN CAPTURE FUNCTION
// ============================================================================
/**
 * Capture a background result
 *
 * This is the main entry point for recording any background task completion.
 * It handles:
 * 1. Storing the result for history
 * 2. Sending to active session (if connected)
 * 3. Sending push/email notifications (if disconnected)
 * 4. Ensuring the user will be told about it on reconnect
 */
export async function captureBackgroundResult(params) {
    const result = createBackgroundResult({
        userId: params.userId,
        type: params.type,
        status: params.status,
        summary: params.summary,
        priority: params.priority || 'normal',
        initiatedBy: params.initiatedBy,
        contactName: params.contactName,
        contactId: params.contactId,
        details: params.details,
        actionItems: params.actionItems || [],
        requiresCallback: params.requiresCallback || false,
        callbackTime: params.callbackTime,
        relatedTaskId: params.relatedTaskId,
    });
    log.info({
        resultId: result.id,
        type: result.type,
        status: result.status,
        userId: result.userId,
    }, 'Capturing background result');
    try {
        // 1. Store the result
        await storeResult(result);
        // 2. Try to send to active session
        let sentToActive = false;
        if (params.sessionId) {
            sentToActive = await sendToActiveSession(params.sessionId, result);
        }
        // 3. Send push notification (always - works even if connected)
        await sendPushNotification(result);
        // 4. Send email for high priority results
        if (result.priority === 'urgent' || result.priority === 'high') {
            await sendEmailNotification(result);
        }
        // 5. If sent to active session, mark as delivered
        if (sentToActive) {
            await markResultsDelivered(result.userId, [result.id], 'voice');
        }
        log.info({ resultId: result.id, sentToActive }, 'Background result captured successfully');
        return result;
    }
    catch (error) {
        log.error({ error: String(error), resultId: result.id }, 'Failed to capture background result');
        throw error;
    }
}
// ============================================================================
// CONTEXT BUILDER FOR "WHILE YOU WERE AWAY"
// ============================================================================
/**
 * Build context injection for pending background results.
 *
 * Returns a string to inject into the agent's system prompt that tells them
 * what background tasks completed while the user was away.
 */
export async function buildPendingResultsContext(userId) {
    const results = await getPendingResults(userId, {
        maxAge: 48, // 48 hours
        limit: 8,
    });
    if (results.length === 0) {
        return null;
    }
    const lines = [
        '',
        '## 📋 WHILE THEY WERE AWAY (Tell the user!)',
        '',
        "Background tasks completed while they were away. Share these updates naturally - like a friend reporting back on errands they ran for you.",
        '',
    ];
    for (const result of results) {
        const icon = getResultIcon(result.type);
        const priority = result.priority === 'urgent' ? ' ⚠️ URGENT' :
            result.priority === 'high' ? ' ⭐ Important' : '';
        lines.push(`### ${icon} ${result.type.replace(/_/g, ' ')}${priority}`);
        lines.push(`**${result.summary}**`);
        if (result.details) {
            lines.push(result.details);
        }
        if (result.requiresCallback) {
            lines.push(`⚠️ They want a callback${result.callbackTime ? ` around ${result.callbackTime}` : ''}`);
        }
        if (result.actionItems && result.actionItems.length > 0) {
            lines.push(`📝 Action items: ${result.actionItems.join(', ')}`);
        }
        lines.push('');
    }
    lines.push('**How to share:**');
    lines.push('- Weave naturally into your greeting');
    lines.push("- Start with the most important/urgent items");
    lines.push("- Be conversational: \"Oh! While you were away, I...\"");
    lines.push('');
    // Mark as delivered (fire and forget)
    const resultIds = results.map((r) => r.id);
    void markResultsDelivered(userId, resultIds, 'voice');
    return lines.join('\n');
}
function getResultIcon(type) {
    const icons = {
        on_behalf_call: '📞',
        research_complete: '🔍',
        reservation_made: '📅',
        follow_up_sent: '📧',
        reminder_triggered: '⏰',
        commitment_check: '📋',
        calendar_update: '🗓️',
        contact_updated: '👤',
        email_sent: '✉️',
        task_completed: '✓',
    };
    return icons[type] || '📋';
}
// ============================================================================
// HISTORY RETRIEVAL
// ============================================================================
/**
 * Get result history for a user (including delivered results)
 */
export async function getResultHistory(userId, limit = 20, type) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
            getFirestoreDb: null,
        }));
        const db = getFirestoreDb ? getFirestoreDb() : null;
        if (!db) {
            // Fallback to in-memory
            const all = resultStore.get(userId) || [];
            let filtered = all;
            if (type) {
                filtered = all.filter((r) => r.type === type);
            }
            return sortResultsForDisplay(filtered).slice(0, limit);
        }
        // Build query
        let query = db
            .collection('bogle_users')
            .doc(userId)
            .collection('background_results')
            .orderBy('capturedAt', 'desc');
        if (type) {
            query = query.where('type', '==', type);
        }
        const snapshot = await query.limit(limit).get();
        const results = [];
        snapshot.forEach((doc) => {
            results.push(doc.data());
        });
        return results;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to fetch result history');
        // Fallback to in-memory
        const all = resultStore.get(userId) || [];
        return sortResultsForDisplay(all).slice(0, limit);
    }
}
//# sourceMappingURL=unified-result-capture.js.map