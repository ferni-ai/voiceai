/**
 * Natural Call Service - "Better Than Human" Voice Calls
 *
 * High-level service that combines:
 * - Dynamic message templates
 * - SSML prosody control
 * - Persona voices (Cartesia TTS)
 * - Context-aware personalization
 *
 * Use this service for ALL outbound calls to ensure consistency
 * and natural, human-feeling voice messages.
 *
 * @module natural-call.service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { callWithPersonaVoice, generatePersonaVoice } from './voice-call.js';
import {
  generateCallMessage,
  generateThinkingOfYouCall,
  generateCheckInCall,
  generateAppointmentConfirmationCall,
  type CallContext,
  type CallTemplateType,
  type GeneratedCall,
} from './outbound-call-templates.js';
import { generateFerniMessage, type MessageContext } from './ferni-message-generator.js';
import type { OutboundSsmlOptions } from '../outreach/outbound-ssml.js';

const log = createLogger({ module: 'natural-call' });

// ============================================================================
// TYPES
// ============================================================================

export interface NaturalCallRequest {
  /** Phone number to call */
  phone: string;
  /** Recipient's name */
  recipientName: string;
  /** User ID (for loading rich context about their life) */
  userId?: string;
  /** Type of call (determines template and tone) */
  type: CallTemplateType;
  /** Persona making the call (default: ferni) */
  personaId?: string;
  /** Additional context for dynamic personalization */
  context?: Partial<CallContext>;
  /** Custom message (overrides template) */
  customMessage?: string;
  /** Options for the call */
  options?: {
    /** Fall back to Twilio voice if Cartesia unavailable */
    fallbackToTwilioVoice?: boolean;
    /** Skip SSML enhancement */
    skipSsml?: boolean;
  };
}

export interface NaturalCallResult {
  success: boolean;
  message: string;
  callSid?: string;
  usedCartesiaVoice?: boolean;
  generatedMessage?: GeneratedCall;
  error?: string;
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Make a natural, personalized voice call
 *
 * This is the primary entry point for all outbound calls.
 * It automatically:
 * - Selects the right template based on call type
 * - Personalizes with recipient's name and context
 * - Applies SSML for natural pacing and prosody
 * - Uses the persona's authentic voice via Cartesia
 * - Falls back gracefully if any component is unavailable
 */
export async function makeNaturalCall(request: NaturalCallRequest): Promise<NaturalCallResult> {
  const personaId = request.personaId || 'ferni';
  const personaName = getPersonaDisplayName(personaId);

  log.info(
    {
      phone: maskPhone(request.phone),
      type: request.type,
      personaId,
      recipientName: request.recipientName,
    },
    `📞 Making natural ${request.type} call as ${personaName}`
  );

  try {
    // Build context
    const context: CallContext = {
      recipientName: request.recipientName,
      personaId,
      timeOfDay: getCurrentTimeOfDay(),
      ...request.context,
    };

    // Generate the message
    let generatedCall: GeneratedCall;

    if (request.customMessage) {
      // Use custom message
      generatedCall = {
        message: request.customMessage,
        plainText: request.customMessage,
        estimatedDuration: Math.ceil(request.customMessage.split(/\s+/).length * 0.4),
        voiceId: '',
        emotion: 'neutral',
        speedMultiplier: 1.0,
      };
    } else {
      // Let Ferni craft a REAL message (not templates)
      // Pass userId to auto-load rich context about their life
      const messageContext: MessageContext = {
        recipientName: request.recipientName,
        userId: request.userId, // This triggers auto-loading of life context!
        purpose: mapCallTypeToPurpose(request.type),
        relationshipDepth: mapRelationshipStage(context.relationshipStage),
        daysSinceContact: context.daysSinceContact,
        previousTopics: context.previousTopics,
        timeOfDay: context.timeOfDay,
        details: {
          appointment: context.customContext?.appointment,
          time: context.customContext?.time,
          location: context.customContext?.location,
          achievement: context.customContext?.achievement,
          reminder: context.customContext?.reminder,
        },
      };

      const ferniMessage = await generateFerniMessage(messageContext);

      generatedCall = {
        message: ferniMessage.message,
        plainText: ferniMessage.message,
        estimatedDuration: ferniMessage.estimatedDuration,
        voiceId: '',
        emotion: 'neutral',
        speedMultiplier: 1.0,
      };
    }

    log.debug(
      {
        messageLength: generatedCall.message.length,
        plainTextLength: generatedCall.plainText.length,
        estimatedDuration: generatedCall.estimatedDuration,
      },
      'Generated call message'
    );

    // Make the call
    const ssmlOptions: OutboundSsmlOptions | false = request.options?.skipSsml
      ? false
      : {
          personaId,
          callType: mapCallTypeToSsmlType(request.type),
          relationshipStage: context.relationshipStage || 'established',
        };

    const result = await callWithPersonaVoice(
      request.phone,
      generatedCall.message,
      personaId,
      {
        fallbackToTwilioVoice: request.options?.fallbackToTwilioVoice ?? true,
        ssml: ssmlOptions,
      }
    );

    if (result.success) {
      log.info(
        {
          callSid: result.callSid,
          usedCartesiaVoice: result.usedCartesiaVoice,
          type: request.type,
          estimatedDuration: generatedCall.estimatedDuration,
        },
        '✅ Natural call initiated successfully'
      );
    } else {
      log.warn({ error: result.message, type: request.type }, '⚠️ Call initiation failed');
    }

    return {
      ...result,
      generatedMessage: generatedCall,
    };
  } catch (error) {
    log.error({ error: String(error), type: request.type }, '❌ Natural call error');
    return {
      success: false,
      message: 'Failed to make call',
      error: String(error),
    };
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Make a "thinking of you" call - pure warmth, no agenda
 */
export async function callThinkingOfYou(
  phone: string,
  recipientName: string,
  personaId = 'ferni',
  previousTopics?: string[]
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'thinking_of_you',
    personaId,
    context: { previousTopics },
  });
}

/**
 * Make a check-in call - warm outreach after absence
 */
export async function callCheckIn(
  phone: string,
  recipientName: string,
  personaId = 'ferni',
  daysSinceContact?: number
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'check_in',
    personaId,
    context: { daysSinceContact },
  });
}

/**
 * Make a birthday call - celebratory warmth
 */
export async function callBirthday(
  phone: string,
  recipientName: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'birthday',
    personaId,
    context: { occasion: 'birthday' },
  });
}

/**
 * Make a celebration call - achievement recognition
 */
export async function callCelebration(
  phone: string,
  recipientName: string,
  achievement: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'celebration',
    personaId,
    context: { customContext: { achievement } },
  });
}

/**
 * Make a reminder call - gentle nudge
 */
export async function callReminder(
  phone: string,
  recipientName: string,
  reminder: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'reminder',
    personaId,
    context: { customContext: { reminder } },
  });
}

/**
 * Make an encouragement call - supportive outreach
 */
export async function callEncouragement(
  phone: string,
  recipientName: string,
  challenge?: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'encouragement',
    personaId,
    context: { customContext: challenge ? { challenge } : {} },
  });
}

/**
 * Make an appointment confirmation call - informative + warm
 */
export async function callAppointmentConfirmation(
  phone: string,
  recipientName: string,
  appointment: string,
  time?: string,
  location?: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'appointment_confirmation',
    personaId,
    context: {
      customContext: {
        appointment,
        ...(time && { time }),
        ...(location && { location }),
      },
    },
  });
}

/**
 * Make an appointment reminder call - helpful nudge
 */
export async function callAppointmentReminder(
  phone: string,
  recipientName: string,
  appointment: string,
  time: string,
  location?: string,
  personaId = 'ferni'
): Promise<NaturalCallResult> {
  return makeNaturalCall({
    phone,
    recipientName,
    type: 'appointment_reminder',
    personaId,
    context: {
      customContext: {
        appointment,
        time,
        ...(location && { location }),
      },
    },
  });
}

// ============================================================================
// PREVIEW / TESTING
// ============================================================================

/**
 * Preview a call message without actually making the call
 * Useful for testing and development
 */
export function previewCallMessage(
  type: CallTemplateType,
  recipientName: string,
  personaId = 'ferni',
  context?: Partial<CallContext>
): GeneratedCall {
  const fullContext: CallContext = {
    recipientName,
    personaId,
    timeOfDay: getCurrentTimeOfDay(),
    relationshipStage: 'established',
    ...context,
  };

  return generateCallMessage(type, fullContext);
}

/**
 * Preview all call types for a recipient
 * Useful for testing template variations
 */
export function previewAllCallTypes(
  recipientName: string,
  personaId = 'ferni'
): Record<CallTemplateType, GeneratedCall> {
  const types: CallTemplateType[] = [
    'thinking_of_you',
    'check_in',
    'birthday',
    'celebration',
    'reminder',
    'follow_up',
    'encouragement',
    'concern',
    'gratitude',
    'appointment_confirmation',
    'appointment_reminder',
  ];

  const previews: Record<string, GeneratedCall> = {};
  for (const type of types) {
    previews[type] = previewCallMessage(type, recipientName, personaId, {
      customContext: {
        achievement: 'getting that promotion',
        reminder: 'your dental appointment tomorrow',
        challenge: 'the project deadline',
        topic: 'your career goals',
        reason: 'being such a great friend',
        appointment: 'your doctor appointment',
        time: 'tomorrow at 2pm',
        location: 'Dr. Smith\'s office',
      },
    });
  }

  return previews as Record<CallTemplateType, GeneratedCall>;
}

// ============================================================================
// UTILITIES
// ============================================================================

function getCurrentTimeOfDay(): CallContext['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function mapCallTypeToPurpose(callType: CallTemplateType): MessageContext['purpose'] {
  const mapping: Record<CallTemplateType, MessageContext['purpose']> = {
    thinking_of_you: 'thinking_of_you',
    check_in: 'check_in',
    birthday: 'birthday',
    celebration: 'celebration',
    reminder: 'reminder',
    follow_up: 'follow_up',
    encouragement: 'encouragement',
    concern: 'concern',
    gratitude: 'gratitude',
    appointment_confirmation: 'appointment',
    appointment_reminder: 'appointment',
  };
  return mapping[callType] || 'check_in';
}

function mapRelationshipStage(
  stage?: 'first_meeting' | 'early' | 'established' | 'deep_trust'
): MessageContext['relationshipDepth'] {
  if (!stage) return 'established';
  const mapping: Record<string, MessageContext['relationshipDepth']> = {
    first_meeting: 'new',
    early: 'building',
    established: 'established',
    deep_trust: 'deep',
  };
  return mapping[stage] || 'established';
}

function mapCallTypeToSsmlType(
  callType: CallTemplateType
): 'introduction' | 'check-in' | 'celebration' | 'support' | 'reminder' {
  const mapping: Record<CallTemplateType, 'introduction' | 'check-in' | 'celebration' | 'support' | 'reminder'> = {
    thinking_of_you: 'check-in',
    check_in: 'check-in',
    birthday: 'celebration',
    celebration: 'celebration',
    reminder: 'reminder',
    follow_up: 'check-in',
    encouragement: 'support',
    concern: 'support',
    gratitude: 'check-in',
    appointment_confirmation: 'reminder',
    appointment_reminder: 'reminder',
  };
  return mapping[callType] || 'check-in';
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***${digits.slice(-4)}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  generateCallMessage,
  generateThinkingOfYouCall,
  generateCheckInCall,
  generateAppointmentConfirmationCall,
  type CallContext,
  type CallTemplateType,
  type GeneratedCall,
} from './outbound-call-templates.js';
