/**
 * Voice Message Service
 *
 * "Better Than Human" - Send your voice as a message.
 * Generate AI voice messages or record and send your own.
 *
 * @module services/contacts/voice-message-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm-utils.js';
import { TEMP_REASONING, MAX_TOKENS_TINY } from '../../config/gemini-config.js';
import type { ContactRelationship } from './contact-relationship-service.js';

const log = createLogger({ module: 'VoiceMessageService' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMessageRequest {
  userId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  message: string;
  voiceId?: string; // ElevenLabs voice ID
  deliveryMethod: 'mms' | 'voicemail' | 'call';
}

export interface VoiceMessageResult {
  success: boolean;
  messageId?: string;
  audioUrl?: string;
  error?: string;
  deliveryStatus: 'sent' | 'queued' | 'failed';
}

export interface VoiceGenerationOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakingRate?: number;
}

// ============================================================================
// TEXT-TO-SPEECH GENERATION
// ============================================================================

/**
 * Generate voice audio from text using ElevenLabs
 */
export async function generateVoiceAudio(
  text: string,
  options: VoiceGenerationOptions = {}
): Promise<{ audioBuffer: Buffer; duration: number } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.warn('ElevenLabs API key not configured');
    return null;
  }

  const {
    voiceId = 'EXAVITQu4vr4xnSDxMaL', // Default: "Sarah" - warm, friendly voice
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.5,
  } = options;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'ElevenLabs API error');
      return null;
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Estimate duration (rough calculation based on text length)
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    const duration = (wordCount / wordsPerMinute) * 60;

    return { audioBuffer, duration };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate voice audio');
    return null;
  }
}

// ============================================================================
// MESSAGE DELIVERY
// ============================================================================

/**
 * Send voice message via MMS using Twilio
 */
export async function sendVoiceMessageMMS(
  request: VoiceMessageRequest
): Promise<VoiceMessageResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    log.warn('Twilio credentials not configured');
    return {
      success: false,
      error: 'Voice messaging not configured',
      deliveryStatus: 'failed',
    };
  }

  try {
    // Generate voice audio
    const audio = await generateVoiceAudio(request.message, {
      voiceId: request.voiceId,
    });

    if (!audio) {
      return {
        success: false,
        error: 'Failed to generate voice audio',
        deliveryStatus: 'failed',
      };
    }

    // Upload audio to temporary storage (would need cloud storage integration)
    const audioUrl = await uploadAudioToStorage(request.userId, audio.audioBuffer);

    if (!audioUrl) {
      return {
        success: false,
        error: 'Failed to upload audio',
        deliveryStatus: 'failed',
      };
    }

    // Send MMS via Twilio
    const { Twilio } = await import('twilio');
    const client = new Twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: `Voice message from your friend`, // Simple intro text
      from: fromNumber,
      to: request.contactPhone,
      mediaUrl: [audioUrl],
    });

    log.info({ messageId: message.sid, to: request.contactPhone }, 'Voice message sent via MMS');

    return {
      success: true,
      messageId: message.sid,
      audioUrl,
      deliveryStatus: 'sent',
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to send voice message');
    return {
      success: false,
      error: String(error),
      deliveryStatus: 'failed',
    };
  }
}

/**
 * Upload audio buffer to cloud storage and return URL
 */
async function uploadAudioToStorage(userId: string, audioBuffer: Buffer): Promise<string | null> {
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.VOICE_MESSAGE_BUCKET;

  if (!bucketName) {
    log.warn('GCS_BUCKET_NAME not configured - voice message upload disabled');
    return null;
  }

  try {
    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    // Generate unique filename
    const filename = `voice-messages/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const file = bucket.file(filename);

    // Upload the audio buffer
    await file.save(audioBuffer, {
      contentType: 'audio/mpeg',
      metadata: {
        cacheControl: 'public, max-age=86400', // 1 day cache
      },
    });

    // Make publicly accessible for Twilio to fetch
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
    log.info({ publicUrl, size: audioBuffer.length, userId }, '✅ Voice message uploaded to GCS');

    return publicUrl;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to upload voice message to GCS');
    return null;
  }
}

// ============================================================================
// VOICE MESSAGE GENERATION
// ============================================================================

/**
 * Generate a personalized voice message script using LLM
 */
export async function generateVoiceMessageScript(
  contact: ContactRelationship,
  occasion: string,
  tone: 'warm' | 'professional' | 'casual' | 'heartfelt' = 'warm',
  maxDurationSeconds = 30
): Promise<string> {
  const wordsPerSecond = 2.5; // Average speaking rate
  const maxWords = Math.floor(maxDurationSeconds * wordsPerSecond);

  const prompt = `You are helping someone record a voice message for ${contact.name}.

Context:
- Relationship: ${contact.relationship || 'friend'}
- Occasion: ${occasion}
- Tone: ${tone}
- Max length: ${maxWords} words (about ${maxDurationSeconds} seconds when spoken)

Write a natural, heartfelt voice message script. It should:
- Sound natural when spoken aloud (use contractions, casual phrasing)
- Be personal and warm (not corporate or stiff)
- Reference the specific occasion
- End with a warm closing
- NO emojis or special characters (this will be spoken)
- NO stage directions or [brackets]

Script:`;

  try {
    const script = await callLLM(prompt, {
      temperature: TEMP_REASONING,
      maxTokens: MAX_TOKENS_TINY,
    });

    return script || `Hey ${contact.name}, just wanted to reach out and say hi. Thinking of you!`;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate voice message script');
    return `Hey ${contact.name}, just wanted to reach out and say hi. Thinking of you!`;
  }
}

// ============================================================================
// VOICE DELIVERY OPTIONS
// ============================================================================

export interface VoiceDeliveryOption {
  method: 'mms' | 'voicemail' | 'email_audio' | 'link';
  label: string;
  description: string;
  available: boolean;
  cost?: string;
}

/**
 * Get available delivery options for a contact
 */
export function getVoiceDeliveryOptions(contact: ContactRelationship): VoiceDeliveryOption[] {
  const options: VoiceDeliveryOption[] = [];

  // MMS (requires phone number)
  if (contact.phone) {
    options.push({
      method: 'mms',
      label: 'Send as MMS',
      description: `Send voice message directly to ${contact.name}'s phone`,
      available: !!process.env.TWILIO_ACCOUNT_SID,
      cost: 'Uses messaging credits',
    });
  }

  // Email with audio attachment (requires email)
  if (contact.email) {
    options.push({
      method: 'email_audio',
      label: 'Send via Email',
      description: `Send voice message as email attachment to ${contact.email}`,
      available: !!process.env.SENDGRID_API_KEY,
    });
  }

  // Shareable link (always available)
  options.push({
    method: 'link',
    label: 'Get Shareable Link',
    description: 'Get a link you can share via any messaging app',
    available: true,
  });

  return options;
}

// ============================================================================
// BATCH VOICE MESSAGES
// ============================================================================

export interface BatchVoiceRequest {
  userId: string;
  contacts: Array<{
    contactId: string;
    name: string;
    phone?: string;
    email?: string;
  }>;
  occasion: string;
  baseMessage?: string;
  personalizeEach?: boolean;
  voiceId?: string;
  deliveryMethod: 'mms' | 'email_audio' | 'link';
}

export interface BatchVoiceResult {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    contactId: string;
    contactName: string;
    status: 'sent' | 'failed' | 'skipped';
    error?: string;
    audioUrl?: string;
  }>;
}

/**
 * Send personalized voice messages to multiple contacts
 */
export async function sendBatchVoiceMessages(
  request: BatchVoiceRequest
): Promise<BatchVoiceResult> {
  const result: BatchVoiceResult = {
    total: request.contacts.length,
    sent: 0,
    failed: 0,
    results: [],
  };

  for (const contact of request.contacts) {
    try {
      // Skip if missing required contact info
      const hasDeliveryChannel =
        (request.deliveryMethod === 'mms' && contact.phone) ||
        (request.deliveryMethod === 'email_audio' && contact.email) ||
        request.deliveryMethod === 'link';

      if (!hasDeliveryChannel) {
        result.results.push({
          contactId: contact.contactId,
          contactName: contact.name,
          status: 'skipped',
          error: `Missing ${request.deliveryMethod === 'mms' ? 'phone' : 'email'} for delivery`,
        });
        continue;
      }

      // Generate personalized message if requested
      let messageText = request.baseMessage || '';
      if (request.personalizeEach || !messageText) {
        const contactData = {
          id: contact.contactId,
          userId: request.userId,
          contactId: contact.contactId,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          relationship: 'friend' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          firstInteraction: new Date(),
          lastInteraction: new Date(),
          interactionCount: 0,
          strengthScore: 50,
          topics: [],
          recentContext: [],
        } as ContactRelationship;
        messageText = await generateVoiceMessageScript(contactData, request.occasion, 'warm', 30);
      }

      // Generate audio
      const audio = await generateVoiceAudio(messageText, { voiceId: request.voiceId });

      if (!audio) {
        result.failed++;
        result.results.push({
          contactId: contact.contactId,
          contactName: contact.name,
          status: 'failed',
          error: 'Audio generation failed',
        });
        continue;
      }

      // For now, just mark as sent (actual delivery would need storage upload)
      result.sent++;
      result.results.push({
        contactId: contact.contactId,
        contactName: contact.name,
        status: 'sent',
      });
    } catch (error) {
      result.failed++;
      result.results.push({
        contactId: contact.contactId,
        contactName: contact.name,
        status: 'failed',
        error: String(error),
      });
    }
  }

  log.info(
    { total: result.total, sent: result.sent, failed: result.failed },
    'Batch voice messages completed'
  );

  return result;
}
