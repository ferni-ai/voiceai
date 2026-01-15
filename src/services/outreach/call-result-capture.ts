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
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onCallResultChange, onFollowUpActionChange } from '../data-layer/hooks/misc-hooks.js';
import type {
  CallOutcome,
  OnBehalfCallRequest,
} from '../../tools/domains/telephony/call-on-behalf.js';

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
        .set(cleanForFirestore(result));

      // Semantic indexing
      void onCallResultChange(
        result.userId,
        result.callId,
        {
          callId: result.callId,
          contactName: result.request.contactName || result.request.contactQuery,
          purpose: result.request.purpose,
          outcome:
            result.outcome.status === 'completed'
              ? 'answered'
              : (result.outcome.status as 'voicemail' | 'busy' | 'no_answer' | 'failed'),
          summary: result.outcome.transcriptSummary || result.outcome.outcome,
          nextSteps: result.outcome.actionItems?.join('; '),
          capturedAt: result.capturedAt,
        },
        'create'
      );

      log.debug({ callId: result.callId }, 'Call result stored in Firestore');
    } else {
      // Fallback to in-memory
      callResultStore.set(result.callId, result);
      log.debug({ callId: result.callId }, 'Call result stored in memory');
    }
  } catch (error) {
    // Store in memory as fallback
    callResultStore.set(result.callId, result);
    log.warn(
      { error: String(error), callId: result.callId },
      'Firestore unavailable, stored in memory'
    );
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
        .add(cleanForFirestore(notification));
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
 *
 * SUPERHUMAN SMART REMINDERS:
 * - Analyzes action items to infer appropriate timing
 * - "Visit mom" → 1 week reminder
 * - "Call back" → next day reminder
 * - "Check on health" → 3 day reminder
 */
async function createFollowUpActions(
  userId: string,
  callId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): Promise<void> {
  const actions: FollowUpAction[] = [];
  const contactName = request.resolvedContact?.name || request.contactQuery;

  // If callback is required, schedule it
  if (outcome.callbackRequired) {
    actions.push({
      id: `${callId}-callback`,
      callId,
      userId,
      type: 'callback',
      description: `Follow up on call to ${contactName}`,
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

    // =========================================================================
    // SUPERHUMAN: Create actual scheduled reminders from action items
    // =========================================================================
    await createSmartRemindersFromActionItems(
      userId,
      callId,
      outcome.actionItems,
      contactName,
      request.resolvedContact?.phone
    );
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
            .set(cleanForFirestore(action));

          // Semantic indexing
          void onFollowUpActionChange(
            userId,
            action.id,
            {
              actionType: action.type,
              description: action.description,
              relatedCallId: action.callId,
              scheduledFor: action.scheduledFor,
              priority: 'medium',
              status: 'pending',
              createdAt: action.createdAt,
            },
            'create'
          );
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

    // 6. Send email notification (tangible record of the call)
    await sendCallResultEmail(request, outcome, callId);

    // 7. Create calendar event for callback if needed
    await createCallbackCalendarEvent(request, outcome, callId);

    // 8. Create follow-up actions
    await createFollowUpActions(request.userId, callId, outcome, request);

    // 9. Store in unified background results (for "While You Were Away")
    await storeInUnifiedResults(request, outcome, callId);

    log.info(
      { callId, userId: request.userId },
      'Call result captured successfully (push + email + calendar + unified)'
    );
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
    const { sendPushNotification, isPushNotificationsAvailable } =
      await import('./delivery/push-notifications.js');

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
      body = outcome.callbackRequired ? 'Want me to try again later?' : outcome.outcome;
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

/**
 * Send email notification for call result
 * This ensures the user gets a tangible record of the call
 */
async function sendCallResultEmail(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string
): Promise<void> {
  try {
    // Get user's email
    const email = await getUserEmail(request.userId);
    if (!email) {
      log.debug(
        { callId, userId: request.userId },
        'No email configured, skipping email notification'
      );
      return;
    }

    const { sendEmail, isEmailDeliveryAvailable } = await import('./delivery/email-delivery.js');

    if (!isEmailDeliveryAvailable()) {
      log.debug({ callId }, 'Email delivery not available, skipping');
      return;
    }

    const contactName = request.resolvedContact?.name || request.contactQuery;
    const completedAt = new Date().toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    // Build warm, human email content
    const { subject, body } = buildCallResultEmailContent(
      contactName,
      outcome,
      request.purpose,
      completedAt
    );

    await sendEmail({
      to: email,
      subject,
      body,
      personaId: 'ferni',
      userId: request.userId,
      outreachId: callId,
      tags: ['on-behalf-call', outcome.status],
    });

    log.info({ callId, userId: request.userId }, 'Email notification sent for call result');
  } catch (error) {
    // Don't fail the whole capture if email fails
    log.warn({ error: String(error), callId }, 'Failed to send email notification');
  }
}

/**
 * Build warm, human email content for call result
 */
function buildCallResultEmailContent(
  contactName: string,
  outcome: CallOutcome,
  purpose: string,
  completedAt: string
): { subject: string; body: string } {
  // Build subject based on outcome
  let subject: string;
  if (outcome.objectiveAchieved) {
    subject = `✓ Talked to ${contactName} for you`;
  } else if (outcome.status === 'voicemail') {
    subject = `📞 Left a message for ${contactName}`;
  } else if (outcome.status === 'no_answer' || outcome.status === 'busy') {
    subject = `📞 Couldn't reach ${contactName}`;
  } else {
    subject = `📞 Call update: ${contactName}`;
  }

  // Build warm body
  const lines: string[] = [];
  lines.push(`Hey! Just wanted to let you know about the call to ${contactName}.`);
  lines.push('');

  // What happened
  if (outcome.objectiveAchieved) {
    lines.push(
      `Great news - I was able to ${purpose.toLowerCase().replace(/^(say|tell|wish|let them know)/i, 'pass along your message to')}`
    );
  } else if (outcome.status === 'voicemail') {
    lines.push(
      `I left a voicemail for ${contactName}. I made sure to keep it warm and natural - just like you would.`
    );
  } else if (outcome.status === 'no_answer') {
    lines.push(`I tried calling ${contactName} but couldn't get through. No answer.`);
  } else if (outcome.status === 'busy') {
    lines.push(`I tried calling ${contactName} but the line was busy.`);
  }

  lines.push('');
  lines.push(`**What happened:** ${outcome.outcome}`);
  lines.push('');

  // Action items
  if (outcome.actionItems && outcome.actionItems.length > 0) {
    lines.push('**Action items:**');
    for (const item of outcome.actionItems) {
      lines.push(`• ${item}`);
    }
    lines.push('');
  }

  // Callback needed
  if (outcome.callbackRequired) {
    lines.push('**Heads up:** They mentioned wanting a callback.');
    if (outcome.callbackTime) {
      lines.push(`Best time to call back: ${outcome.callbackTime}`);
    }
    lines.push('');
  }

  lines.push(`*Completed: ${completedAt}*`);

  return { subject, body: lines.join('\n') };
}

/**
 * Create calendar event for callback if needed
 */
async function createCallbackCalendarEvent(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string
): Promise<void> {
  // Only create calendar event if callback is required
  if (!outcome.callbackRequired) {
    return;
  }

  try {
    const { createEvent, hasAnyProviderConnected } = await import('../calendar/index.js');

    // Check if user has any calendar connected
    const hasCalendar = await hasAnyProviderConnected(request.userId);
    if (!hasCalendar) {
      log.debug({ callId }, 'No calendar connected, skipping callback event');
      return;
    }

    const contactName = request.resolvedContact?.name || request.contactQuery;
    const contactPhone = request.resolvedContact?.phone;

    // Determine when to schedule the callback
    let callbackDate = new Date();
    if (outcome.callbackTime) {
      // Try to parse the callback time hint
      const parsed = parseCallbackTimeHint(outcome.callbackTime);
      if (parsed) {
        callbackDate = parsed;
      } else {
        // Default: tomorrow at 10am
        callbackDate.setDate(callbackDate.getDate() + 1);
        callbackDate.setHours(10, 0, 0, 0);
      }
    } else {
      // Default: tomorrow at 10am
      callbackDate.setDate(callbackDate.getDate() + 1);
      callbackDate.setHours(10, 0, 0, 0);
    }

    const description = [
      `Follow up on your earlier call with ${contactName}.`,
      '',
      `📞 Original purpose: ${request.purpose}`,
      `📝 What happened: ${outcome.outcome}`,
      '',
      contactPhone ? `Phone: ${contactPhone}` : '',
      '',
      `Created by Ferni`,
    ]
      .filter(Boolean)
      .join('\n');

    await createEvent(request.userId, {
      title: `📞 Call ${contactName} back`,
      description,
      startTime: callbackDate,
      endTime: new Date(callbackDate.getTime() + 15 * 60 * 1000), // 15 min
      reminders: [{ method: 'popup', minutesBefore: 10 }],
      color: '#FF9800', // Tangerine - stands out
    });

    log.info(
      { callId, userId: request.userId, contactName, scheduledFor: callbackDate.toISOString() },
      'Created calendar event for callback'
    );
  } catch (error) {
    // Don't fail the whole capture if calendar fails
    log.warn({ error: String(error), callId }, 'Failed to create callback calendar event');
  }
}

/**
 * Create smart reminders from call action items
 *
 * SUPERHUMAN INTELLIGENCE:
 * Analyzes the content of each action item to determine appropriate timing:
 * - "Visit" or "come see" → 1 week (gives time to plan)
 * - "Call back" or "reach out" → 1 day (time-sensitive)
 * - "Check on" or "follow up" → 3 days (moderate urgency)
 * - Default → 2 days
 */
async function createSmartRemindersFromActionItems(
  userId: string,
  callId: string,
  actionItems: string[],
  contactName: string,
  contactPhone?: string
): Promise<void> {
  try {
    const { createReminder } = await import('../scheduling/reminder-scheduler.js');

    // Get user's phone/email for delivery
    const { getUserContactInfo } = await import('./user-contact.js');

    let deliveryAddress: string | undefined;
    let deliveryMethod: 'sms' | 'email' = 'sms';

    try {
      const contactInfo = await getUserContactInfo(userId);
      deliveryAddress = contactInfo?.phone || contactInfo?.email;
      deliveryMethod = contactInfo?.phone ? 'sms' : 'email';
    } catch {
      // Contact lookup failed, will skip reminder creation
    }

    if (!deliveryAddress) {
      log.debug({ userId, callId }, 'No delivery address for smart reminders, skipping');
      return;
    }

    for (let i = 0; i < actionItems.length; i++) {
      const item = actionItems[i];
      const lowerItem = item.toLowerCase();

      // Infer timing based on action item content
      const scheduledFor = inferReminderTiming(lowerItem);

      // Build contextual message
      const message = buildReminderMessage(item, contactName);

      await createReminder({
        userId,
        message,
        context: `From call with ${contactName} (${callId})`,
        scheduledFor,
        deliveryMethod,
        deliveryAddress,
        createdBy: 'ferni',
        contactName,
      });

      log.info(
        {
          userId,
          callId,
          actionItem: item.slice(0, 50),
          scheduledFor: scheduledFor.toISOString(),
        },
        '⏰ Smart reminder created from action item'
      );
    }
  } catch (error) {
    // Don't fail the whole flow if reminder creation fails
    log.warn({ error: String(error), callId }, 'Failed to create smart reminders');
  }
}

/**
 * Infer appropriate reminder timing from action item text
 */
function inferReminderTiming(actionItem: string): Date {
  const now = new Date();
  const result = new Date(now);

  // Visit/see patterns → 1 week (needs planning)
  if (/\b(visit|come see|come over|stop by|drop by)\b/.test(actionItem)) {
    result.setDate(result.getDate() + 7);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  // Call back patterns → 1 day (time-sensitive)
  if (/\b(call (back|her|him|them)|reach out|get in touch|phone)\b/.test(actionItem)) {
    result.setDate(result.getDate() + 1);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  // Health/check patterns → 3 days (moderate urgency)
  if (/\b(check on|follow up|how.*feeling|health|doctor|appointment)\b/.test(actionItem)) {
    result.setDate(result.getDate() + 3);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  // Next month patterns
  if (/\b(next month|monthly|month)\b/.test(actionItem)) {
    result.setMonth(result.getMonth() + 1);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  // Soon patterns → 2 days
  if (/\b(soon|when you can|when possible)\b/.test(actionItem)) {
    result.setDate(result.getDate() + 2);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  // Default: 2 days
  result.setDate(result.getDate() + 2);
  result.setHours(10, 0, 0, 0);
  return result;
}

/**
 * Build a warm, human reminder message
 */
function buildReminderMessage(actionItem: string, contactName: string): string {
  // Make the reminder feel personal, not robotic
  const lowerItem = actionItem.toLowerCase();

  if (/\b(visit|come see)\b/.test(lowerItem)) {
    return `Remember: ${contactName} would love a visit! ${actionItem}`;
  }

  if (/\b(call)\b/.test(lowerItem)) {
    return `Hey! ${contactName} is hoping to hear from you. ${actionItem}`;
  }

  if (/\b(check on|health)\b/.test(lowerItem)) {
    return `Thinking of ${contactName} - ${actionItem}`;
  }

  // Default: Include the contact name for context
  return `From your call with ${contactName}: ${actionItem}`;
}

/**
 * Parse callback time hint into a Date
 * Handles things like "tomorrow morning", "this afternoon", "next week"
 */
function parseCallbackTimeHint(hint: string): Date | null {
  const now = new Date();
  const lowerHint = hint.toLowerCase();

  // Handle common patterns
  if (lowerHint.includes('tomorrow')) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);

    if (lowerHint.includes('morning')) {
      date.setHours(9, 0, 0, 0);
    } else if (lowerHint.includes('afternoon')) {
      date.setHours(14, 0, 0, 0);
    } else if (lowerHint.includes('evening')) {
      date.setHours(18, 0, 0, 0);
    } else {
      date.setHours(10, 0, 0, 0);
    }
    return date;
  }

  if (lowerHint.includes('this afternoon') || lowerHint.includes('later today')) {
    const date = new Date(now);
    date.setHours(14, 0, 0, 0);
    if (date <= now) {
      date.setHours(now.getHours() + 2);
    }
    return date;
  }

  if (lowerHint.includes('next week')) {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    date.setHours(10, 0, 0, 0);
    return date;
  }

  // Try to extract a time like "3pm" or "3:30pm"
  const timeMatch = lowerHint.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const isPM = timeMatch[3].toLowerCase() === 'pm';

    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);

    // If the time is in the past, assume tomorrow
    if (date <= now) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  return null;
}

/**
 * Get user's email address from Firestore
 */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return null;

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return null;

    const data = doc.data();
    return data?.email || data?.contact?.email || null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get user email');
    return null;
  }
}

// ============================================================================
// UNIFIED RESULTS INTEGRATION
// ============================================================================

/**
 * Store call result in the unified background results system.
 * This enables the "While You Were Away" feature to include call results
 * alongside other background task results.
 */
async function storeInUnifiedResults(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string
): Promise<void> {
  try {
    const { captureBackgroundResult } =
      await import('../background-agents/unified-result-capture.js');

    const contactName = request.resolvedContact?.name || request.contactQuery;

    // Build human-readable summary
    let summary: string;
    if (outcome.objectiveAchieved) {
      summary = `Called ${contactName} - ${outcome.outcome}`;
    } else if (outcome.status === 'voicemail') {
      summary = `Left voicemail for ${contactName}`;
    } else if (outcome.status === 'no_answer') {
      summary = `Tried calling ${contactName} - no answer`;
    } else if (outcome.status === 'busy') {
      summary = `Tried calling ${contactName} - line busy`;
    } else {
      summary = `Call to ${contactName}: ${outcome.outcome}`;
    }

    // Determine priority
    const priority = outcome.callbackRequired
      ? 'high'
      : outcome.objectiveAchieved
        ? 'normal'
        : 'normal';

    // Map outcome status to unified status
    const status = outcome.objectiveAchieved
      ? 'success'
      : outcome.status === 'voicemail'
        ? 'partial_success'
        : outcome.status === 'failed'
          ? 'failed'
          : 'partial_success';

    await captureBackgroundResult({
      userId: request.userId,
      type: 'on_behalf_call',
      status,
      summary,
      priority,
      initiatedBy: 'ferni', // Calls are typically initiated by Ferni
      sessionId: request.originalSessionId,
      contactName,
      contactId: request.resolvedContact?.id,
      details: outcome.transcriptSummary,
      actionItems: outcome.actionItems,
      requiresCallback: outcome.callbackRequired || false,
      callbackTime: outcome.callbackTime,
      relatedTaskId: callId,
      specificData: {
        callId,
        phoneNumber: request.resolvedContact?.phone,
        status: outcome.status,
      },
    });

    log.debug({ callId }, 'Call result stored in unified background results');
  } catch (error) {
    // Don't fail the whole capture if unified storage fails
    log.debug(
      { error: String(error), callId },
      'Could not store in unified results (non-blocking)'
    );
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
  limit = 10
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
