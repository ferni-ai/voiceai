/**
 * Conversational Voice Call Outreach
 *
 * > "We show up. Not because you asked. Because we noticed."
 *
 * Creates outbound voice calls where Ferni (or other personas) can:
 * - Deliver SSML-enhanced messages that sound human
 * - Have two-way conversations (not just voicemails)
 * - Handle user responses naturally
 *
 * Uses LiveKit + Twilio SIP integration for real voice calls.
 *
 * @module ConversationalCalls
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  CallResult,
  CallStatusUpdate,
  CallSummaryUpdate,
  ConversationalCallService,
  OutboundCallContext,
  ProactiveCallRequest,
  ScheduledCall,
  StatusCallbackData,
} from './conversational-calls-types.js';
import {
  convertToTwilioSSML,
  enhanceSSMLForCall,
  getNextAvailableWindow,
  isInQuietHours,
  normalizePhoneNumber,
  saveScheduledCall,
  updateCallStatus,
} from './conversational-calls-helpers.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type * from './conversational-calls-types.js';
export {
  enhanceSSMLForCall,
  formatReferralConversationsForContext,
} from './conversational-calls-helpers.js';

const log = createLogger({ module: 'ConversationalCalls' });

// ============================================================================
// CALL SCHEDULING
// ============================================================================

/**
 * Schedule a proactive outreach call
 */
export async function scheduleProactiveCall(request: ProactiveCallRequest): Promise<CallResult> {
  const {
    userId,
    phoneNumber,
    message,
    ssml,
    personaId,
    reason,
    scheduledFor = new Date(),
    maxDuration = 120,
    enableConversation = false,
    voicemailFallback = true,
  } = request;

  const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Validate phone number format
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Check quiet hours
    const inQuietHours = await isInQuietHours(userId);
    if (inQuietHours) {
      log.info({ userId, callId }, 'Call delayed due to quiet hours');
      // Reschedule for next available window
      const nextWindow = await getNextAvailableWindow(userId);
      return scheduleProactiveCall({
        ...request,
        scheduledFor: nextWindow,
      });
    }

    // Enhance SSML for natural delivery
    const enhancedSSML = enhanceSSMLForCall(ssml, personaId);

    // Store scheduled call in Firestore
    const scheduledCall: ScheduledCall = {
      id: callId,
      userId,
      phoneNumber: normalizedPhone,
      message,
      ssml: enhancedSSML,
      personaId,
      reason,
      scheduledFor: scheduledFor.toISOString(),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
    };

    await saveScheduledCall(scheduledCall);

    // If scheduled for now or past, initiate immediately
    if (scheduledFor.getTime() <= Date.now()) {
      return await initiateCall(scheduledCall, {
        maxDuration,
        enableConversation,
        voicemailFallback,
      });
    }

    log.info(
      { userId, callId, scheduledFor: scheduledFor.toISOString() },
      'Proactive call scheduled'
    );

    return { success: true, callId, status: 'scheduled' };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to schedule proactive call');
    return { success: false, error: String(error) };
  }
}

/**
 * Initiate an outbound call using Twilio + LiveKit
 */
async function initiateCall(
  call: ScheduledCall,
  options: {
    maxDuration: number;
    enableConversation: boolean;
    voicemailFallback: boolean;
  }
): Promise<CallResult> {
  try {
    // Update status
    await updateCallStatus(call.id, 'in_progress', { lastAttemptAt: new Date().toISOString() });

    // Check if Twilio is configured
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioToken || !twilioPhone) {
      log.warn({ callId: call.id }, 'Twilio not configured - call simulated');

      // In development, simulate the call
      if (process.env.NODE_ENV === 'development') {
        await updateCallStatus(call.id, 'completed', {
          completedAt: new Date().toISOString(),
          outcome: 'simulated_dev',
        });
        return { success: true, callId: call.id, status: 'answered' };
      }

      return { success: false, callId: call.id, error: 'Twilio not configured' };
    }

    // Create Twilio call with TwiML that:
    // 1. Speaks the SSML message
    // 2. Optionally waits for response
    // 3. Handles voicemail detection
    const twilio = await import('twilio');
    const client = twilio.default(twilioSid, twilioToken);

    // Build TwiML
    const twiml = buildCallTwiML(call, options);

    // Create the call
    const twilioCall = await client.calls.create({
      to: call.phoneNumber,
      from: twilioPhone,
      twiml,
      machineDetection: options.voicemailFallback ? 'DetectMessageEnd' : 'Enable',
      machineDetectionTimeout: 3,
      timeout: 30, // Ring for 30 seconds max
      statusCallback: `${process.env.APP_URL || 'https://app.ferni.ai'}/api/outreach/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    // Update with Twilio SID
    await updateCallStatus(call.id, 'in_progress', {
      twilioSid: twilioCall.sid,
    });

    log.info(
      { userId: call.userId, callId: call.id, twilioSid: twilioCall.sid },
      'Outbound call initiated'
    );

    return { success: true, callId: call.id, status: 'initiated' };
  } catch (error) {
    log.error({ error: String(error), callId: call.id }, 'Failed to initiate call');

    // Update attempt count
    const attempts = call.attempts + 1;
    if (attempts < call.maxAttempts) {
      await updateCallStatus(call.id, 'pending', { attempts });
    } else {
      await updateCallStatus(call.id, 'failed', {
        attempts,
        completedAt: new Date().toISOString(),
        outcome: 'max_attempts_reached',
      });
    }

    return { success: false, callId: call.id, error: String(error) };
  }
}

/**
 * Build TwiML for the outbound call
 */
function buildCallTwiML(
  call: ScheduledCall,
  options: { enableConversation: boolean; voicemailFallback: boolean }
): string {
  // Use Cartesia for natural TTS
  // Note: In production, this would integrate with LiveKit for the actual voice synthesis
  // For now, we use Twilio's <Say> with SSML

  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

  // Greeting with natural pause
  twiml += '<Pause length="1"/>';

  // Speak the message
  // Convert our SSML to Twilio's SSML format
  const twilioSsml = convertToTwilioSSML(call.ssml);
  twiml += `<Say voice="Polly.Joanna">${twilioSsml}</Say>`;

  if (options.enableConversation) {
    // Allow user to respond
    twiml += '<Gather input="speech" timeout="5" action="/api/outreach/call-response">';
    twiml += '<Say voice="Polly.Joanna">Is there anything you would like to share?</Say>';
    twiml += '</Gather>';
  }

  // Closing
  twiml += '<Pause length="1"/>';
  twiml += '<Say voice="Polly.Joanna">Take care. Talk soon.</Say>';
  twiml += '</Response>';

  return twiml;
}

// ============================================================================
// CALL STATUS WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Twilio status callback
 */
export async function handleCallStatusUpdate(update: CallStatusUpdate): Promise<void> {
  const { CallSid, CallStatus, CallDuration, AnsweredBy } = update;

  log.info(
    { twilioSid: CallSid, status: CallStatus, answeredBy: AnsweredBy },
    'Call status update'
  );

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    // Find the call by Twilio SID
    const snapshot = await db
      .collectionGroup('scheduled_calls')
      .where('twilioSid', '==', CallSid)
      .limit(1)
      .get();

    if (snapshot.empty) {
      log.warn({ twilioSid: CallSid }, 'Call not found for status update');
      return;
    }

    const callDoc = snapshot.docs[0];
    const call = callDoc.data() as ScheduledCall;

    // Map Twilio status to our status
    let newStatus: ScheduledCall['status'] = call.status;
    let outcome: string | undefined;

    switch (CallStatus) {
      case 'completed':
        newStatus = 'completed';
        outcome = AnsweredBy === 'human' ? 'answered' : `voicemail_${AnsweredBy}`;
        break;
      case 'busy':
      case 'no-answer':
      case 'failed':
        // Check if we should retry
        if (call.attempts < call.maxAttempts) {
          newStatus = 'pending';
          outcome = CallStatus;
        } else {
          newStatus = 'failed';
          outcome = CallStatus;
        }
        break;
    }

    await callDoc.ref.update(
      cleanForFirestore({
        status: newStatus,
        outcome,
        duration: CallDuration ? parseInt(CallDuration, 10) : undefined,
        answeredBy: AnsweredBy,
        completedAt: CallStatus === 'completed' ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      })
    );

    log.info({ callId: call.id, newStatus, outcome }, 'Call status updated');
  } catch (error) {
    log.error({ error: String(error), twilioSid: CallSid }, 'Failed to handle call status update');
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// (Legacy API surface for existing code)
// ============================================================================

let serviceInstance: ConversationalCallService | null = null;

/**
 * Get the conversational call service instance
 * @deprecated Use conversationalCalls.scheduleProactiveCall directly
 */
// In-memory store for active calls (for development/testing)
const activeCalls = new Map<string, CallResult>();

export function getConversationalCallService(): ConversationalCallService {
  if (!serviceInstance) {
    serviceInstance = {
      isConfigured: isConversationalCallsConfigured,
      makeCall: async (ctx: OutboundCallContext): Promise<CallResult> => {
        // Extract values with fallbacks
        const userId = ctx.userId || ctx.user?.id || '';
        const phoneNumber = ctx.phoneNumber || ctx.user?.phone || '';
        const message = ctx.message || ctx.approach?.primaryGoal || '';

        if (!userId || !phoneNumber || !message) {
          return {
            success: false,
            error: 'Missing required fields: userId, phoneNumber, or message',
          };
        }

        return scheduleProactiveCall({
          userId,
          phoneNumber,
          message,
          ssml: ctx.ssml || `<speak>${message}</speak>`,
          personaId: ctx.personaId || ctx.persona || 'ferni',
          reason: ctx.reason || ctx.trigger?.reason || 'outbound_call',
          maxDuration: ctx.maxDuration || ctx.approach?.maxDuration,
        });
      },
      scheduleCall: scheduleProactiveCall,

      // Extended methods
      getActiveCall: async (callId: string): Promise<CallResult | null> => {
        return activeCalls.get(callId) ?? null;
      },

      getActiveCalls: async (): Promise<CallResult[]> => {
        return Array.from(activeCalls.values());
      },

      endCall: async (callId: string, _reason?: string): Promise<void> => {
        const call = activeCalls.get(callId);
        if (call) {
          call.status = 'failed';
          call.completedAt = new Date().toISOString();
          activeCalls.delete(callId);
        }
      },

      updateCallSummary: async (callId: string, summary: CallSummaryUpdate): Promise<void> => {
        const call = activeCalls.get(callId);
        if (call) {
          call.conversationSummary = summary.conversationSummary;
          call.followUpActions = summary.followUpActions;
        }
      },

      handleStatusCallback: async (
        callId: string,
        status: string,
        _data?: StatusCallbackData
      ): Promise<void> => {
        const call = activeCalls.get(callId);
        if (call) {
          call.status = status as CallResult['status'];
          if (status === 'answered') {
            call.answeredAt = new Date().toISOString();
          } else if (status === 'failed' || status === 'no_answer') {
            call.completedAt = new Date().toISOString();
          }
        }
      },

      handleMachineDetection: async (
        _callId: string,
        answeredBy?: string
      ): Promise<string | void> => {
        if (answeredBy && answeredBy !== 'human') {
          // Return TwiML for voicemail
          return `<Response><Say>Hi, this is Ferni leaving a quick message. Talk to you soon!</Say></Response>`;
        }
        return undefined;
      },
    };
  }
  return serviceInstance;
}

/**
 * Check if conversational calls are configured
 */
export function isConversationalCallsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Make a conversational call (legacy API)
 * @deprecated Use conversationalCalls.scheduleProactiveCall directly
 */
export async function makeConversationalCall(context: OutboundCallContext): Promise<CallResult> {
  // Extract values with fallbacks
  const userId = context.userId || context.user?.id || '';
  const phoneNumber = context.phoneNumber || context.user?.phone || '';
  const message = context.message || context.approach?.primaryGoal || '';

  if (!userId || !phoneNumber || !message) {
    return { success: false, error: 'Missing required fields: userId, phoneNumber, or message' };
  }

  // Two-way conversation (voice agent + LiveKit SIP) whenever the SIP trunk is
  // configured; the TTS-only call below is just the fallback.
  const { isTwoWayCallingConfigured, placeCallToContact } = await import('./place-call.js');
  if (isTwoWayCallingConfigured()) {
    const result = await placeCallToContact({
      userId,
      userName: context.user?.preferredName || context.user?.name,
      contact: {
        name: context.user?.preferredName || context.user?.name || 'there',
        phone: phoneNumber,
      },
      purpose: message,
      personaId: context.personaId || context.persona,
    });
    return {
      success: result.success,
      id: result.callId,
      callId: result.callId,
      status: result.success ? 'initiating' : 'failed',
      error: result.error,
    } as CallResult;
  }

  return scheduleProactiveCall({
    userId,
    phoneNumber,
    message,
    ssml: context.ssml || `<speak>${message}</speak>`,
    personaId: context.personaId || context.persona || 'ferni',
    reason: context.reason || context.trigger?.reason || 'outbound_call',
    maxDuration: context.maxDuration || context.approach?.maxDuration,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const conversationalCalls = {
  scheduleProactiveCall,
  handleCallStatusUpdate,
  enhanceSSMLForCall,
  isConfigured: isConversationalCallsConfigured,
  makeCall: makeConversationalCall,
};

export default conversationalCalls;
