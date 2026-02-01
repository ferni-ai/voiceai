/**
 * Family Check-in Caller Service
 *
 * Bridges family check-in schedules to the outbound calling infrastructure.
 * This service:
 * 1. Gets due schedules from proactive-family-checkin
 * 2. Builds context using family-wellbeing-context
 * 3. Initiates calls via the on-behalf-call-orchestrator or conversational-calls
 *
 * @module services/family/family-checkin-caller
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDueSchedules,
  getCheckinSchedule,
  getRecentCallRecords,
  createCallRecord,
  completeCallRecord,
  type FamilyCheckinSchedule,
  type CheckinCallRecord,
  type CheckinCallStatus,
} from './proactive-family-checkin.js';
import { analyzeCheckinCall, generateUrgentNotification } from './family-checkin-summary.js';
import { getSponsoredIdentity } from '../identity/sponsored-identity.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'FamilyCheckinCaller' });

// ============================================================================
// TYPES
// ============================================================================

export interface FamilyCheckinJobResult {
  success: boolean;
  totalDue: number;
  schedulesProcessed: number;
  callsInitiated: number;
  callsSucceeded: number;
  callsFailed: number;
  callsSkipped: number;
  errors: string[];
  durationMs: number;
}

export interface SingleCallResult {
  success: boolean;
  callId?: string;
  status?: CheckinCallStatus;
  error?: string;
}

// ============================================================================
// MAIN JOB RUNNER
// ============================================================================

/**
 * Process all due family check-in schedules
 * Called by Cloud Scheduler via /api/jobs/family-checkin-calls
 */
export async function runFamilyCheckinJob(): Promise<FamilyCheckinJobResult> {
  const startTime = Date.now();
  const result: FamilyCheckinJobResult = {
    success: true,
    totalDue: 0,
    schedulesProcessed: 0,
    callsInitiated: 0,
    callsSucceeded: 0,
    callsFailed: 0,
    callsSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    log.info('📞 Starting family check-in job');

    // Get all schedules that are due
    const dueSchedules = await getDueSchedules();
    result.totalDue = dueSchedules.length;
    log.info({ count: dueSchedules.length }, 'Found due schedules');

    if (dueSchedules.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Process each schedule
    for (const schedule of dueSchedules) {
      result.schedulesProcessed++;

      try {
        const callResult = await initiateCheckinCall(schedule);

        if (callResult.success) {
          result.callsInitiated++;
          result.callsSucceeded++;
          log.info(
            {
              scheduleId: schedule.id,
              familyMember: schedule.familyMemberName,
              callId: callResult.callId,
            },
            '✅ Check-in call initiated'
          );
        } else {
          result.callsFailed++;
          result.errors.push(`${schedule.familyMemberName}: ${callResult.error}`);
          log.warn(
            {
              scheduleId: schedule.id,
              familyMember: schedule.familyMemberName,
              error: callResult.error,
            },
            '❌ Check-in call failed'
          );
        }
      } catch (error) {
        result.callsFailed++;
        result.errors.push(`${schedule.familyMemberName}: ${String(error)}`);
        log.error(
          { scheduleId: schedule.id, error: String(error) },
          'Exception processing schedule'
        );
      }

      // Small delay between calls to avoid rate limiting
      await sleep(500);
    }

    result.durationMs = Date.now() - startTime;
    result.success = result.callsFailed === 0;

    log.info(
      {
        processed: result.schedulesProcessed,
        initiated: result.callsInitiated,
        failed: result.callsFailed,
        durationMs: result.durationMs,
      },
      '📞 Family check-in job completed'
    );

    return result;
  } catch (error) {
    result.success = false;
    result.errors.push(String(error));
    result.durationMs = Date.now() - startTime;
    log.error({ error: String(error) }, 'Family check-in job failed');
    return result;
  }
}

// ============================================================================
// SINGLE CALL INITIATION
// ============================================================================

/**
 * Initiate a single family check-in call
 */
export async function initiateCheckinCall(
  schedule: FamilyCheckinSchedule
): Promise<SingleCallResult> {
  try {
    // 1. Get the sponsored identity
    const identity = await getSponsoredIdentity(schedule.sponsoredIdentityId);

    if (!identity) {
      return { success: false, error: 'Sponsored identity not found' };
    }

    // Verify sponsor ownership
    if (identity.sponsorUserId !== schedule.sponsorUserId) {
      return { success: false, error: 'Sponsor mismatch' };
    }

    // 2. Get recent call records for context
    const recentCalls = await getRecentCallRecords(schedule.sponsorUserId, schedule.id, 5);

    // 3. Get sponsor name from profile
    const sponsorName = await getSponsorName(schedule.sponsorUserId);

    // 4. Build the check-in context
    const { buildFamilyCheckinContext, generateFamilyCheckinSystemPrompt } =
      await import('../../intelligence/context-builders/family/family-wellbeing-context.js');

    const context = await buildFamilyCheckinContext(schedule, identity, recentCalls);

    // 5. Generate the system prompt for the agent
    const systemPrompt = generateFamilyCheckinSystemPrompt(context);

    // 6. Create a call record
    const callRecord = await createCallRecord(schedule);

    // 7. Initiate the call via LiveKit SIP or Twilio
    const callResult = await initiateOutboundCall({
      callId: callRecord.id,
      schedule,
      identity,
      context,
      systemPrompt,
      openingLine: context.openingLine,
    });

    if (!callResult.success) {
      // Update call record as failed
      await completeCallRecord(schedule.sponsorUserId, callRecord.id, {
        status: 'failed',
        errorMessage: callResult.error,
      });

      return { success: false, callId: callRecord.id, error: callResult.error };
    }

    return {
      success: true,
      callId: callRecord.id,
      status: 'in_progress',
    };
  } catch (error) {
    log.error(
      { scheduleId: schedule.id, error: String(error) },
      'Failed to initiate check-in call'
    );
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// OUTBOUND CALL INITIATION
// ============================================================================

interface InitiateOutboundCallParams {
  callId: string;
  schedule: FamilyCheckinSchedule;
  identity: Awaited<ReturnType<typeof getSponsoredIdentity>>;
  context: Awaited<
    ReturnType<
      typeof import('../../intelligence/context-builders/family/family-wellbeing-context.js').buildFamilyCheckinContext
    >
  >;
  systemPrompt: string;
  openingLine: string;
}

async function initiateOutboundCall(
  params: InitiateOutboundCallParams
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  const { callId, schedule, identity, context, systemPrompt, openingLine } = params;

  try {
    // Check if we have the necessary infrastructure
    const hasSipTrunk = !!process.env.SIP_TRUNK_ID;
    const hasTwilio = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );

    if (!hasSipTrunk && !hasTwilio) {
      log.warn({ callId }, 'No outbound calling infrastructure configured');

      // In development, simulate the call
      if (process.env.NODE_ENV === 'development') {
        log.info({ callId }, '🧪 Simulating call in development mode');
        return { success: true, twilioSid: `sim_${callId}` };
      }

      return { success: false, error: 'Outbound calling not configured' };
    }

    // Prefer LiveKit SIP if available (better for conversational calls)
    if (hasSipTrunk) {
      return await initiateViaLiveKitSip(params);
    }

    // Fallback to Twilio direct call
    return await initiateViaTwilio(params);
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Failed to initiate outbound call');
    return { success: false, error: String(error) };
  }
}

/**
 * Initiate call via LiveKit SIP (preferred for conversational calls)
 */
async function initiateViaLiveKitSip(
  params: InitiateOutboundCallParams
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  const { callId, schedule, identity, systemPrompt, openingLine } = params;

  try {
    const { RoomServiceClient, SipClient } = await import('livekit-server-sdk');

    const livekitUrl = process.env.LIVEKIT_URL!;
    const livekitApiKey = process.env.LIVEKIT_API_KEY!;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET!;
    const sipTrunkId = process.env.SIP_TRUNK_ID!;

    // 1. Create a LiveKit room for this call
    const roomName = `family-checkin-${callId}`;
    const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 2, // Agent + phone participant
      metadata: JSON.stringify({
        type: 'family_checkin',
        callId,
        scheduleId: schedule.id,
        sponsorUserId: schedule.sponsorUserId,
        familyMemberName: schedule.familyMemberName,
        relationship: schedule.relationship,
        systemPrompt: systemPrompt.slice(0, 1000), // Truncate for metadata size
        openingLine,
      }),
    });

    // 2. Dispatch the family check-in agent to the room
    const { AgentDispatchClient } = await import('livekit-server-sdk');
    const agentDispatch = new AgentDispatchClient(livekitUrl, livekitApiKey, livekitApiSecret);
    const agentName = process.env.AGENT_NAME || 'voice-agent';

    await agentDispatch.createDispatch(roomName, agentName, {
      metadata: JSON.stringify({
        type: 'family_checkin',
        callId,
        familyMemberName: schedule.familyMemberName,
        relationship: schedule.relationship,
        systemPrompt,
        openingLine,
        maxDurationMinutes: schedule.maxDurationMinutes,
      }),
    });

    // 3. Initiate the SIP call to the family member's phone
    const sipClient = new SipClient(livekitUrl, livekitApiKey, livekitApiSecret);

    // Normalize phone number to E.164
    const cleanPhone = schedule.phoneNumber.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    const sipParticipant = await sipClient.createSipParticipant(sipTrunkId, e164Phone, roomName, {
      participantIdentity: `phone_${callId}`,
      participantName: schedule.familyMemberName,
      playDialtone: false, // Agent should speak first
      hidePhoneNumber: false,
    });

    log.info(
      {
        callId,
        roomName,
        sipParticipantId: sipParticipant.participantId,
        familyMember: schedule.familyMemberName,
      },
      '📞 Family check-in call initiated via LiveKit SIP'
    );

    return { success: true, twilioSid: sipParticipant.participantId };
  } catch (error) {
    log.error({ callId, error: String(error) }, 'LiveKit SIP call failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Initiate call via Twilio (fallback for TTS-only calls)
 */
async function initiateViaTwilio(
  params: InitiateOutboundCallParams
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  const { callId, schedule, openingLine } = params;

  try {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN!;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER!;
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_URL || '';

    // Build TwiML for the call
    // Note: This is a simplified version - real implementation would use a webhook
    // to enable two-way conversation
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">${escapeXml(openingLine)}</Say>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">How are you doing today?</Say>
  <Gather input="speech" timeout="5" action="${webhookBaseUrl}/api/family-checkin/response/${callId}">
    <Say voice="Polly.Joanna">Take your time.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I'll let ${schedule.familyMemberName} know I called. Take care!</Say>
</Response>`;

    // Normalize phone number
    const cleanPhone = schedule.phoneNumber.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    // Make the Twilio call
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: e164Phone,
          From: twilioPhone,
          Twiml: twiml,
          StatusCallback: `${webhookBaseUrl}/api/family-checkin/status/${callId}`,
          StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
          MachineDetection: schedule.leaveVoicemailIfNoAnswer ? 'DetectMessageEnd' : 'Enable',
          MachineDetectionTimeout: '5',
          Timeout: '30',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Twilio error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { sid: string };

    log.info(
      {
        callId,
        twilioSid: data.sid,
        familyMember: schedule.familyMemberName,
      },
      '📞 Family check-in call initiated via Twilio'
    );

    return { success: true, twilioSid: data.sid };
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Twilio call failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// CALL COMPLETION HANDLER
// ============================================================================

/**
 * Handle completion of a family check-in call
 * Called by the voice agent when the call ends
 */
export async function handleCheckinCallComplete(
  callId: string,
  sponsorUserId: string,
  result: {
    status: CheckinCallStatus;
    durationSeconds?: number;
    transcript?: Array<{ role: string; content: string }>;
    familyMemberName: string;
    relationship: string;
  }
): Promise<void> {
  try {
    log.info({ callId, status: result.status }, 'Processing check-in call completion');

    // Analyze the transcript if we have one
    let analysis: Awaited<ReturnType<typeof analyzeCheckinCall>> | undefined;

    if (result.transcript && result.transcript.length > 0) {
      // Convert transcript format
      const formattedTranscript = result.transcript.map((t) => ({
        role: t.role === 'assistant' ? ('ferni' as const) : ('family_member' as const),
        content: t.content,
      }));

      // Get sponsor name for analysis
      const sponsorName = await getSponsorName(sponsorUserId);

      analysis = await analyzeCheckinCall(
        formattedTranscript,
        result.familyMemberName,
        sponsorName,
        result.relationship
      );
    }

    // Update the call record
    await completeCallRecord(sponsorUserId, callId, {
      status: result.status,
      durationSeconds: result.durationSeconds,
      detectedMood: analysis?.mood,
      moodConfidence: analysis?.moodConfidence,
      conversationSummary: analysis?.summary,
      topicsDiscussed: analysis?.topics,
      concernsIdentified: analysis?.concerns,
      positiveHighlights: analysis?.positives,
      followUpItems: analysis?.followUps,
      transcript: JSON.stringify(result.transcript),
    });

    // Check if we need to send urgent notification
    if (analysis?.concerns) {
      const record: CheckinCallRecord = {
        id: callId,
        scheduleId: '', // Will be filled from DB
        sponsorUserId,
        sponsoredIdentityId: '',
        familyMemberName: result.familyMemberName,
        callStartedAt: new Date().toISOString(),
        callEndedAt: new Date().toISOString(),
        status: result.status,
        concernsIdentified: analysis.concerns,
        sponsorBriefed: false,
      };

      const urgentNotification = generateUrgentNotification(record);

      if (urgentNotification) {
        await sendUrgentNotificationToSponsor(sponsorUserId, urgentNotification, callId);
      }
    }

    log.info(
      {
        callId,
        mood: analysis?.mood,
        hasConcerns: (analysis?.concerns?.length ?? 0) > 0,
      },
      '✅ Check-in call processing complete'
    );
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Failed to process call completion');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getSponsorName(userId: string): Promise<string> {
  try {
    const db = getFirestoreDb();
    if (!db) return 'your family member';

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return 'your family member';

    const data = doc.data();
    return data?.displayName || data?.name || 'your family member';
  } catch {
    return 'your family member';
  }
}

async function sendUrgentNotificationToSponsor(
  sponsorUserId: string,
  message: string,
  callId: string
): Promise<void> {
  try {
    log.info({ sponsorUserId, callId }, '🚨 Sending urgent notification to sponsor');

    // Try push notification first
    const { getOutreachOrchestrator } = await import('../outreach/outreach-orchestrator.js');
    const orchestrator = getOutreachOrchestrator();

    const sent = await orchestrator.sendPushNotification(sponsorUserId, message, {
      trigger: 'family_checkin_urgent',
      personaId: 'ferni',
      metadata: { callId },
    });

    if (sent) {
      log.info({ sponsorUserId }, '✅ Urgent push notification sent');
      return;
    }

    // Fallback to SMS if push failed
    const db = getFirestoreDb();
    if (!db) return;

    const userDoc = await db.collection('bogle_users').doc(sponsorUserId).get();
    const phoneNumber = userDoc.data()?.phoneNumber;

    if (phoneNumber) {
      const { sendSMS } = await import('../outreach/delivery/sms-delivery.js');
      await sendSMS({
        to: phoneNumber,
        body: message,
        userId: sponsorUserId,
        personaId: 'ferni',
        outreachId: `family_checkin_urgent_${callId}`,
      });
      log.info({ sponsorUserId }, '✅ Urgent SMS notification sent');
    }
  } catch (error) {
    log.error({ sponsorUserId, error: String(error) }, 'Failed to send urgent notification');
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const familyCheckinCaller = {
  runJob: runFamilyCheckinJob,
  initiateCall: initiateCheckinCall,
  handleComplete: handleCheckinCallComplete,
};

export default familyCheckinCaller;
