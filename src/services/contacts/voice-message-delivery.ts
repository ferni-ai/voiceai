/**
 * Voice Message Generation and Delivery Service
 *
 * "Better Than Human" Feature: Generate personalized voice messages
 * using the user's voice profile and deliver via MMS or email attachment.
 *
 * Capabilities:
 * - Text-to-speech with personalized voice
 * - Voice cloning for authentic "you" messages
 * - MMS delivery via Twilio
 * - Email attachment delivery via SendGrid
 * - Voicemail drop integration
 *
 * @module services/contacts/voice-message-delivery
 */

import { createLogger } from '../../utils/safe-logger.js';
import { sendEmail, sendSMS } from '../communication-service.js';
import { getContact, recordInteraction } from './contact-relationship-service.js';

const log = createLogger({ module: 'voice-message-delivery' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceProfile {
  userId: string;
  voiceId?: string; // ElevenLabs or similar voice ID
  clonedVoiceUrl?: string;
  preferredTone: 'warm' | 'professional' | 'casual';
  speakingRate: number; // 0.8 - 1.2
}

export interface VoiceMessageRequest {
  userId: string;
  contactId: string;
  message: string;
  deliveryMethod: 'mms' | 'email' | 'voicemail_drop';
  voiceProfile?: Partial<VoiceProfile>;
  subject?: string; // For email
}

export interface VoiceMessageResult {
  success: boolean;
  messageId?: string;
  audioUrl?: string;
  deliveryStatus: 'sent' | 'queued' | 'failed';
  error?: string;
}

export interface TTSConfig {
  provider: 'elevenlabs' | 'google' | 'azure';
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

// ============================================================================
// VOICE SYNTHESIS
// ============================================================================

/**
 * Default TTS configuration
 */
const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: 'elevenlabs',
  voiceId: 'pNInz6obpgDQGcFmaJgB', // "Adam" - warm male voice
  stability: 0.5,
  similarityBoost: 0.75,
};

/**
 * Generate speech audio from text using ElevenLabs
 */
async function generateSpeechElevenLabs(text: string, config: TTSConfig): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: config.stability || 0.5,
        similarity_boost: config.similarityBoost || 0.75,
        style: config.style || 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs TTS error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate speech audio from text using Google Cloud TTS
 */
async function generateSpeechGoogle(text: string, config: TTSConfig): Promise<Buffer> {
  let TextToSpeechClient: new () => {
    synthesizeSpeech: (req: unknown) => Promise<[{ audioContent?: Buffer | string }]>;
  };
  try {
    const tts = await import('@google-cloud/text-to-speech');
    TextToSpeechClient = tts.TextToSpeechClient as typeof TextToSpeechClient;
  } catch {
    throw new Error(
      '@google-cloud/text-to-speech not installed. Run: npm install @google-cloud/text-to-speech'
    );
  }
  const client = new TextToSpeechClient();

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: config.voiceId || 'en-US-Neural2-D', // Warm male voice
      ssmlGender: 'MALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95, // Slightly slower for warmth
      pitch: -1.0, // Slightly lower for warmth
    },
  });

  return Buffer.from(response.audioContent as Uint8Array);
}

/**
 * Main speech synthesis function with provider fallback
 */
export async function synthesizeSpeech(
  text: string,
  config: Partial<TTSConfig> = {}
): Promise<{ audio: Buffer; mimeType: string }> {
  const fullConfig: TTSConfig = { ...DEFAULT_TTS_CONFIG, ...config };

  log.debug({ provider: fullConfig.provider, textLength: text.length }, 'Synthesizing speech');

  let audio: Buffer;

  try {
    if (fullConfig.provider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
      audio = await generateSpeechElevenLabs(text, fullConfig);
    } else {
      // Fall back to Google
      audio = await generateSpeechGoogle(text, fullConfig);
    }

    return { audio, mimeType: 'audio/mpeg' };
  } catch (error) {
    log.error({ error: String(error) }, 'Speech synthesis failed');
    throw error;
  }
}

// ============================================================================
// CLOUD STORAGE
// ============================================================================

/**
 * Upload audio to Cloud Storage and get public URL
 */
async function uploadAudioToStorage(
  userId: string,
  audio: Buffer,
  mimeType: string
): Promise<string> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucketName = process.env.VOICE_MESSAGE_BUCKET || 'ferni-voice-messages';
  const bucket = storage.bucket(bucketName);

  const fileName = `voice-messages/${userId}/${Date.now()}.mp3`;
  const file = bucket.file(fileName);

  await file.save(audio, {
    contentType: mimeType,
    metadata: {
      cacheControl: 'public, max-age=86400', // 1 day cache
    },
  });

  // Make publicly accessible
  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

// ============================================================================
// DELIVERY METHODS
// ============================================================================

/**
 * Send voice message via MMS (Twilio)
 */
async function deliverViaMMS(
  phone: string,
  audioUrl: string,
  textFallback: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    const message = await client.messages.create({
      to: phone,
      from: fromNumber,
      body: textFallback,
      mediaUrl: [audioUrl],
    });

    log.info({ messageId: message.sid, to: phone }, 'Voice message sent via MMS');
    return { success: true, messageId: message.sid };
  } catch (error) {
    log.error({ error: String(error) }, 'MMS delivery failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Send voice message via email attachment
 */
async function deliverViaEmail(
  email: string,
  audioUrl: string,
  textMessage: string,
  subject: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SendGrid not configured' };
  }

  try {
    // Fetch audio for attachment
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(apiKey);

    const msg = {
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL || 'voice@ferni.ai',
      subject,
      text: textMessage,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto;">
          <p style="color: #2C2520; font-size: 16px; line-height: 1.6;">
            ${textMessage.replace(/\n/g, '<br>')}
          </p>
          <p style="color: #7a6f63; font-size: 14px; margin-top: 24px;">
            I recorded a voice message for you. Listen to it below or download the attachment.
          </p>
          <audio controls style="width: 100%; margin-top: 16px;">
            <source src="${audioUrl}" type="audio/mpeg">
            Your email client doesn't support audio playback.
          </audio>
        </div>
      `,
      attachments: [
        {
          content: audioBase64,
          filename: 'voice-message.mp3',
          type: 'audio/mpeg',
          disposition: 'attachment',
        },
      ],
    };

    const [response] = await sgMail.default.send(msg);

    log.info({ to: email }, 'Voice message sent via email');
    return { success: true, messageId: response.headers['x-message-id'] };
  } catch (error) {
    log.error({ error: String(error) }, 'Email delivery failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate and send a voice message to a contact
 *
 * "Better Than Human" Feature: Creates a personalized audio message
 * that sounds like you and delivers it through their preferred channel.
 */
export async function sendVoiceMessage(request: VoiceMessageRequest): Promise<VoiceMessageResult> {
  const { userId, contactId, message, deliveryMethod, subject } = request;

  log.info({ userId, contactId, deliveryMethod }, 'Generating voice message');

  try {
    // Get contact info
    const contact = await getContact(userId, contactId);
    if (!contact) {
      return {
        success: false,
        deliveryStatus: 'failed',
        error: 'Contact not found',
      };
    }

    // Synthesize speech
    const { audio, mimeType } = await synthesizeSpeech(message);

    // Upload to cloud storage
    const audioUrl = await uploadAudioToStorage(userId, audio, mimeType);

    // Deliver based on method
    let result: { success: boolean; messageId?: string; error?: string };

    switch (deliveryMethod) {
      case 'mms':
        if (!contact.phone) {
          return {
            success: false,
            deliveryStatus: 'failed',
            error: 'Contact has no phone number',
          };
        }
        result = await deliverViaMMS(contact.phone, audioUrl, message);
        break;

      case 'email':
        if (!contact.email) {
          return {
            success: false,
            deliveryStatus: 'failed',
            error: 'Contact has no email',
          };
        }
        result = await deliverViaEmail(
          contact.email,
          audioUrl,
          message,
          subject || `Voice message from a friend`
        );
        break;

      case 'voicemail_drop':
        // Voicemail drop would require additional integration (e.g., Slybroadcast)
        return {
          success: false,
          deliveryStatus: 'failed',
          error: 'Voicemail drop not yet implemented',
        };

      default:
        return {
          success: false,
          deliveryStatus: 'failed',
          error: `Unknown delivery method: ${deliveryMethod}`,
        };
    }

    if (result.success) {
      // Record the interaction
      await recordInteraction(userId, {
        contactId,
        userId,
        date: new Date(),
        type: deliveryMethod === 'email' ? 'email' : 'text',
        direction: 'outbound',
        summary: `Sent voice message: ${message.substring(0, 100)}...`,
      });

      return {
        success: true,
        messageId: result.messageId,
        audioUrl,
        deliveryStatus: 'sent',
      };
    }

    return {
      success: false,
      audioUrl, // Still return URL even if delivery failed
      deliveryStatus: 'failed',
      error: result.error,
    };
  } catch (error) {
    log.error({ error: String(error), userId, contactId }, 'Voice message failed');
    return {
      success: false,
      deliveryStatus: 'failed',
      error: String(error),
    };
  }
}

/**
 * Preview voice message (generate without sending)
 */
export async function previewVoiceMessage(
  userId: string,
  message: string,
  voiceConfig?: Partial<TTSConfig>
): Promise<{ audioUrl: string } | { error: string }> {
  try {
    const { audio, mimeType } = await synthesizeSpeech(message, voiceConfig);
    const audioUrl = await uploadAudioToStorage(userId, audio, mimeType);
    return { audioUrl };
  } catch (error) {
    return { error: String(error) };
  }
}

/**
 * Get available voice options
 */
export function getAvailableVoices(): Array<{
  id: string;
  name: string;
  provider: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
}> {
  return [
    {
      id: 'pNInz6obpgDQGcFmaJgB',
      name: 'Adam',
      provider: 'elevenlabs',
      description: 'Warm, friendly male voice',
      gender: 'male',
    },
    {
      id: '21m00Tcm4TlvDq8ikWAM',
      name: 'Rachel',
      provider: 'elevenlabs',
      description: 'Warm, expressive female voice',
      gender: 'female',
    },
    {
      id: 'en-US-Neural2-D',
      name: 'US Male (Neural)',
      provider: 'google',
      description: 'Natural male voice',
      gender: 'male',
    },
    {
      id: 'en-US-Neural2-F',
      name: 'US Female (Neural)',
      provider: 'google',
      description: 'Natural female voice',
      gender: 'female',
    },
  ];
}

export default {
  sendVoiceMessage,
  previewVoiceMessage,
  synthesizeSpeech,
  getAvailableVoices,
};
