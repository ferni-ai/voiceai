// @ts-nocheck - WIP: APIs need updating to current architecture
/**
 * On-Behalf Call Agent
 *
 * A specialized voice agent for making outbound calls ON BEHALF of users.
 * This agent calls doctors, restaurants, businesses, etc. and handles
 * the conversation autonomously.
 *
 * Key differences from inbound agent:
 * - No user greeting - WE initiate by calling a business/contact
 * - Uses a script from metadata
 * - Waits for Twilio participant to connect (phone callee)
 * - Reports results back to the original session
 *
 * @module agents/outbound/on-behalf-call-agent
 */

import type { JobContext } from '@livekit/agents';
import * as voice from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { Modality } from '@google/genai';
import { getLogger } from '../../utils/safe-logger.js';
import { createCartesiaTTS } from '../../speech/tts/cartesia-core.js';
import { getVoiceId } from '../../personas/voice-registry.js';

const log = getLogger().child({ module: 'on-behalf-call-agent' });

// ============================================================================
// TYPES
// ============================================================================

export interface OnBehalfCallMetadata {
  type: 'on_behalf_call';
  callId: string;
  originalSessionId: string;
  userId: string;
  userName: string;
  contact: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  purpose: string;
  objective: string;
  callType: 'business' | 'personal' | 'emergency';
  script: string;
  userPreferences?: {
    preferredTimes?: string[];
    additionalContext?: string;
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run the on-behalf call agent.
 *
 * This agent:
 * 1. Connects to the LiveKit room
 * 2. Waits for the phone callee to join (via Twilio SIP bridge)
 * 3. Uses the provided script to handle the conversation
 * 4. Reports results back via the orchestrator
 */
export async function runOnBehalfCallAgent(
  ctx: JobContext,
  rawMetadata: Record<string, unknown>
): Promise<void> {
  const metadata = rawMetadata as unknown as OnBehalfCallMetadata;
  const { callId, contact, purpose, script, userName } = metadata;

  log.info({ callId, contactName: contact?.name, purpose }, '📞 Starting on-behalf call agent');
  process.stderr.write(`[on-behalf-agent] ========================================\n`);
  process.stderr.write(`[on-behalf-agent] 📞 ON-BEHALF CALL AGENT STARTING\n`);
  process.stderr.write(`[on-behalf-agent] Call ID: ${callId}\n`);
  process.stderr.write(`[on-behalf-agent] Contact: ${contact?.name || 'Unknown'}\n`);
  process.stderr.write(`[on-behalf-agent] Purpose: ${purpose}\n`);
  process.stderr.write(`[on-behalf-agent] ========================================\n`);

  // =========================================================================
  // STEP 1: CONNECT TO ROOM
  // =========================================================================
  process.stderr.write(`[on-behalf-agent] Connecting to room ${ctx.room?.name}...\n`);

  try {
    await ctx.connect();
    process.stderr.write(`[on-behalf-agent] ✅ Connected to room ${ctx.room.name}\n`);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to connect to room');
    process.stderr.write(`[on-behalf-agent] ❌ Failed to connect to room: ${error}\n`);
    throw error;
  }

  // =========================================================================
  // STEP 2: SET UP TTS & LLM
  // =========================================================================
  process.stderr.write(`[on-behalf-agent] Setting up TTS and LLM...\n`);

  // Get Ferni's voice ID for TTS
  const voiceId = getVoiceId('ferni');
  process.stderr.write(`[on-behalf-agent] Using voice ID: ${voiceId}\n`);

  const tts = createCartesiaTTS(voiceId);

  // Build the system prompt for the outbound call
  const systemPrompt = buildOutboundSystemPrompt({
    script: script || 'No script provided - have a natural conversation.',
    contactName: contact?.name || 'the person',
    userName,
    purpose,
    callType: metadata.callType,
  });

  process.stderr.write(`[on-behalf-agent] System prompt length: ${systemPrompt.length} chars\n`);

  // Set up LLM using Gemini Live (same as main agent)
  const llm = new google.beta.realtime.RealtimeModel({
    model: 'gemini-2.0-flash-live-001',
    modalities: [Modality.TEXT], // Text mode - we handle audio via Cartesia
    temperature: 0.7,
    instructions: systemPrompt,
    inputAudioTranscription: {},
  });

  process.stderr.write(`[on-behalf-agent] LLM and TTS configured\n`);

  // =========================================================================
  // STEP 3: WAIT FOR PHONE PARTICIPANT (TWILIO)
  // =========================================================================
  process.stderr.write(`[on-behalf-agent] Waiting for phone participant to join...\n`);

  // Give Twilio time to bridge the call
  const phoneParticipant = await waitForPhoneParticipant(ctx, 60000); // 60 second timeout

  if (!phoneParticipant) {
    log.warn({ callId }, 'Phone participant never joined - call may have failed');
    process.stderr.write(`[on-behalf-agent] ⚠️ No phone participant joined (60s timeout)\n`);
    await reportCallResult(metadata, 'no_answer', 'The call was not answered.');
    return;
  }

  process.stderr.write(
    `[on-behalf-agent] ✅ Phone participant connected: ${phoneParticipant.identity}\n`
  );
  log.info({ callId, participantId: phoneParticipant.identity }, '📞 Phone participant connected!');

  // =========================================================================
  // STEP 4: CREATE AND START AGENT SESSION
  // =========================================================================
  process.stderr.write(`[on-behalf-agent] Creating agent session...\n`);

  const session = new voice.AgentSession({
    // Use realtime_llm for turn detection (same as main agent)
    turnDetection: 'realtime_llm',
    llm,
    tts,
    // Voice options for natural conversation
    minEndpointingDelay: 300,
    maxEndpointingDelay: 800,
  });

  process.stderr.write(`[on-behalf-agent] Starting agent session...\n`);

  // Create an agent identity for this outbound call
  const agent = {
    name: 'Ferni',
    metadata: JSON.stringify({
      type: 'on_behalf_caller',
      callId,
      contactName: contact?.name,
    }),
  };

  // Try to enable telephony noise cancellation for phone calls
  let inputOptions: { noiseCancellation?: unknown } | undefined;
  try {
    const noiseCancellation = await import('@livekit/noise-cancellation-node');
    inputOptions = {
      noiseCancellation: noiseCancellation.TelephonyBackgroundVoiceCancellation(),
    };
    process.stderr.write(`[on-behalf-agent] 🔇 Telephony noise cancellation enabled\n`);
  } catch {
    process.stderr.write(`[on-behalf-agent] ⚠️ Noise cancellation not available\n`);
  }

  // Start the session
  await session.start({
    agent,
    room: ctx.room,
    inputOptions,
  });

  process.stderr.write(`[on-behalf-agent] ✅ Agent session started\n`);

  // =========================================================================
  // STEP 5: INITIATE THE CONVERSATION
  // =========================================================================
  // CRITICAL: We need to SPEAK FIRST since we're the caller!
  process.stderr.write(`[on-behalf-agent] 🎤 Speaking opening greeting...\n`);

  const greeting = buildOpeningGreeting(contact?.name || 'there', userName, purpose);
  process.stderr.write(`[on-behalf-agent] Greeting: "${greeting}"\n`);

  try {
    // Use session.say() to speak the greeting
    await session.say(greeting, { allowInterruptions: true });
    process.stderr.write(`[on-behalf-agent] ✅ Greeting spoken\n`);
  } catch (error) {
    process.stderr.write(`[on-behalf-agent] ❌ Failed to speak greeting: ${error}\n`);
    log.error({ error: String(error), callId }, 'Failed to speak greeting');
  }

  // =========================================================================
  // STEP 6: MONITOR UNTIL CALL ENDS
  // =========================================================================
  process.stderr.write(`[on-behalf-agent] Monitoring call... (LLM handles conversation)\n`);

  // Wait for the call to end (participant disconnects or room closes)
  await waitForCallEnd(ctx, phoneParticipant.identity);

  log.info({ callId }, '📞 Call ended');
  process.stderr.write(`[on-behalf-agent] 📞 Call ended\n`);

  // =========================================================================
  // STEP 7: REPORT RESULTS
  // =========================================================================
  // TODO: Parse transcript and extract results
  const outcome = 'Call completed - check transcript for details';
  await reportCallResult(metadata, 'completed', outcome);

  process.stderr.write(`[on-behalf-agent] ✅ On-behalf call agent finished\n`);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build the opening greeting for the call
 */
function buildOpeningGreeting(contactName: string, userName: string, purpose: string): string {
  // Keep it short and natural
  return `Hi${contactName !== 'there' ? ` ${contactName}` : ''}, this is Ferni calling on behalf of ${userName}. ${purpose}`;
}

interface PhoneParticipant {
  identity: string;
  name?: string;
}

/**
 * Wait for a phone participant to join the room
 */
async function waitForPhoneParticipant(
  ctx: JobContext,
  timeoutMs: number
): Promise<PhoneParticipant | null> {
  // Use ctx.waitForParticipant() with timeout race
  return Promise.race([
    (async (): Promise<PhoneParticipant | null> => {
      // First check if already there
      for (const participant of ctx.room.remoteParticipants.values()) {
        if (isPhoneParticipant(participant.identity)) {
          return { identity: participant.identity, name: participant.name };
        }
      }

      // Wait for next participant
      const participant = await ctx.waitForParticipant();
      if (participant && isPhoneParticipant(participant.identity)) {
        return { identity: participant.identity, name: participant.name };
      }
      return null;
    })(),
    new Promise<null>((resolve) => {
      setTimeout(() => {
        process.stderr.write(`[on-behalf-agent] Phone participant wait timed out\n`);
        resolve(null);
      }, timeoutMs);
    }),
  ]);
}

/**
 * Check if a participant is a phone participant (from Twilio/SIP)
 */
function isPhoneParticipant(identity: string): boolean {
  // Twilio SIP participants have identities like:
  // - phone_+18001234567
  // - sip_+18001234567
  // - +18001234567
  return identity.startsWith('phone_') || identity.startsWith('sip_') || identity.startsWith('+1');
}

/**
 * Wait for the call to end
 */
async function waitForCallEnd(ctx: JobContext, phoneIdentity: string): Promise<void> {
  return new Promise((resolve) => {
    // Check if already disconnected
    if (!ctx.room.isConnected) {
      resolve();
      return;
    }

    const checkParticipant = () => {
      const participant = ctx.room.remoteParticipants.get(phoneIdentity);
      if (!participant) {
        resolve();
      }
    };

    // Watch for participant disconnect
    const disconnectHandler = (participant: { identity: string }) => {
      if (participant.identity === phoneIdentity) {
        ctx.room.off('participantDisconnected', disconnectHandler);
        resolve();
      }
    };
    ctx.room.on('participantDisconnected', disconnectHandler);

    // Also watch for room disconnect
    const roomDisconnectHandler = () => {
      ctx.room.off('disconnected', roomDisconnectHandler);
      resolve();
    };
    ctx.room.on('disconnected', roomDisconnectHandler);

    // Check periodically in case we miss events
    const interval = setInterval(() => {
      checkParticipant();
      if (!ctx.room.isConnected) {
        clearInterval(interval);
        resolve();
      }
    }, 5000);
  });
}

/**
 * Build the system prompt for outbound calls
 */
function buildOutboundSystemPrompt(params: {
  script: string;
  contactName: string;
  userName: string;
  purpose: string;
  callType: string;
}): string {
  const { script, contactName, userName, purpose, callType } = params;

  return `# Outbound Call Agent

You are Ferni, an AI assistant making a phone call on behalf of ${userName}.

## IMPORTANT CONTEXT
- You are CALLING ${contactName}
- Purpose: ${purpose}
- Call type: ${callType}
- You represent ${userName} - speak on their behalf professionally and warmly

## YOUR OPENING
The greeting has already been spoken. Now continue the conversation naturally.

## CALL SCRIPT
${script}

## BEHAVIOR GUIDELINES
1. Be warm, professional, and efficient
2. Listen carefully to the person on the other end
3. Ask clarifying questions if needed
4. Confirm any important details (dates, times, names)
5. Thank them for their time before ending the call
6. If you reach voicemail, leave a brief, clear message

## DO NOT
- Give out sensitive personal information beyond what's needed
- Make commitments ${userName} hasn't authorized
- Be pushy or aggressive
- Stay on the call unnecessarily long

## ENDING THE CALL
When the business/purpose is complete:
1. Summarize what was accomplished or next steps
2. Thank them for their help
3. Say goodbye politely

Remember: You're making ${userName}'s life easier by handling this call for them!`;
}

/**
 * Report the call result back to the orchestrator
 */
async function reportCallResult(
  metadata: OnBehalfCallMetadata,
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed',
  outcome: string
): Promise<void> {
  const { callId, originalSessionId } = metadata;

  log.info({ callId, status, outcome: outcome.slice(0, 100) }, 'Reporting call result');

  try {
    // Import the result capture service
    const { captureCallResult } = await import('../../services/outreach/call-result-capture.js');

    await captureCallResult(
      callId,
      {
        callId,
        status,
        objectiveAchieved: status === 'completed',
        outcome,
        callbackRequired: status === 'no_answer' || status === 'busy',
      },
      {
        originalSessionId,
        userId: metadata.userId,
        userName: metadata.userName,
        contactQuery: metadata.contact?.name || 'contact',
        purpose: metadata.purpose,
        objective: metadata.objective as
          | 'schedule'
          | 'reschedule'
          | 'cancel'
          | 'inquiry'
          | 'general',
        callType: metadata.callType,
        userTimezone: 'America/Los_Angeles', // TODO: Get from user profile
        recordingConsent: true,
      }
    );

    log.info({ callId }, '✅ Call result reported');
  } catch (error) {
    log.error({ error: String(error), callId }, 'Failed to report call result');
  }
}
