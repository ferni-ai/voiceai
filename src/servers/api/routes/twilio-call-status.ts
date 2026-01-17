/**
 * Twilio Call Status Webhook Handler
 *
 * Receives status callbacks from Twilio for on-behalf calls:
 * - initiated: Call is being placed
 * - ringing: Phone is ringing
 * - in-progress: Call connected
 * - completed: Call ended normally
 * - busy: Line is busy
 * - no-answer: No one picked up
 * - failed: Call failed
 * - canceled: Call was canceled
 *
 * @module servers/api/routes/twilio-call-status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import { captureCallResult } from '../../../services/outreach/call-result-capture.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type {
  CallOutcome,
  CallObjective,
  CallType,
} from '../../../tools/domains/telephony/call-on-behalf.js';

const log = createLogger({ module: 'twilio-call-status' });

// ============================================================================
// TYPES
// ============================================================================

interface TwilioCallStatusPayload {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus:
    | 'initiated'
    | 'ringing'
    | 'in-progress'
    | 'completed'
    | 'busy'
    | 'no-answer'
    | 'failed'
    | 'canceled';
  CallDuration?: string;
  Direction: 'outbound-api' | 'outbound-dial' | 'inbound';
  AnsweredBy?: 'human' | 'machine' | 'unknown';
  // Recording fields (if recording enabled)
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  // Error fields
  ErrorCode?: string;
  ErrorMessage?: string;
}

// In-memory tracking of pending on-behalf calls
// Maps Twilio CallSid → our call context
interface PendingCall {
  callId: string;
  userId: string;
  contactName: string;
  purpose: string;
  objective: CallObjective;
  callType: CallType;
  originalSessionId: string;
  startedAt: string;
}

const pendingCalls = new Map<string, PendingCall>();

// ============================================================================
// CALL TRACKING
// ============================================================================

/**
 * Track a new outbound call
 * Called by the orchestrator when initiating a call
 */
export function trackOutboundCall(twilioCallSid: string, context: PendingCall): void {
  pendingCalls.set(twilioCallSid, context);
  log.info(
    { twilioCallSid, callId: context.callId, contactName: context.contactName },
    'Tracking outbound on-behalf call'
  );
}

/**
 * Get pending call context
 */
export function getPendingCall(twilioCallSid: string): PendingCall | undefined {
  return pendingCalls.get(twilioCallSid);
}

/**
 * Remove completed call from tracking
 */
export function removePendingCall(twilioCallSid: string): void {
  pendingCalls.delete(twilioCallSid);
}

// ============================================================================
// STATUS HANDLING
// ============================================================================

/**
 * Convert Twilio status to our CallOutcome
 */
function twilioStatusToOutcome(
  payload: TwilioCallStatusPayload,
  pendingCall: PendingCall
): CallOutcome | null {
  const { CallStatus, AnsweredBy, RecordingUrl, CallDuration, ErrorMessage } = payload;

  // Only process terminal states
  if (!['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(CallStatus)) {
    return null;
  }

  const baseOutcome: CallOutcome = {
    callId: pendingCall.callId,
    status: 'completed',
    objectiveAchieved: false,
    outcome: '',
    callbackRequired: false,
  };

  switch (CallStatus) {
    case 'completed':
      // Call connected and ended normally
      // The actual outcome (objective achieved, etc.) should come from the agent
      // For now, we mark it as completed and let agent update later
      return {
        ...baseOutcome,
        status: 'completed',
        outcome:
          AnsweredBy === 'machine'
            ? `Left voicemail for ${pendingCall.contactName}`
            : `Call with ${pendingCall.contactName} completed (${CallDuration}s)`,
        objectiveAchieved: AnsweredBy !== 'machine', // Assume success if human answered
        recordingUrl: RecordingUrl,
      };

    case 'busy':
      return {
        ...baseOutcome,
        status: 'busy',
        outcome: `${pendingCall.contactName}'s line was busy`,
        callbackRequired: true,
        callbackTime: 'in 15 minutes',
      };

    case 'no-answer':
      return {
        ...baseOutcome,
        status: 'no_answer',
        outcome: `${pendingCall.contactName} didn't answer`,
        callbackRequired: true,
        callbackTime: 'in 30 minutes',
      };

    case 'failed':
      return {
        ...baseOutcome,
        status: 'failed',
        outcome: ErrorMessage || `Call to ${pendingCall.contactName} failed`,
        callbackRequired: true,
      };

    case 'canceled':
      return {
        ...baseOutcome,
        status: 'failed',
        outcome: `Call to ${pendingCall.contactName} was canceled`,
        callbackRequired: false,
      };

    default:
      return null;
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Parse URL-encoded body (Twilio sends application/x-www-form-urlencoded)
 */
async function parseFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const result: Record<string, string> = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      resolve(result);
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

/**
 * Handle Twilio call status webhook
 *
 * POST /api/webhooks/call-status
 */
export async function handleTwilioCallStatus(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Only handle POST to our specific path
  if (req.method !== 'POST') {
    return false;
  }

  try {
    // Parse the URL-encoded body
    const payload = (await parseFormBody(req)) as unknown as TwilioCallStatusPayload;

    log.debug(
      {
        callSid: payload.CallSid,
        status: payload.CallStatus,
        to: payload.To,
        duration: payload.CallDuration,
      },
      'Received Twilio call status webhook'
    );

    // Look up our call context
    const pendingCall = getPendingCall(payload.CallSid);

    if (!pendingCall) {
      // Not one of our on-behalf calls - might be a regular outbound call
      log.debug({ callSid: payload.CallSid }, 'Call not tracked as on-behalf call, ignoring');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return true;
    }

    // Convert to our outcome format
    const outcome = twilioStatusToOutcome(payload, pendingCall);

    if (outcome) {
      log.info(
        {
          callSid: payload.CallSid,
          callId: pendingCall.callId,
          status: outcome.status,
          objectiveAchieved: outcome.objectiveAchieved,
        },
        'Processing on-behalf call result'
      );

      // Capture the result (stores to Firestore, notifies session, creates follow-ups)
      await captureCallResult(outcome.callId, outcome, {
        contactQuery: pendingCall.contactName,
        resolvedContact: {
          name: pendingCall.contactName,
          phone: payload.To,
        },
        purpose: pendingCall.purpose,
        objective: pendingCall.objective,
        callType: pendingCall.callType,
        originalSessionId: pendingCall.originalSessionId,
        userId: pendingCall.userId,
        userTimezone: 'America/Los_Angeles', // Default, should be passed from orchestrator
        userName: 'the user',
        recordingConsent: true,
      });

      // Remove from pending tracking
      removePendingCall(payload.CallSid);
    }

    // Always respond 200 to Twilio
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Error processing Twilio call status webhook');

    // Still respond 200 to prevent Twilio retries for our errors
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { TwilioCallStatusPayload };
