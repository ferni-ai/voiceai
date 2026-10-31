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

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  BackgroundResult,
  BackgroundResultType,
  ResultPriority,
  OutcomeStatus,
} from './result-types.js';
import { createBackgroundResult, sortResultsForDisplay } from './result-types.js';
import { CALLER_TEXT_GUARD, reportedFromCall } from '../outreach/caller-text.js';

const log = createLogger({ module: 'UnifiedResultCapture' });

// ============================================================================
// IN-MEMORY STORE (fallback when Firestore unavailable)
// ============================================================================

const resultStore = new Map<string, BackgroundResult[]>();

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

/** Store a background result in Firestore */
async function storeResult(result: BackgroundResult): Promise<void> {
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

      log.info(
        { userId: result.userId, resultId: result.id, type: result.type },
        'Result stored in Firestore'
      );
    } else {
      // Fallback to in-memory
      const existing = resultStore.get(result.userId) || [];
      resultStore.set(result.userId, [...existing, result]);
      log.debug({ resultId: result.id }, 'Result stored in memory (Firestore unavailable)');
    }
  } catch (error) {
    // Store in memory as fallback
    const existing = resultStore.get(result.userId) || [];
    resultStore.set(result.userId, [...existing, result]);
    log.warn(
      { error: String(error), resultId: result.id },
      'Firestore unavailable, stored in memory'
    );
  }
}

/** Get pending (undelivered) results for a user */
export async function getPendingResults(
  userId: string,
  options: {
    maxAge?: number; // Max age in hours (default 24)
    limit?: number; // Max results to return
    types?: BackgroundResultType[]; // Filter by type
  } = {}
): Promise<BackgroundResult[]> {
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

    const results: BackgroundResult[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as BackgroundResult;

      // Filter out delivered results
      if (data.delivered === true) return;

      // Filter by type if specified
      if (types && types.length > 0 && !types.includes(data.type)) return;

      results.push(data);
    });

    // Sort and limit
    const sorted = sortResultsForDisplay(results);
    return sorted.slice(0, limit);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch pending results from Firestore');
    return getMemoryResults(userId, maxAge, limit, types);
  }
}

/**
 * Get results from in-memory store
 */
function getMemoryResults(
  userId: string,
  maxAge: number,
  limit: number,
  types?: BackgroundResultType[]
): BackgroundResult[] {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - maxAge);

  const all = resultStore.get(userId) || [];
  const filtered = all.filter((r) => {
    if (r.delivered) return false;
    if (new Date(r.capturedAt) < cutoff) return false;
    if (types && types.length > 0 && !types.includes(r.type)) return false;
    return true;
  });

  return sortResultsForDisplay(filtered).slice(0, limit);
}

/** Mark results delivered; a 'ui' notice (a web-UI packet) is only noted, so voice still tells. */
export async function markResultsDelivered(
  userId: string,
  resultIds: string[],
  deliveryMethod: 'voice' | 'push' | 'email' | 'sms' | 'ui' = 'voice'
): Promise<void> {
  if (resultIds.length === 0) return;

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

        const marked = { delivered: true, deliveredAt, deliveryMethod };
        batch.update(ref, deliveryMethod === 'ui' ? { uiNoticeAt: deliveredAt } : marked);
      }

      await batch.commit();
    }

    // Also update in-memory store
    const memResults = resultStore.get(userId);
    if (memResults && deliveryMethod !== 'ui') {
      for (const result of memResults) {
        if (resultIds.includes(result.id)) {
          result.delivered = true;
          result.deliveredAt = deliveredAt;
          result.deliveryMethod = deliveryMethod;
        }
      }
    }

    log.debug(
      { userId, count: resultIds.length, method: deliveryMethod },
      'Marked results as delivered'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to mark results as delivered');
  }
}

// ============================================================================
// NOTIFICATION CHANNELS
// ============================================================================

/**
 * Send result to active LiveKit session
 */
async function sendToActiveSession(sessionId: string, result: BackgroundResult): Promise<boolean> {
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
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Could not send to active session');
    return false;
  }
}

/**
 * Send push notification for result
 */
async function sendPushNotification(result: BackgroundResult): Promise<void> {
  try {
    const { sendPushNotification: sendPush, isPushNotificationsAvailable } =
      await import('../outreach/delivery/push-notifications.js');

    if (!isPushNotificationsAvailable()) return;
    const title = buildPushTitle(result);
    const body = result.summary;

    const results = await sendPush({
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
    // No device token comes back as { success: false }, never a throw: only a delivery is "sent".
    const error = results.some((r) => r.success) ? undefined : (results[0]?.error ?? 'not sent');
    const fields = { userId: result.userId, resultId: result.id, error };
    if (error) log.warn(fields, 'Push notification NOT sent');
    else log.info(fields, 'Push notification sent');
  } catch (error) {
    log.warn({ error: String(error), resultId: result.id }, 'Failed to send push notification');
  }
}

/** Send the email notification; what it returns is what the transport answered (#2947). */
async function sendEmailNotification(
  result: BackgroundResult
): Promise<'sent' | 'failed' | 'skipped'> {
  const fields = { userId: result.userId, resultId: result.id };
  try {
    const { sendEmail, isEmailDeliveryAvailable } =
      await import('../outreach/delivery/email-delivery.js');
    const email = isEmailDeliveryAvailable() ? await getUserEmail(result.userId) : null;
    if (!email) return 'skipped';

    const sent = await sendEmail({
      to: email,
      subject: buildEmailSubject(result),
      body: buildEmailBody(result),
      personaId: result.initiatedBy,
      userId: result.userId,
      outreachId: result.id,
      tags: ['background-result', result.type],
    });
    // A failure logs a code only: never the address or the body.
    if (!sent.success)
      log.warn({ ...fields, code: sent.status ?? 'send_failed' }, 'Email notification NOT sent');
    else log.info(fields, 'Email notification sent');
    return sent.success ? 'sent' : 'failed';
  } catch (error) {
    log.warn({ ...fields, code: (error as Error)?.name ?? 'error' }, 'Failed to send email notification'); // prettier-ignore
    return 'failed';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildPushTitle(result: BackgroundResult): string {
  const contact = result.contactName ? ` with ${result.contactName}` : '';

  switch (result.type) {
    case 'on_behalf_call':
      return result.status === 'success' ? `✓ Call${contact} complete` : `📞 Call update${contact}`;
    case 'research_complete':
      return `🔍 Research complete`;
    case 'reservation_made':
      return result.status === 'success' ? `✓ Reservation confirmed` : `📅 Reservation update`;
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

function buildEmailSubject(result: BackgroundResult): string {
  const contact = result.contactName ? ` - ${result.contactName}` : '';

  switch (result.type) {
    case 'on_behalf_call':
      return result.status === 'success' ? `Call complete${contact}` : `Call update${contact}`;
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

function buildEmailBody(result: BackgroundResult): string {
  const lines: string[] = [];

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

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return null;

    const doc = await db.collection('bogle_users').doc(userId).get();
    const data = doc.data();
    return data?.email || data?.profile?.email || null;
  } catch {
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
export async function captureBackgroundResult(params: {
  userId: string;
  type: BackgroundResultType;
  status: OutcomeStatus;
  summary: string;
  priority?: ResultPriority;
  initiatedBy: string;
  sessionId?: string; // Original session ID for LiveKit injection
  contactName?: string;
  contactId?: string;
  details?: string;
  actionItems?: string[];
  requiresCallback?: boolean;
  callbackTime?: string;
  relatedTaskId?: string;
  specificData?: Record<string, unknown>;
  skipPush?: boolean; // the caller tells the user its own way (one text)
  skipEmail?: boolean; // the caller sends its own; else urgent and high results are emailed
}): Promise<BackgroundResult> {
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

  log.info(
    {
      resultId: result.id,
      type: result.type,
      status: result.status,
      userId: result.userId,
    },
    'Capturing background result'
  );

  try {
    // 1. Store the result
    await storeResult(result);

    // 2. Try to send to active session
    let sentToActive = false;
    if (params.sessionId) {
      sentToActive = await sendToActiveSession(params.sessionId, result);
    }

    // 3. Push (works even if connected), unless the caller tells them itself
    if (!params.skipPush) await sendPushNotification(result);

    const urgent = !params.skipEmail && ['urgent', 'high'].includes(result.priority); // 4. email
    const email = urgent ? await sendEmailNotification(result) : 'skipped';

    // A web-UI packet isn't speech: CALL_REPORT_REACHES_YOU=on notes it 'ui', voice still tells.
    const shown = flagOn('CALL_REPORT_REACHES_YOU') ? 'ui' : 'voice';
    if (sentToActive) await markResultsDelivered(result.userId, [result.id], shown);

    log.info({ resultId: result.id, sentToActive, email }, 'Background result captured');

    return result;
  } catch (error) {
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
export async function buildPendingResultsContext(userId: string): Promise<string | null> {
  const results = await getPendingResults(userId, {
    maxAge: 48, // 48 hours
    limit: 8,
  });

  if (results.length === 0) {
    return null;
  }

  const lines: string[] = [
    '',
    '## 📋 WHILE THEY WERE AWAY (Tell the user!)',
    '',
    'Background tasks completed while they were away. Share these updates naturally - like a friend reporting back on errands they ran for you.',
    '',
  ];
  if (results.some((r) => r.type === 'on_behalf_call')) lines.push(CALLER_TEXT_GUARD, '');

  for (const result of results) {
    const icon = getResultIcon(result.type);
    const priority =
      result.priority === 'urgent'
        ? ' ⚠️ URGENT'
        : result.priority === 'high'
          ? ' ⭐ Important'
          : '';

    lines.push(`### ${icon} ${result.type.replace(/_/g, ' ')}${priority}`);
    const body = [`**${result.summary}**`];
    if (result.details) body.push(result.details);
    if (result.requiresCallback) {
      body.push(
        `⚠️ They want a callback${result.callbackTime ? ` around ${result.callbackTime}` : ''}`
      );
    }
    if (result.actionItems && result.actionItems.length > 0) {
      body.push(`📝 Action items: ${result.actionItems.join(', ')}`);
    }
    // A call's result is the other person's words: framed as reported speech, never as directions.
    lines.push(
      ...(result.type === 'on_behalf_call' ? reportedFromCall(result.contactName, body) : body),
      ''
    );
  }

  lines.push('**How to share:**');
  lines.push('- Weave naturally into your greeting');
  lines.push('- Start with the most important/urgent items');
  lines.push('- Be conversational: "Oh! While you were away, I..."');
  lines.push('');

  // Delivered as built only with CALL_REPORT_REACHES_YOU off; on, once a reply carries it.
  const resultIds = results.map((r) => r.id);
  if (!flagOn('CALL_REPORT_REACHES_YOU')) void markResultsDelivered(userId, resultIds, 'voice');

  return lines.join('\n');
}

function getResultIcon(type: BackgroundResultType): string {
  const icons: Record<BackgroundResultType, string> = {
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
export async function getResultHistory(
  userId: string,
  limit = 20,
  type?: string
): Promise<BackgroundResult[]> {
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

    const results: BackgroundResult[] = [];
    snapshot.forEach((doc) => {
      results.push(doc.data() as BackgroundResult);
    });

    return results;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch result history');
    // Fallback to in-memory
    const all = resultStore.get(userId) || [];
    return sortResultsForDisplay(all).slice(0, limit);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { BackgroundResult, BackgroundResultType, ResultPriority, OutcomeStatus };
