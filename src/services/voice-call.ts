/**
 * Voice Call Service
 *
 * Makes outbound calls using Alex's Cartesia voice (not Twilio's default voice).
 * Also handles incoming call routing to LiveKit agents.
 */

import { getLogger } from '../utils/safe-logger.js';

// Alias for backwards compatibility
const log = getLogger;

// Safe logger
const getLogger = () => {
  try {
    return log();
  } catch {
    return {
      info: (data: unknown, msg?: string) =>
        console.log(`[INFO] ${msg || ''}`, typeof data === 'object' ? JSON.stringify(data) : data),
      warn: (data: unknown, msg?: string) => console.warn(`[WARN] ${msg || ''}`, data),
      error: (data: unknown, msg?: string) => console.error(`[ERROR] ${msg || ''}`, data),
      debug: (data: unknown, msg?: string) => console.debug(`[DEBUG] ${msg || ''}`, data),
    };
  }
};

// Voice registry for consistent voice ID resolution
import { getVoiceId } from '../personas/voice-registry.js';

// Environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';

// Get Alex's voice ID from the registry (single source of truth)
const getAlexVoiceId = () => getVoiceId('alex-chen');

// LiveKit SIP configuration for incoming calls
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const SIP_TRUNK_ID = process.env.SIP_TRUNK_ID || '';

// GCS configuration for audio hosting
const GCS_BUCKET =
  process.env.GCS_VOICE_BUCKET || process.env.GOOGLE_CLOUD_PROJECT
    ? `${process.env.GOOGLE_CLOUD_PROJECT}-voice-audio`
    : '';
const GCS_BASE_URL = GCS_BUCKET ? `https://storage.googleapis.com/${GCS_BUCKET}` : '';

// ============================================================================
// CARTESIA TTS - Generate Alex's Voice
// ============================================================================

interface CartesiaAudioResponse {
  audio: string; // base64 encoded audio
  format: string;
}

/**
 * Generate speech audio using Cartesia TTS with Alex's voice
 */
export async function generateAlexVoice(text: string): Promise<Buffer | null> {
  if (!CARTESIA_API_KEY) {
    getLogger().warn({}, 'Cartesia API key not configured');
    return null;
  }

  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: getAlexVoiceId(),
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 44100, // Standard CD quality - required for proper playback
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      getLogger().error({ status: response.status, error }, 'Cartesia TTS failed');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    getLogger().error({ error }, 'Failed to generate voice');
    return null;
  }
}

// ============================================================================
// AUDIO HOSTING (GCS)
// ============================================================================

// Cache for uploaded audio URLs to avoid re-uploading duplicates
const audioUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Upload audio buffer to Google Cloud Storage for Twilio playback
 * Returns a publicly accessible URL or null if upload fails
 */
async function uploadAudioToGCS(audioBuffer: Buffer, filename: string): Promise<string | null> {
  if (!GCS_BUCKET) {
    getLogger().debug({}, 'GCS bucket not configured for audio hosting');
    return null;
  }

  try {
    // Dynamic import to avoid loading GCS in environments where it's not needed
    const gcs = await import('@google-cloud/storage');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Storage = (gcs as any).Storage || (gcs as any).default?.Storage;
    if (!Storage) {
      getLogger().debug({}, 'GCS Storage class not found');
      return null;
    }
    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(`voice-calls/${filename}`);

    // Upload with public read access
    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=3600', // 1 hour cache
      },
      public: true,
    });

    const publicUrl = `${GCS_BASE_URL}/voice-calls/${filename}`;
    getLogger().info({ url: publicUrl }, '📤 Uploaded audio to GCS');

    return publicUrl;
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Failed to upload audio to GCS');
    return null;
  }
}

/**
 * Get or create a hosted URL for audio content
 * Uses caching to avoid re-uploading identical messages
 */
async function getHostedAudioUrl(message: string, audioBuffer: Buffer): Promise<string | null> {
  // Create a cache key from the message
  const cacheKey = Buffer.from(message).toString('base64').slice(0, 32);

  // Check cache
  const cached = audioUrlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    getLogger().debug({ cacheKey }, 'Using cached audio URL');
    return cached.url;
  }

  // Generate unique filename
  const timestamp = Date.now();
  const filename = `alex-${timestamp}-${cacheKey}.mp3`;

  const url = await uploadAudioToGCS(audioBuffer, filename);

  if (url) {
    // Cache for 55 minutes (GCS cache is 1 hour)
    audioUrlCache.set(cacheKey, {
      url,
      expires: Date.now() + 55 * 60 * 1000,
    });
  }

  return url;
}

// ============================================================================
// OUTBOUND CALLS WITH ALEX'S VOICE
// ============================================================================

/**
 * Make an outbound call using Alex's Cartesia voice
 *
 * This works by:
 * 1. Generating audio with Cartesia TTS
 * 2. Uploading to GCS for public access (if configured)
 * 3. Making Twilio call that plays the hosted audio
 * 4. Falls back to Twilio's built-in voice if hosting unavailable
 */
export async function callWithAlexVoice(
  toPhone: string,
  message: string,
  options?: {
    fallbackToTwilioVoice?: boolean;
  }
): Promise<{ success: boolean; message: string; callSid?: string }> {
  const logger = getLogger();

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { success: false, message: 'Twilio not configured' };
  }

  // Clean phone number
  const cleanPhone = toPhone.replace(/\D/g, '');
  const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

  logger.info({ to: e164Phone }, '📞 Initiating call with Alex voice...');

  // Try to generate Alex's voice
  let twiml: string;
  let usedAlexVoice = false;

  if (CARTESIA_API_KEY) {
    const audioBuffer = await generateAlexVoice(message);

    if (audioBuffer) {
      // Try to host the audio
      const audioUrl = await getHostedAudioUrl(message, audioBuffer);

      if (audioUrl) {
        // Use the hosted Alex voice audio
        logger.info({ audioUrl }, '🎙️ Using hosted Alex voice audio');
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
</Response>`;
        usedAlexVoice = true;
      } else {
        // GCS not available - fallback
        logger.info({}, 'Generated Alex voice audio, but GCS hosting not available');

        if (options?.fallbackToTwilioVoice !== false) {
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Hey, this is Alex calling.</Say>
  <Pause length="0.5"/>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
</Response>`;
        } else {
          return {
            success: false,
            message:
              'Audio hosting (GCS) not configured for Alex voice calls. Set GCS_VOICE_BUCKET env var.',
          };
        }
      }
    } else {
      // Cartesia failed, use Twilio voice
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Hey, this is Alex calling.</Say>
  <Pause length="0.5"/>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
</Response>`;
    }
  } else {
    // No Cartesia, use Twilio voice
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Hey, this is Alex calling.</Say>
  <Pause length="0.5"/>
  <Say voice="Polly.Matthew">${escapeXml(message)}</Say>
</Response>`;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: e164Phone,
          From: TWILIO_PHONE_NUMBER,
          Twiml: twiml,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.ok) {
      const data = (await response.json()) as { sid: string };
      const voiceInfo = usedAlexVoice ? '(using Alex voice)' : '(using Twilio voice)';
      logger.info({ callSid: data.sid, usedAlexVoice }, `✅ Call initiated ${voiceInfo}`);
      return {
        success: true,
        message: `Calling ${e164Phone} now! ${voiceInfo}`,
        callSid: data.sid,
      };
    } else {
      const error = await response.text();
      logger.error({ error }, 'Call failed');
      return { success: false, message: `Call failed: ${error}` };
    }
  } catch (error) {
    logger.error({ error }, 'Call error');
    return { success: false, message: 'Failed to initiate call' };
  }
}

// ============================================================================
// INCOMING CALL HANDLING - Route to LiveKit Agents
// ============================================================================

/**
 * TwiML response to forward incoming calls to LiveKit SIP
 *
 * Set this URL as the webhook for your Twilio phone number:
 * https://your-server.com/api/incoming-call
 */
export function generateIncomingCallTwiml(options?: {
  greeting?: string;
  agentRoom?: string;
}): string {
  const greeting =
    options?.greeting || "Hello! You've reached the AI assistant team. Let me connect you.";

  if (LIVEKIT_URL && SIP_TRUNK_ID) {
    // Forward to LiveKit SIP trunk
    // The SIP URI would be configured in your LiveKit dashboard
    const sipUri = `sip:agent@${new URL(LIVEKIT_URL).hostname}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Pause length="1"/>
  <Dial>
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;
  } else {
    // No LiveKit SIP configured - provide a message
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(greeting)}</Say>
  <Say voice="Polly.Joanna">I'm sorry, but our voice assistant is not available for incoming calls right now. Please try again later or reach out through our website.</Say>
</Response>`;
  }
}

/**
 * Configure Twilio phone number webhook for incoming calls
 */
export async function configureIncomingCallWebhook(
  webhookUrl: string
): Promise<{ success: boolean; message: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { success: false, message: 'Twilio not configured' };
  }

  try {
    // First, get the phone number SID
    const listResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(TWILIO_PHONE_NUMBER)}`,
      {
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
        },
      }
    );

    if (!listResponse.ok) {
      return { success: false, message: 'Failed to find phone number' };
    }

    const listData = (await listResponse.json()) as {
      incoming_phone_numbers: Array<{ sid: string }>;
    };
    const phoneNumberSid = listData.incoming_phone_numbers?.[0]?.sid;

    if (!phoneNumberSid) {
      return { success: false, message: 'Phone number not found in account' };
    }

    // Update the phone number with the webhook
    const updateResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          VoiceUrl: webhookUrl,
          VoiceMethod: 'POST',
        }),
      }
    );

    if (updateResponse.ok) {
      getLogger().info({ webhookUrl }, '✅ Incoming call webhook configured');
      return {
        success: true,
        message: `Incoming calls to ${TWILIO_PHONE_NUMBER} will now go to ${webhookUrl}`,
      };
    } else {
      const error = await updateResponse.text();
      return { success: false, message: `Failed to update webhook: ${error}` };
    }
  } catch (error) {
    return { success: false, message: `Error: ${error}` };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateAlexVoice,
  callWithAlexVoice,
  generateIncomingCallTwiml,
  configureIncomingCallWebhook,
};
