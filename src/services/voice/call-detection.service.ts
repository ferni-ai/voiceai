/**
 * Call Detection Service - Human vs Machine Detection
 *
 * Handles Twilio's Answering Machine Detection (AMD) to:
 * - Detect if a human or machine answered
 * - Leave appropriate voicemail messages
 * - Route human-answered calls appropriately
 * - Handle fax machines, silence, etc.
 *
 * Twilio AMD provides these values:
 * - human: A human answered
 * - machine_start: Machine detected, message hasn't started
 * - machine_end_beep: Machine detected, beep received (leave message now!)
 * - machine_end_silence: Machine detected, no beep
 * - machine_end_other: Machine detected, other ending
 * - fax: Fax machine detected
 * - unknown: Detection failed
 *
 * @module call-detection.service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import { generatePersonaVoice } from './voice-call.js';
import {
  generateCallMessage,
  type CallContext,
  type CallTemplateType,
} from './outbound-call-templates.js';

const log = createLogger({ module: 'call-detection' });

// Environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const GCS_BUCKET = process.env.GCS_VOICE_BUCKET || '';
const GCS_BASE_URL = GCS_BUCKET ? `https://storage.googleapis.com/${GCS_BUCKET}` : '';

// ============================================================================
// TYPES
// ============================================================================

export type AnsweredBy =
  | 'human'
  | 'machine_start'
  | 'machine_end_beep'
  | 'machine_end_silence'
  | 'machine_end_other'
  | 'fax'
  | 'unknown';

export interface DetectionResult {
  answeredBy: AnsweredBy;
  callSid: string;
  duration: number;
  machineDetectionDuration?: number;
}

export interface CallRouting {
  /** What action to take */
  action: 'play_message' | 'leave_voicemail' | 'connect_agent' | 'hangup';
  /** TwiML to execute */
  twiml: string;
  /** Human-readable reason */
  reason: string;
}

export interface VoicemailContext {
  recipientName: string;
  personaId: string;
  purpose: string;
  callback?: string;
  customMessage?: string;
}

// ============================================================================
// VOICEMAIL TEMPLATES
// ============================================================================

const VOICEMAIL_TEMPLATES = {
  /** Generic voicemail - friendly, not pushy */
  generic: (ctx: VoicemailContext, personaName: string) =>
    `Hey ${ctx.recipientName}, this is ${personaName}. ` +
    `I was just calling to ${ctx.purpose}. ` +
    `No rush to call back - I'll try again later. Take care!`,

  /** Check-in voicemail - warm, supportive */
  check_in: (ctx: VoicemailContext, personaName: string) =>
    `Hey ${ctx.recipientName}, it's ${personaName}. ` +
    `Just wanted to check in and see how you're doing. ` +
    `No need to call back if you're busy - just wanted you to know I'm thinking of you. ` +
    `Take care of yourself!`,

  /** Appointment reminder voicemail */
  appointment: (ctx: VoicemailContext, personaName: string) =>
    `Hi ${ctx.recipientName}, this is ${personaName}. ` +
    `Just a friendly reminder about ${ctx.purpose}. ` +
    `Let me know if you need anything. Talk soon!`,

  /** Important callback voicemail */
  callback: (ctx: VoicemailContext, personaName: string) =>
    `Hey ${ctx.recipientName}, it's ${personaName}. ` +
    `I have something I'd like to share with you about ${ctx.purpose}. ` +
    `When you have a moment, give me a call back at ${ctx.callback || 'your convenience'}. ` +
    `Talk soon!`,

  /** Celebration voicemail */
  celebration: (ctx: VoicemailContext, personaName: string) =>
    `Hey ${ctx.recipientName}! It's ${personaName}. ` +
    `I heard about your news and just had to reach out to say congratulations! ` +
    `So proud of you. Call me back when you can - I want to hear all about it!`,
};

export type VoicemailTemplate = keyof typeof VOICEMAIL_TEMPLATES;

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Determine what to do based on AMD result
 */
export function routeBasedOnDetection(
  detection: DetectionResult,
  context: {
    recipientName: string;
    personaId: string;
    purpose: string;
    voicemailMessage?: string;
    humanAnsweredAudioUrl?: string;
  }
): CallRouting {
  const personaName = getPersonaDisplayName(context.personaId);

  log.info(
    {
      answeredBy: detection.answeredBy,
      callSid: detection.callSid,
      machineDetectionDuration: detection.machineDetectionDuration,
    },
    `📞 Call answered by: ${detection.answeredBy}`
  );

  switch (detection.answeredBy) {
    case 'human':
      // Human answered - play the main message or connect to agent
      if (context.humanAnsweredAudioUrl) {
        return {
          action: 'play_message',
          twiml: generatePlayTwiml(context.humanAnsweredAudioUrl),
          reason: 'Human answered - playing personalized message',
        };
      }
      return {
        action: 'connect_agent',
        twiml: generateWaitTwiml('Just a moment while I connect you...'),
        reason: 'Human answered - connecting to live agent',
      };

    case 'machine_end_beep':
      // Machine with beep - perfect for leaving voicemail!
      const voicemailMessage =
        context.voicemailMessage ||
        VOICEMAIL_TEMPLATES.generic(
          { recipientName: context.recipientName, personaId: context.personaId, purpose: context.purpose },
          personaName
        );
      return {
        action: 'leave_voicemail',
        twiml: generateVoicemailTwiml(voicemailMessage, context.personaId),
        reason: 'Voicemail detected (with beep) - leaving message',
      };

    case 'machine_end_silence':
    case 'machine_end_other':
      // Machine without clear beep - try to leave message anyway
      const silenceVoicemail =
        context.voicemailMessage ||
        VOICEMAIL_TEMPLATES.generic(
          { recipientName: context.recipientName, personaId: context.personaId, purpose: context.purpose },
          personaName
        );
      return {
        action: 'leave_voicemail',
        twiml: generateVoicemailTwiml(silenceVoicemail, context.personaId, 2), // Extra pause
        reason: 'Voicemail detected (no beep) - leaving message with pause',
      };

    case 'machine_start':
      // Still detecting - wait for the machine to finish
      return {
        action: 'leave_voicemail',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="5"/>
</Response>`,
        reason: 'Machine detected, waiting for greeting to finish',
      };

    case 'fax':
      // Fax machine - hang up
      return {
        action: 'hangup',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`,
        reason: 'Fax machine detected - hanging up',
      };

    case 'unknown':
    default:
      // Unknown - assume human and play message
      if (context.humanAnsweredAudioUrl) {
        return {
          action: 'play_message',
          twiml: generatePlayTwiml(context.humanAnsweredAudioUrl),
          reason: 'Detection unknown - assuming human, playing message',
        };
      }
      return {
        action: 'play_message',
        twiml: generateSayTwiml(`Hi ${context.recipientName}, this is ${personaName}. I'll try calling back later.`),
        reason: 'Detection unknown - playing brief message',
      };
  }
}

/**
 * Generate a voicemail message with persona voice
 */
export async function generateVoicemailAudio(
  template: VoicemailTemplate,
  context: VoicemailContext
): Promise<{ audioUrl: string; message: string } | null> {
  const personaName = getPersonaDisplayName(context.personaId);
  const templateFn = VOICEMAIL_TEMPLATES[template];

  const message = context.customMessage || templateFn(context, personaName);

  log.debug({ template, personaId: context.personaId, messageLength: message.length }, 'Generating voicemail audio');

  // Generate audio with persona voice
  const audioBuffer = await generatePersonaVoice(message, context.personaId);
  if (!audioBuffer) {
    log.warn({ personaId: context.personaId }, 'Failed to generate voicemail audio');
    return null;
  }

  // Upload to GCS
  const audioUrl = await uploadVoicemailAudio(audioBuffer, context.personaId);
  if (!audioUrl) {
    log.warn({ personaId: context.personaId }, 'Failed to upload voicemail audio');
    return null;
  }

  return { audioUrl, message };
}

/**
 * Generate enhanced voicemail with call template
 */
export async function generateSmartVoicemail(
  templateType: CallTemplateType,
  context: CallContext
): Promise<{ audioUrl: string; message: string } | null> {
  const generated = generateCallMessage(templateType, context);

  log.debug(
    { templateType, personaId: context.personaId, estimatedDuration: generated.estimatedDuration },
    'Generating smart voicemail'
  );

  // Generate audio with persona voice
  const audioBuffer = await generatePersonaVoice(generated.message, context.personaId || 'ferni');
  if (!audioBuffer) {
    return null;
  }

  // Upload to GCS
  const audioUrl = await uploadVoicemailAudio(audioBuffer, context.personaId || 'ferni');
  if (!audioUrl) {
    return null;
  }

  return { audioUrl, message: generated.plainText };
}

// ============================================================================
// TWIML GENERATORS
// ============================================================================

function generatePlayTwiml(audioUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
</Response>`;
}

function generateSayTwiml(message: string, voice = 'Polly.Matthew'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${escapeXml(message)}</Say>
</Response>`;
}

function generateWaitTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
  <Pause length="30"/>
</Response>`;
}

function generateVoicemailTwiml(
  message: string,
  personaId: string,
  initialPause = 1
): string {
  const voice = getPersonaFallbackVoice(personaId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${initialPause}"/>
  <Say voice="${voice}">${escapeXml(message)}</Say>
</Response>`;
}

// ============================================================================
// UTILITIES
// ============================================================================

async function uploadVoicemailAudio(audioBuffer: Buffer, personaId: string): Promise<string | null> {
  if (!GCS_BUCKET) {
    return null;
  }

  try {
    const gcs = await import('@google-cloud/storage');
    const Storage = gcs.Storage || gcs.default?.Storage;
    if (!Storage) return null;

    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);
    const filename = `voicemails/${personaId}-${Date.now()}.mp3`;
    const file = bucket.file(filename);

    await file.save(audioBuffer, {
      metadata: { contentType: 'audio/mpeg' },
      public: true,
    });

    return `${GCS_BASE_URL}/${filename}`;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to upload voicemail');
    return null;
  }
}

function getPersonaFallbackVoice(personaId: string): string {
  const voices: Record<string, string> = {
    ferni: 'Polly.Matthew',
    'alex-chen': 'Polly.Matthew',
    'maya-santos': 'Polly.Joanna',
    'peter-john': 'Polly.Matthew',
    'jordan-taylor': 'Polly.Joanna',
    'nayan-patel': 'Polly.Matthew',
  };
  return voices[personaId] || 'Polly.Matthew';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Twilio AMD webhook callback
 *
 * Add this endpoint to your server:
 * POST /api/twilio/amd-callback
 */
export interface AMDWebhookPayload {
  CallSid: string;
  CallStatus: string;
  AnsweredBy: AnsweredBy;
  MachineDetectionDuration?: string;
  CallDuration?: string;
}

export function parseAMDWebhook(body: AMDWebhookPayload): DetectionResult {
  return {
    answeredBy: body.AnsweredBy || 'unknown',
    callSid: body.CallSid,
    duration: parseInt(body.CallDuration || '0', 10),
    machineDetectionDuration: body.MachineDetectionDuration
      ? parseInt(body.MachineDetectionDuration, 10)
      : undefined,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  routeBasedOnDetection,
  generateVoicemailAudio,
  generateSmartVoicemail,
  parseAMDWebhook,
  VOICEMAIL_TEMPLATES,
};
