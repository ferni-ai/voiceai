/**
 * Voice Synthesis for Outreach
 *
 * Generates personalized voice messages using Cartesia TTS
 * for voicemails and voice-based outreach.
 *
 * Each persona has their own voice and speaking style.
 */
import { Storage } from '@google-cloud/storage';
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger().child({ module: 'outreach-voice-synthesis' });
// ============================================================================
// PERSONA VOICE PROFILES
// ============================================================================
// Voice IDs MUST match config/cartesia-config.ts and .env
// These are the SAME voices used in the main voice agent
const PERSONA_VOICES = {
    ferni: {
        voiceId: process.env.FERNI_VOICE_ID ||
            process.env.JACK_B_VOICE_ID ||
            'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
        speed: 0.95,
        emotion: 'warm',
    },
    maya: {
        voiceId: process.env.MAYA_SANTOS_VOICE_ID ||
            process.env.SPEND_SAVE_VOICE_ID ||
            '11175483-5332-496c-8c01-ca527ce04e4a',
        speed: 1.0,
        emotion: 'encouraging',
    },
    peter: {
        voiceId: process.env.PETER_JOHN_VOICE_ID ||
            process.env.JACK_BOGLE_VOICE_ID ||
            '3f04e815-3260-4f50-8fd9-af9c657be4c2',
        speed: 1.05,
        emotion: 'curious',
    },
    alex: {
        voiceId: process.env.ALEX_CHEN_VOICE_ID ||
            process.env.COMM_SPECIALIST_VOICE_ID ||
            '81c164d9-7baa-419d-9f9a-6b18100a01ee',
        speed: 1.0,
        emotion: 'professional',
    },
    jordan: {
        voiceId: process.env.JORDAN_TAYLOR_VOICE_ID ||
            process.env.EVENT_PLANNER_VOICE_ID ||
            'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
        speed: 1.1,
        emotion: 'excited',
    },
    nayan: {
        voiceId: process.env.NAYAN_PATEL_VOICE_ID ||
            process.env.NAYAN_VOICE_ID ||
            '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',
        speed: 0.9,
        emotion: 'calm',
    },
};
// ============================================================================
// STATE
// ============================================================================
let config = null;
let gcsClient = null;
// ============================================================================
// INITIALIZATION
// ============================================================================
/**
 * Initialize voice synthesis with Cartesia and GCS credentials
 */
export function initializeVoiceSynthesis(synthesisConfig) {
    config = synthesisConfig;
    try {
        gcsClient = new Storage({ projectId: config.gcsProjectId });
        log.info('✅ Voice synthesis initialized');
    }
    catch (error) {
        log.error({ error }, 'Failed to initialize GCS client');
    }
}
/**
 * Check if voice synthesis is available
 */
export function isVoiceSynthesisAvailable() {
    return config !== null && config.cartesiaApiKey !== '';
}
// ============================================================================
// VOICE GENERATION
// ============================================================================
/**
 * Generate a voice message using Cartesia TTS
 */
export async function generateVoiceMessage(params) {
    if (!isVoiceSynthesisAvailable()) {
        log.warn('Voice synthesis not available - missing configuration');
        return null;
    }
    const { text, personaId, userId } = params;
    const voiceProfile = PERSONA_VOICES[personaId] || PERSONA_VOICES.ferni;
    try {
        // Generate audio with Cartesia
        const audioBuffer = await synthesizeWithCartesia(text, voiceProfile);
        if (!audioBuffer) {
            log.error({ personaId }, 'Failed to generate audio');
            return null;
        }
        // Upload to GCS for public access
        const audioUrl = await uploadToGCS(audioBuffer, userId, personaId);
        if (!audioUrl) {
            log.error({ personaId }, 'Failed to upload audio');
            return null;
        }
        // Estimate duration (roughly 150 words per minute)
        const wordCount = text.split(' ').length;
        const duration = Math.ceil((wordCount / 150) * 60);
        return {
            audioUrl,
            duration,
            transcript: text,
            personaId,
        };
    }
    catch (error) {
        log.error({ error, personaId }, 'Voice generation failed');
        return null;
    }
}
/**
 * Synthesize speech using Cartesia API
 */
async function synthesizeWithCartesia(text, voiceProfile) {
    if (!config?.cartesiaApiKey) {
        return null;
    }
    try {
        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
            method: 'POST',
            headers: {
                'X-API-Key': config.cartesiaApiKey,
                'Cartesia-Version': '2024-06-10',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model_id: 'sonic-english',
                transcript: text,
                voice: {
                    mode: 'id',
                    id: voiceProfile.voiceId,
                },
                output_format: {
                    container: 'mp3',
                    encoding: 'mp3',
                    sample_rate: 44100,
                },
                language: 'en',
                ...(voiceProfile.speed !== 1.0 && {
                    voice_experimental_controls: {
                        speed: voiceProfile.speed,
                    },
                }),
                ...(voiceProfile.emotion && {
                    voice_experimental_controls: {
                        emotion: [voiceProfile.emotion],
                    },
                }),
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            log.error({ status: response.status, error: errorText }, 'Cartesia API error');
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    catch (error) {
        log.error({ error }, 'Cartesia synthesis failed');
        return null;
    }
}
/**
 * Upload audio to Google Cloud Storage
 */
async function uploadToGCS(audioBuffer, userId, personaId) {
    if (!gcsClient || !config?.gcsBucketName) {
        return null;
    }
    try {
        const filename = `outreach-voice/${userId}/${personaId}-${Date.now()}.mp3`;
        const bucket = gcsClient.bucket(config.gcsBucketName);
        const file = bucket.file(filename);
        await file.save(audioBuffer, {
            contentType: 'audio/mpeg',
            metadata: {
                cacheControl: 'public, max-age=86400', // 1 day cache
            },
        });
        // Make the file publicly accessible
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${config.gcsBucketName}/${filename}`;
        log.debug({ publicUrl, size: audioBuffer.length }, 'Uploaded voice message to GCS');
        return publicUrl;
    }
    catch (error) {
        log.error({ error }, 'GCS upload failed');
        return null;
    }
}
// ============================================================================
// VOICEMAIL GENERATION
// ============================================================================
/**
 * Generate a voicemail message for a missed call
 */
export async function generateVoicemail(params) {
    const { personaId, userId, userName, context, originalMessage } = params;
    // Build the voicemail script based on persona
    const script = buildVoicemailScript(personaId, userName, context, originalMessage);
    return generateVoiceMessage({
        text: script,
        personaId,
        userId,
    });
}
/**
 * Build a voicemail script in the persona's voice
 */
function buildVoicemailScript(personaId, userName, context, originalMessage) {
    const name = userName || 'there';
    const shortMessage = originalMessage.length > 80 ? `${originalMessage.substring(0, 80)}...` : originalMessage;
    const scripts = {
        ferni: `Hey ${name}! It's Ferni. I was thinking about you and wanted to check in about ${context}. ${shortMessage}. No rush to call back - I'll send you a text so you can respond when you have time. Take care of yourself!`,
        maya: `Hi ${name}! Maya here. Quick check-in about ${context}. ${shortMessage}. I'll follow up with a text - no pressure! You've got this!`,
        peter: `Hey ${name}! Peter here. Found something related to ${context} that I wanted to share. ${shortMessage}. I'll send you the details via text. Talk soon!`,
        alex: `Hi ${name}! It's Alex. Quick update on ${context}. ${shortMessage}. I'll text you the details. Best!`,
        jordan: `Hey ${name}! Jordan here! Got some exciting news about ${context}! ${shortMessage}. I'll text you - can't wait to chat!`,
        nayan: `Hello ${name}. Nayan here. I've been thinking about our conversation regarding ${context}. ${shortMessage}. I'll send you a message. Take good care.`,
    };
    return scripts[personaId] || scripts.ferni;
}
// ============================================================================
// GREETING GENERATION
// ============================================================================
/**
 * Generate a call greeting audio
 */
export async function generateCallGreeting(params) {
    const { personaId, userId, userName, context } = params;
    const greeting = buildCallGreeting(personaId, userName, context);
    return generateVoiceMessage({
        text: greeting,
        personaId,
        userId,
    });
}
/**
 * Build a call greeting script
 */
function buildCallGreeting(personaId, userName, context) {
    const name = userName || 'there';
    const greetings = {
        ferni: `Hey ${name}! It's Ferni. Got a minute? I was thinking about ${context} and wanted to connect.`,
        maya: `Hi ${name}! Maya here. Quick check-in about ${context}. How are things going?`,
        peter: `Hey ${name}! Peter here. I discovered something interesting about ${context} and had to share.`,
        alex: `Hi ${name}! It's Alex. I wanted to touch base about ${context}. Do you have a moment?`,
        jordan: `Hey ${name}! Jordan here! I'm so excited to talk to you about ${context}!`,
        nayan: `Hello ${name}. Nayan here. I hope I'm not interrupting your quiet. I wanted to connect about ${context}.`,
    };
    return greetings[personaId] || greetings.ferni;
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Delete old voice messages from GCS
 * Call this periodically to manage storage costs
 */
export async function cleanupOldVoiceMessages(maxAgeDays = 7) {
    if (!gcsClient || !config?.gcsBucketName) {
        return 0;
    }
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - maxAgeDays);
        const [files] = await gcsClient.bucket(config.gcsBucketName).getFiles({
            prefix: 'outreach-voice/',
        });
        let deleted = 0;
        for (const file of files) {
            const [metadata] = await file.getMetadata();
            const { timeCreated } = metadata;
            if (!timeCreated)
                continue;
            const created = new Date(timeCreated);
            if (created < cutoff) {
                await file.delete();
                deleted++;
            }
        }
        log.info({ deleted, maxAgeDays }, 'Cleaned up old voice messages');
        return deleted;
    }
    catch (error) {
        log.error({ error }, 'Voice message cleanup failed');
        return 0;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const voiceSynthesis = {
    initialize: initializeVoiceSynthesis,
    isAvailable: isVoiceSynthesisAvailable,
    generateMessage: generateVoiceMessage,
    generateVoicemail,
    generateGreeting: generateCallGreeting,
    cleanup: cleanupOldVoiceMessages,
};
export default voiceSynthesis;
//# sourceMappingURL=voice-synthesis.js.map