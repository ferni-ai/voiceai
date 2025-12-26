/**
 * Call Result Capture Service
 *
 * Handles capturing and storing the outcomes of on-behalf calls:
 * - Stores results in Firestore for history
 * - Notifies the original session of the outcome
 * - Creates follow-up actions if needed
 *
 * @module services/outreach/call-result-capture
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/call-on-behalf.js';

const log = getLogger().child({ service: 'call-result-capture' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoredCallResult {
  callId: string;
  userId: string;
  outcome: CallOutcome;
  request: {
    contactQuery: string;
    contactName?: string;
    contactPhone?: string;
    purpose: string;
    objective: string;
    callType: string;
  };
  capturedAt: string;
}

export interface FollowUpAction {
  id: string;
  callId: string;
  userId: string;
  type: 'callback' | 'reminder' | 'notification';
  description: string;
  scheduledFor?: string;
  createdAt: string;
}

// ============================================================================
// STORAGE
// ============================================================================

// In-memory store for development/testing
const callResultStore = new Map<string, StoredCallResult>();
const followUpActionsStore = new Map<string, FollowUpAction[]>();

/**
 * Store a call result in Firestore (with in-memory fallback)
 */
async function storeCallResult(result: StoredCallResult): Promise<void> {
  try {
    // Try Firestore first
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (db) {
      await db
        .collection('bogle_users')
        .doc(result.userId)
        .collection('on_behalf_calls')
        .doc(result.callId)
        .set(result);

      log.debug({ callId: result.callId }, 'Call result stored in Firestore');
    } else {
      // Fallback to in-memory
      callResultStore.set(result.callId, result);
      log.debug({ callId: result.callId }, 'Call result stored in memory');
    }
  } catch (error) {
    // Store in memory as fallback
    callResultStore.set(result.callId, result);
    log.warn({ error: String(error), callId: result.callId }, 'Firestore unavailable, stored in memory');
  }
}

/**
 * Get a stored call result
 */
export async function getCallResult(
  callId: string,
  userId: string
): Promise<StoredCallResult | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (db) {
      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('on_behalf_calls')
        .doc(callId)
        .get();

      if (doc.exists) {
        return doc.data() as StoredCallResult;
      }
    }

    // Try in-memory store
    return callResultStore.get(callId) || null;
  } catch (error) {
    log.debug({ error: String(error), callId }, 'Failed to get call result from Firestore');
    return callResultStore.get(callId) || null;
  }
}

// ============================================================================
// SESSION NOTIFICATION
// ============================================================================

/**
 * Notify the original session of the call result
 *
 * Currently stores the notification for the user to see when they next connect.
 * Real-time notification via WebSocket can be added later when the data message
 * infrastructure is in place.
 */
async function notifyOriginalSession(
  originalSessionId: string,
  callId: string,
  outcome: CallOutcome
): Promise<void> {
  try {
    log.info(
      { originalSessionId, callId, status: outcome.status },
      'Storing call result notification for session'
    );

    // Store a notification for the user to see when they next connect
    await storeNotification(originalSessionId, callId, outcome);
  } catch (error) {
    log.error({ error: String(error), originalSessionId }, 'Failed to notify original session');
  }
}

/**
 * Store a notification for later delivery
 */
async function storeNotification(
  sessionId: string,
  callId: string,
  outcome: CallOutcome
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    const notification = {
      type: 'on_behalf_call_complete',
      callId,
      outcome: outcome.outcome,
      status: outcome.status,
      objectiveAchieved: outcome.objectiveAchieved,
      callbackRequired: outcome.callbackRequired,
      createdAt: new Date().toISOString(),
      read: false,
    };

    if (db) {
      // Store in user's pending notifications
      await db
        .collection('pending_notifications')
        .doc(sessionId)
        .collection('items')
        .add(notification);
    }

    log.debug({ sessionId, callId }, 'Notification stored for later delivery');
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Could not store notification');
  }
}

// ============================================================================
// ACTIVE SESSION INJECTION
// ============================================================================

/**
 * Inject call result into active LiveKit session
 *
 * If the user is still connected to their session, this sends the result
 * directly to them via LiveKit data channel, providing instant feedback.
 */
async function injectToActiveSession(
  sessionId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): Promise<boolean> {
  try {
    // Dynamic import to avoid circular deps and allow graceful degradation
    const livekitSdk = await import('livekit-server-sdk').catch(() => null);

    if (!livekitSdk) {
      log.debug({ sessionId }, 'LiveKit SDK not available for active session injection');
      return false;
    }

    const { RoomServiceClient, DataPacket_Kind } = livekitSdk;

    if (!RoomServiceClient) {
      log.debug({ sessionId }, 'LiveKit SDK not available for active session injection');
      return false;
    }

    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      log.debug({ sessionId }, 'LiveKit credentials not configured');
      return false;
    }

    const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

    // Check if the room still exists (user still connected)
    const rooms = await roomService.listRooms([sessionId]);
    if (!rooms || rooms.length === 0) {
      log.debug({ sessionId }, 'Session room not found, user likely disconnected');
      return false;
    }

    // Build the data message
    const contactName = request.resolvedContact?.name || request.contactQuery;
    const dataMessage = {
      type: 'on_behalf_call_complete',
      callId: outcome.callId,
      contactName,
      status: outcome.status,
      objectiveAchieved: outcome.objectiveAchieved,
      outcome: outcome.outcome,
      callbackRequired: outcome.callbackRequired || false,
      actionItems: outcome.actionItems || [],
      timestamp: Date.now(),
    };

    // Send data to the room
    const dataBytes = new TextEncoder().encode(JSON.stringify(dataMessage));
    await roomService.sendData(sessionId, dataBytes, DataPacket_Kind.RELIABLE, {});

    log.info(
      { sessionId, callId: outcome.callId, contactName },
      'Injected call result into active session'
    );
    return true;
  } catch (error) {
    // Log but don't fail - this is a nice-to-have, not critical
    log.debug(
      { error: String(error), sessionId },
      'Could not inject to active session (user may have disconnected)'
    );
    return false;
  }
}

// ============================================================================
// FOLLOW-UP ACTIONS
// ============================================================================

/**
 * Create follow-up actions based on call outcome
 */
async function createFollowUpActions(
  userId: string,
  callId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): Promise<void> {
  const actions: FollowUpAction[] = [];

  // If callback is required, schedule it
  if (outcome.callbackRequired) {
    actions.push({
      id: `${callId}-callback`,
      callId,
      userId,
      type: 'callback',
      description: `Follow up on call to ${request.resolvedContact?.name || request.contactQuery}`,
      scheduledFor: outcome.callbackTime || undefined,
      createdAt: new Date().toISOString(),
    });
  }

  // If action items were captured, create reminders
  if (outcome.actionItems?.length) {
    for (const item of outcome.actionItems) {
      actions.push({
        id: `${callId}-action-${actions.length}`,
        callId,
        userId,
        type: 'reminder',
        description: item,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Store follow-up actions
  if (actions.length > 0) {
    try {
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

      const db = getFirestoreDb ? getFirestoreDb() : null;

      if (db) {
        for (const action of actions) {
          await db
            .collection('bogle_users')
            .doc(userId)
            .collection('follow_up_actions')
            .doc(action.id)
            .set(action);
        }
      } else {
        // In-memory fallback
        const existing = followUpActionsStore.get(userId) || [];
        followUpActionsStore.set(userId, [...existing, ...actions]);
      }

      log.info({ userId, callId, actionCount: actions.length }, 'Follow-up actions created');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to create follow-up actions');
    }
  }
}

// ============================================================================
// MAIN CAPTURE FUNCTION
// ============================================================================

/**
 * Capture the result of an on-behalf call
 *
 * This is the main entry point called by the orchestrator when a call completes.
 * It handles:
 * 1. Storing the result for history
 * 2. Notifying the original session (for active sessions)
 * 3. Sending push notification (for disconnected users)
 * 4. Creating follow-up actions
 */
export async function captureCallResult(
  callId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): Promise<void> {
  log.info(
    {
      callId,
      status: outcome.status,
      objectiveAchieved: outcome.objectiveAchieved,
      contactName: request.resolvedContact?.name,
    },
    'Capturing call result'
  );

  try {
    // 1. Build the stored result
    const result: StoredCallResult = {
      callId,
      userId: request.userId,
      outcome,
      request: {
        contactQuery: request.contactQuery,
        contactName: request.resolvedContact?.name,
        contactPhone: request.resolvedContact?.phone,
        purpose: request.purpose,
        objective: request.objective,
        callType: request.callType,
      },
      capturedAt: new Date().toISOString(),
    };

    // 2. Store the result
    await storeCallResult(result);

    // 3. Try to inject directly into active session (instant feedback)
    const injectedToActive = await injectToActiveSession(
      request.originalSessionId,
      outcome,
      request
    );

    // 4. Store notification for later if session wasn't active
    if (!injectedToActive) {
      await notifyOriginalSession(request.originalSessionId, callId, outcome);
    }

    // 5. Send push notification (reaches user even if disconnected)
    // This is sent regardless - push notifications work even if they're in-app
    await sendCallResultPushNotification(request, outcome, callId);

    // 6. Create follow-up actions
    await createFollowUpActions(request.userId, callId, outcome, request);

    log.info({ callId, userId: request.userId }, 'Call result captured successfully');
  } catch (error) {
    log.error({ error: String(error), callId }, 'Failed to capture call result');
    throw error;
  }
}

/**
 * Send push notification for call result
 * This ensures the user is notified even if they disconnected from the session
 */
async function sendCallResultPushNotification(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string
): Promise<void> {
  try {
    const { sendPushNotification, isPushNotificationsAvailable } = await import(
      './delivery/push-notifications.js'
    );

    if (!isPushNotificationsAvailable()) {
      log.debug({ callId }, 'Push notifications not available, skipping');
      return;
    }

    const contactName = request.resolvedContact?.name || request.contactQuery;

    // Build notification content based on outcome
    let title: string;
    let body: string;

    if (outcome.objectiveAchieved) {
      title = `✓ Call with ${contactName} complete`;
      body = outcome.outcome;
    } else if (outcome.status === 'voicemail') {
      title = `📞 Left voicemail for ${contactName}`;
      body = 'They should call back soon.';
    } else if (outcome.status === 'no_answer' || outcome.status === 'busy') {
      title = `📞 Couldn't reach ${contactName}`;
      body = outcome.callbackRequired
        ? 'Want me to try again later?'
        : outcome.outcome;
    } else {
      title = `📞 Call update: ${contactName}`;
      body = outcome.outcome;
    }

    await sendPushNotification({
      userId: request.userId,
      outreachId: callId,
      personaId: 'ferni',
      title,
      body,
      data: {
        type: 'on_behalf_call_complete',
        callId,
        status: outcome.status,
        objectiveAchieved: String(outcome.objectiveAchieved),
        callbackRequired: String(outcome.callbackRequired || false),
      },
      priority: 'high',
      clickAction: '/calls', // Navigate to call history
    });

    log.info({ callId, userId: request.userId }, 'Push notification sent for call result');
  } catch (error) {
    // Don't fail the whole capture if push fails
    log.warn({ error: String(error), callId }, 'Failed to send push notification');
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get recent call results for a user
 */
export async function getRecentCallResults(
  userId: string,
  limit: number = 10
): Promise<StoredCallResult[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('on_behalf_calls')
        .orderBy('capturedAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc: { data: () => unknown }) => doc.data() as StoredCallResult);
    }

    // In-memory fallback
    return Array.from(callResultStore.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
      .slice(0, limit);
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get recent call results');
    return [];
  }
}

/**
 * Get pending follow-up actions for a user
 */
export async function getPendingFollowUps(userId: string): Promise<FollowUpAction[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('follow_up_actions')
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc: { data: () => unknown }) => doc.data() as FollowUpAction);
    }

    return followUpActionsStore.get(userId) || [];
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get pending follow-ups');
    return [];
  }
}
