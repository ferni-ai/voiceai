/**
 * Place a two-way phone call to one of the user's contacts ("call my mom").
 *
 * Single entry point for the API (/api/outbound-call/initiate, `ferni calls`)
 * and tools. Goes through the on-behalf orchestrator: LiveKit room + voice
 * agent dispatch (with persona) + LiveKit SIP dial-out, so the person who
 * answers talks with Ferni. Without SIP_TRUNK_ID it degrades to a one-way
 * spoken message, and says so (`mode: 'message_only'`).
 */
import type { CallObjective, CallType } from '../../tools/domains/telephony/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getOnBehalfCallOrchestrator } from './on-behalf-call-orchestrator.js';

const log = getLogger().child({ service: 'place-call' });

export interface PlaceCallInput {
  userId: string;
  userName?: string;
  contact: { id?: string; name: string; phone: string; relationship?: string };
  purpose: string;
  personaId?: string;
  callType?: CallType;
  objective?: CallObjective;
  userTimezone?: string;
}

export interface PlaceCallResult {
  success: boolean;
  callId?: string;
  /** conversation = two-way with the voice agent; message_only = TTS fallback */
  mode?: 'conversation' | 'message_only';
  error?: string;
}

export function isTwoWayCallingConfigured(): boolean {
  return Boolean(process.env.SIP_TRUNK_ID && process.env.LIVEKIT_URL);
}

export async function placeCallToContact(input: PlaceCallInput): Promise<PlaceCallResult> {
  if (!input.contact.phone) {
    return { success: false, error: 'No phone number for this contact' };
  }
  try {
    const callId = await getOnBehalfCallOrchestrator().initiateCall({
      contactQuery: input.contact.name,
      resolvedContact: input.contact,
      purpose: input.purpose,
      objective: input.objective ?? 'check_in',
      callType: input.callType ?? 'personal',
      originalSessionId: '',
      userId: input.userId,
      userName: input.userName || 'your friend',
      userTimezone: input.userTimezone || 'America/Los_Angeles',
      recordingConsent: false,
      personaId: input.personaId,
    });
    return {
      success: true,
      callId,
      mode: isTwoWayCallingConfigured() ? 'conversation' : 'message_only',
    };
  } catch (error) {
    log.error({ error: String(error), userId: input.userId }, 'Could not place call');
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
