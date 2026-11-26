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
import { callResultDetails, callResultTextOn, tellOwnerAboutCall } from './call-result-text.js';
import { ownerEmailWords, tellOwnerOnce } from './call-result-once.js';
import { callResultLiveReportOn, reportCallResultLive } from './call-result-live.js';
import { resultRoomName, roomToTell } from './owner-room.js';
import { notePushOutcome } from './delivery/push-outcome.js';
import { logCallResultOutcome } from '../follow-through/index.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import { voicemailWords } from './voicemail-outcome.js';
import { completedAtFor, contactForOwner, type StepOutcome } from './call-result-words.js';
import { callResultExpireAt } from './call-result-expiry.js';
import { callbackEventFor } from './callback-calendar-event.js';
import { userTimezone } from './call-hours-guard.js';
import {
  askedLine,
  callbackAsked,
  callbackFields,
  callbackFollowUp,
  callbackMeansAskedOn,
  retryOfferLine,
  retryWanted,
  spokenOutcome,
} from '../background-agents/call-follow-up/index.js';

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

interface FollowUpAction {
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

/** Store a call result in Firestore (with in-memory fallback) */
async function storeCallResult(result: StoredCallResult): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js').catch(() => ({
      getFirestoreDb: null,
    }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (db) {
      // A Date, not an ISO string: Firestore's TTL (call-result-expiry.ts) reads only a Timestamp.
      const clean = { ...cleanForFirestore(result), expireAt: callResultExpireAt() };
      await db
        .collection('bogle_users')
        .doc(result.userId)
        .collection('on_behalf_calls')
        .doc(result.callId)
        // Only the result's own fields: told.* (call-result-once.ts) and delivered survive a second capture.
        .set(clean, { mergeFields: Object.keys(clean) });

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
      callResultStore.set(result.callId, result);
      log.debug({ callId: result.callId }, 'Call result stored in memory');
    }
  } catch (error) {
    callResultStore.set(result.callId, result);
    log.warn(
      { error: String(error), callId: result.callId },
      'Firestore unavailable, stored in memory'
    );
  }
}

/** Get a stored call result */
export async function getCallResult(
  callId: string,
  userId: string
): Promise<StoredCallResult | null> {
  if (!isMemberIdentity(userId.trim())) return null; // no shared bucket to read
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
// ACTIVE SESSION INJECTION
// ============================================================================

/**
 * Inject call result into active LiveKit session: if the user is still in the requesting call's
 * room, the result goes to them on the data channel. CALL_LIVE_RELAY on: the owner's own room
 * only, to the owner only (owner-room.ts); off: by the session id, as on main.
 */
async function injectToActiveSession(
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): Promise<boolean> {
  const room = resultRoomName(request);
  const { callId } = outcome;
  if (!room) return false; // no requesting call (an empty name is no room)
  try {
    // Dynamic import to avoid circular deps and allow graceful degradation
    const livekitSdk = await import('livekit-server-sdk').catch(() => null);

    if (!livekitSdk?.RoomServiceClient) {
      log.debug({ callId }, 'LiveKit SDK not available for active session injection');
      return false;
    }
    const { RoomServiceClient, DataPacket_Kind } = livekitSdk;

    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      log.debug({ callId }, 'LiveKit credentials not configured');
      return false;
    }

    const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

    const target = await roomToTell(roomService, room, request, callId);
    if (!target) return false; // the room is gone, or (flag on) not the owner's own

    // Build the data message
    const contactName = request.resolvedContact?.name || request.contactQuery;
    const dataMessage = {
      type: 'on_behalf_call_complete',
      callId: outcome.callId,
      contactName,
      status: outcome.status,
      objectiveAchieved: outcome.objectiveAchieved,
      outcome: outcome.outcome,
      callbackRequired: callbackAsked(outcome),
      ...(retryWanted(outcome) ? { retryOffered: true } : {}), // the web keeps it high priority
      actionItems: outcome.actionItems || [],
      timestamp: Date.now(),
    };

    // Send data to the room
    const dataBytes = new TextEncoder().encode(JSON.stringify(dataMessage));
    await roomService.sendData(target.room, dataBytes, DataPacket_Kind.RELIABLE, target.options);

    log.info(
      { callId: outcome.callId, hasContactName: Boolean(contactName) },
      'Injected call result into active session'
    );
    return true;
  } catch (error) {
    // Log but don't fail - this is a nice-to-have, not critical
    log.debug(
      { error: String(error), callId: outcome.callId },
      'Could not inject to active session (user may have disconnected)'
    );
    return false;
  }
}

// ============================================================================
// FOLLOW-UP ACTIONS
// ============================================================================

/** Create follow-up actions based on call outcome */
function createFollowUpActions(
  userId: string,
  callId: string,
  outcome: CallOutcome,
  request: OnBehalfCallRequest
): void {
  const actions: FollowUpAction[] = [];

  // A call back they asked for, or a retry to offer: either way the user has one to decide
  if (callbackFollowUp(outcome)) {
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

  // Index each action to semantic memory. They used to be stored in
  // bogle_users/{uid}/follow_up_actions too, but nothing read those docs, so that
  // write is gone (memory v2 C5a).
  if (actions.length === 0) return;
  try {
    for (const action of actions) {
      onFollowUpActionChange(
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
    log.info({ userId, callId, actionCount: actions.length }, 'Follow-up actions created');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create follow-up actions');
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
  produced: CallOutcome,
  request: OnBehalfCallRequest
): Promise<void> {
  // Every channel and both stores get one wording: a missed call in Ferni's words (#4468).
  const outcome = spokenOutcome(produced, request.resolvedContact?.name || request.contactQuery);
  const { status, objectiveAchieved } = outcome;
  log.info(
    { callId, status, objectiveAchieved, hasContactName: Boolean(request.resolvedContact?.name) },
    'Capturing call result'
  );
  logCallResultOutcome(callId, status, request.userId);

  // PRIVACY: with no member behind the call (a stream with no userId became 'unknown'), every
  // such result shared one bucket the next lookup read. Tell a live session, store nothing.
  if (!isMemberIdentity(request.userId?.trim())) {
    log.warn({ callId }, 'Call result has no member to report to; nothing stored or sent');
    await injectToActiveSession(outcome, request);
    return;
  }

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

    // 2. Store the result, 3. follow-up actions (keyed by callId, so a second capture rewrites them)
    await storeCallResult(result);
    createFollowUpActions(request.userId, callId, outcome, request);

    // 4. Tell the owner, each channel once per call (call-result-once.ts): live (CALL_RESULT_LIVE_REPORT),
    // push, the email record, a callback event, While You Were Away, and the text (CALL_RESULT_TEXT).
    const contactName = request.resolvedContact?.name || request.contactQuery;
    const { push, email: mailSent } = await tellOwnerOnce(
      { userId: request.userId, callId, outcome, contactName },
      {
        live: async () => callResultLiveReportOn() ? reportCallResultLive(request, outcome) : injectToActiveSession(outcome, request), // prettier-ignore
        push: async (lead) => sendCallResultPushNotification(request, outcome, callId, lead),
        email: async () => sendCallResultEmail(request, outcome, callId),
        calendar: async () => createCallbackCalendarEvent(request, outcome, callId),
        record: async () => storeInUnifiedResults(request, outcome, callId),
        text: async (live) => tellOwnerAboutCall({ request, outcome, callId, live }),
        textOn: () => callResultTextOn(),
      }
    );

    log.info(
      { callId, userId: request.userId, pushStatus: push, mailStatus: mailSent },
      'Call result captured'
    ); // sent, failed or skipped
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
  callId: string,
  lead?: string // Ferni's crisis line, put first
): Promise<StepOutcome> {
  try {
    const { sendPushNotification, isPushNotificationsAvailable } =
      await import('./delivery/push-notifications.js');

    if (!isPushNotificationsAvailable()) {
      log.debug({ callId }, 'Push notifications not available, skipping');
      return 'skipped';
    }

    const contactName = request.resolvedContact?.name || contactForOwner(request.contactQuery);

    // Build notification content based on outcome
    let title: string;
    let body: string;

    if (outcome.objectiveAchieved) {
      title = `✓ Call with ${contactName} complete`;
      body = outcome.outcome;
    } else if (outcome.status === 'voicemail') {
      title = voicemailWords(outcome.voicemailLeft, contactName).pushTitle;
      body = voicemailWords(outcome.voicemailLeft, contactName).pushBody;
    } else if (outcome.status === 'no_answer' || outcome.status === 'busy') {
      title = `📞 Couldn't reach ${contactName}`;
      body = callbackFollowUp(outcome) ? 'Want me to try again later?' : outcome.outcome;
    } else {
      title = `📞 Call update: ${contactName}`;
      body = outcome.outcome;
    }

    const results = await sendPushNotification({
      userId: request.userId,
      outreachId: callId,
      personaId: 'ferni',
      title,
      body: lead ? `${lead} ${body}` : body,
      data: {
        type: 'on_behalf_call_complete',
        callId,
        status: outcome.status,
        objectiveAchieved: String(outcome.objectiveAchieved),
        callbackRequired: String(callbackAsked(outcome)),
      },
      priority: 'high',
      clickAction: '/calls', // Navigate to call history
    });
    const fields = { callId, userId: request.userId, for: 'call result' };
    return notePushOutcome(log, results, fields) ? 'sent' : 'failed';
  } catch (error) {
    // Don't fail the whole capture if push fails
    log.warn({ error: String(error), callId }, 'Failed to send push notification');
    return 'failed';
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
): Promise<StepOutcome> {
  try {
    const email = await getUserEmail(request.userId);
    if (!email) {
      log.debug(
        { callId, userId: request.userId },
        'No email configured, skipping email notification'
      );
      return 'skipped';
    }

    const { sendEmail, isEmailDeliveryAvailable } = await import('./delivery/email-delivery.js');

    if (!isEmailDeliveryAvailable()) {
      log.debug({ callId }, 'Email delivery not available, skipping');
      return 'skipped';
    }

    const contactName = request.resolvedContact?.name || contactForOwner(request.contactQuery);
    const completedAt = completedAtFor(request.userTimezone);

    // Warm, human, and what they said: Ferni's crisis line first when the call carried one
    const words = ownerEmailWords(contactName, outcome);
    const who = { name: contactName, relationship: request.resolvedContact?.relationship };
    const offer = retryOfferLine(who, outcome, outcome.outcome); // asked once
    const asked = askedLine(who, 'They mentioned wanting a callback.');
    const { subject, body } = buildCallResultEmailContent(contactName, outcome, request.purpose, completedAt, { ...words, offer, asked }); // prettier-ignore

    const sent = await sendEmail({
      to: email,
      subject,
      body,
      personaId: 'ferni',
      userId: request.userId,
      outreachId: callId,
      tags: ['on-behalf-call', outcome.status],
    });
    // A failure logs a code only: never the address or the body.
    if (sent.success) log.info({ callId, userId: request.userId }, 'Email notification sent for call result');
    else log.warn({ callId, userId: request.userId, code: sent.status ?? 'send_failed' }, 'Email notification NOT sent'); // prettier-ignore
    return sent.success ? 'sent' : 'failed';
  } catch (error) {
    // Don't fail the whole capture if email fails
    log.warn({ callId, code: (error as Error)?.name ?? 'error' }, 'Failed to send email notification'); // prettier-ignore
    return 'failed';
  }
}

/** Build warm, human email content for call result */
function buildCallResultEmailContent(
  contactName: string,
  outcome: CallOutcome,
  purpose: string,
  completedAt: string,
  words: { lead?: string; details?: string; offer?: string; asked: string }
): { subject: string; body: string } {
  // Build subject based on outcome
  let subject: string;
  if (outcome.objectiveAchieved) {
    subject = `✓ Talked to ${contactName} for you`;
  } else if (outcome.status === 'voicemail') {
    subject = voicemailWords(outcome.voicemailLeft, contactName).emailSubject;
  } else if (outcome.status === 'no_answer' || outcome.status === 'busy') {
    subject = `📞 Couldn't reach ${contactName}`;
  } else {
    subject = `📞 Call update: ${contactName}`;
  }

  // Build warm body
  const lines: string[] = [];
  if (words.lead) lines.push(`**${words.lead}**`, '');
  lines.push(`Hey! Just wanted to let you know about the call to ${contactName}.`);
  lines.push('');

  // What happened (on, #4468: a missed call is said once, by name, under "What happened")
  if (outcome.objectiveAchieved) {
    lines.push(
      `Great news - I was able to ${purpose.toLowerCase().replace(/^(say|tell|wish|let them know)/i, 'pass along your message to')}`
    );
  } else if (outcome.status === 'voicemail') {
    lines.push(voicemailWords(outcome.voicemailLeft, contactName).emailLine);
  } else if (outcome.status === 'no_answer' && !callbackMeansAskedOn()) {
    lines.push(`I tried calling ${contactName} but couldn't get through. No answer.`);
  } else if (outcome.status === 'busy' && !callbackMeansAskedOn()) {
    lines.push(`I tried calling ${contactName} but the line was busy.`);
  }

  lines.push('');
  lines.push(`**What happened:** ${outcome.outcome}`, '');
  if (words.details) lines.push(`**What they said:** ${words.details}`, '');

  // Action items
  if (outcome.actionItems && outcome.actionItems.length > 0) {
    lines.push('**Action items:**');
    for (const item of outcome.actionItems) {
      lines.push(`• ${item}`);
    }
    lines.push('');
  }

  // Callback needed
  if (callbackAsked(outcome)) {
    lines.push(`**Heads up:** ${words.asked}`);
    if (outcome.callbackTime) {
      lines.push(`Best time to call back: ${outcome.callbackTime}`);
    }
    lines.push('');
  } else if (words.offer) {
    lines.push(words.offer, '');
  }

  if (completedAt) lines.push(`*Completed: ${completedAt}*`);

  return { subject, body: lines.join('\n') };
}

/** Get user's email address from Firestore */
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

/**
 * Add the "Call them back" event (callback-calendar-event.ts) to the user's calendar, only
 * when the person on the call asked and a calendar is connected. With CALLBACK_MEANS_ASKED
 * on it needs the user's saved zone; none, no event. Never throws.
 */
async function createCallbackCalendarEvent(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string
): Promise<void> {
  const now = new Date();
  if (!callbackAsked(outcome)) return;
  try {
    const on = callbackMeansAskedOn();
    const zone = on ? await userTimezone(request.userId) : undefined;
    if (on && !zone) {
      log.info({ callId, hasZone: false }, 'No user time zone, skipping callback event');
      return;
    }
    const { createEvent, hasAnyProviderConnected } = await import('../calendar/index.js');
    if (!(await hasAnyProviderConnected(request.userId))) {
      log.debug({ callId }, 'No calendar connected, skipping callback event');
      return;
    }
    const event = callbackEventFor(request, outcome, zone, now);
    await createEvent(request.userId, event);
    log.info(
      { callId, userId: request.userId, scheduledFor: event.startTime.toISOString() },
      'Created calendar event for callback'
    );
  } catch (error) {
    // Don't fail the whole capture if calendar fails
    log.warn({ error: String(error), callId }, 'Failed to create callback calendar event');
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
    if (callbackMeansAskedOn() && !outcome.objectiveAchieved) {
      summary = outcome.outcome; // #4468: Ferni's own sentence, by name, never "- no answer"
    } else if (outcome.objectiveAchieved) {
      summary = `Called ${contactName} - ${outcome.outcome}`;
    } else if (outcome.status === 'voicemail') {
      summary = voicemailWords(outcome.voicemailLeft, contactName).summary;
    } else if (outcome.status === 'no_answer') {
      summary = `Tried calling ${contactName} - no answer`;
    } else if (outcome.status === 'busy') {
      summary = `Tried calling ${contactName} - line busy`;
    } else {
      summary = `Call to ${contactName}: ${outcome.outcome}`;
    }

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
      priority: callbackFollowUp(outcome) ? 'high' : 'normal',
      initiatedBy: 'ferni', // Calls are typically initiated by Ferni
      sessionId: request.originalSessionId,
      contactName,
      contactId: request.resolvedContact?.id,
      details: callResultDetails(contactName, outcome),
      actionItems: outcome.actionItems,
      requiresCallback: callbackAsked(outcome),
      callbackTime: outcome.callbackTime,
      callFollowUp: callbackFields(outcome), // its readers derive the ask (#4468)
      relatedTaskId: callId,
      specificData: {
        callId,
        phoneNumber: request.resolvedContact?.phone,
        status: outcome.status,
      },
      // captureCallResult sends this call's push and email itself, once: here they went again,
      // a second push on every call and a second email for a callback (audit 2026-10-29, C).
      skipPush: true,
      skipEmail: true,
      expireAt: callResultExpireAt(), // the copy goes when the call result does
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

/** Get recent call results for a user */
export async function getRecentCallResults(
  userId: string,
  limit = 10
): Promise<StoredCallResult[]> {
  if (!isMemberIdentity(userId.trim())) return [];
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
