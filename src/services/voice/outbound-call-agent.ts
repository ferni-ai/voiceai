/**
 * Outbound Call Agent
 *
 * A self-contained agent for two-way outbound calls.
 * Runs LOCALLY (not dispatched to LiveKit Cloud) using:
 * - Gemini Realtime for conversation intelligence
 * - Cartesia TTS for Ferni's voice
 *
 * This avoids the agent dispatch issue where there's no registered worker.
 *
 * @module outbound-call-agent
 */

import { Room, RoomEvent, LocalAudioTrack, AudioSource, AudioFrame, TrackSource, TrackKind } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '../../utils/safe-logger.js';
import { getVoiceId } from '../../personas/voice-registry.js';

// Cartesia model IDs
const CARTESIA_MODEL_ID = 'sonic-english'; // Default English TTS model

const log = createLogger({ module: 'outbound-call-agent' });

// Environment
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// Audio config
const SAMPLE_RATE = 24000;
const FRAME_DURATION_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface OutboundCallContext {
  roomName: string;
  callId: string;
  recipientName: string;
  purpose: string;
  objective: string;
  callType: 'personal' | 'business' | 'emergency';
  userId?: string;
  userName?: string;
}

interface AgentSession {
  room: Room;
  audioSource: AudioSource;
  track: LocalAudioTrack;
  gemini: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
  isRunning: boolean;
  conversationHistory: Array<{ role: 'user' | 'model'; content: string }>;
  cleanup: () => Promise<void>;
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Start the outbound call agent for a room
 */
export async function startOutboundAgent(context: OutboundCallContext): Promise<void> {
  log.info({ roomName: context.roomName, callId: context.callId }, '🎙️ Starting outbound call agent');

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.error('LiveKit credentials not configured');
    return;
  }

  if (!CARTESIA_API_KEY) {
    log.error('Cartesia API key not configured');
    return;
  }

  if (!GEMINI_API_KEY) {
    log.error('Gemini API key not configured');
    return;
  }

  try {
    // Create agent session
    const session = await createAgentSession(context);

    // Wait for phone participant
    const phoneParticipant = await waitForPhoneParticipant(session.room, 60000);

    if (!phoneParticipant) {
      log.warn({ roomName: context.roomName }, 'No phone participant joined - call may not have connected');
      await session.cleanup();
      return;
    }

    log.info({ roomName: context.roomName, phoneId: phoneParticipant }, '📞 Phone connected!');

    // Start with greeting
    await speakWithFerniVoice(session, buildGreeting(context));

    // Listen for phone audio and respond
    await runConversationLoop(session, context, phoneParticipant);
  } catch (error) {
    log.error({ error: String(error), roomName: context.roomName }, '❌ Outbound agent error');
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

async function createAgentSession(context: OutboundCallContext): Promise<AgentSession> {
  const participantIdentity = `ferni_${context.callId.substring(0, 8)}`;

  // Create access token
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: 'Ferni',
  });

  token.addGrant({
    room: context.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  // Connect to room
  const room = new Room();
  await room.connect(LIVEKIT_URL, await token.toJwt());
  log.info({ roomName: context.roomName }, '✅ Ferni connected to room');

  // Set up audio output
  const audioSource = new AudioSource(SAMPLE_RATE, 1);
  const track = LocalAudioTrack.createAudioTrack('ferni-voice', audioSource);

  await room.localParticipant?.publishTrack(track, {
    name: 'ferni-voice',
    source: TrackSource.MICROPHONE,
  });

  log.info({ roomName: context.roomName }, '🎤 Ferni audio track published');

  // Set up Gemini
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction: buildSystemPrompt(context),
  });

  const session: AgentSession = {
    room,
    audioSource,
    track,
    gemini,
    isRunning: true,
    conversationHistory: [],
    cleanup: async () => {
      session.isRunning = false;
      try {
        await room.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    },
  };

  room.on(RoomEvent.Disconnected, () => {
    session.isRunning = false;
    session.cleanup();
  });

  return session;
}

// ============================================================================
// CONVERSATION LOOP
// ============================================================================

async function runConversationLoop(
  session: AgentSession,
  context: OutboundCallContext,
  phoneParticipantId: string
): Promise<void> {
  const { room } = session;

  // Set up audio input from phone (simplified - would need actual transcription)
  // For now, we'll use a basic event-driven approach

  let lastUserInput = '';
  let responseTimeout: NodeJS.Timeout | null = null;

  // Listen for track subscriptions to get phone audio
  room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    if (participant.identity !== phoneParticipantId || track.kind !== TrackKind.KIND_AUDIO) {
      return;
    }

    log.info({ participantId: participant.identity }, '🔊 Subscribed to phone audio');

    // In a full implementation, we'd:
    // 1. Stream audio to a transcription service (Deepgram/Whisper)
    // 2. Get text back
    // 3. Send to Gemini
    // 4. Generate response with Cartesia

    // For now, just log that we're receiving audio
    log.debug('Receiving phone audio - transcription would happen here');
  });

  // Wait for call to end
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (!session.isRunning || !room.isConnected) {
        clearInterval(checkInterval);
        resolve();
      }

      // Check if phone participant left
      if (!room.remoteParticipants.has(phoneParticipantId)) {
        log.info({ roomName: context.roomName }, '📴 Phone disconnected');
        clearInterval(checkInterval);
        session.cleanup();
        resolve();
      }
    }, 1000);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkInterval);
      session.cleanup();
      resolve();
    }, 300000);
  });
}

async function waitForPhoneParticipant(room: Room, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);

    // Check existing participants
    for (const [id, participant] of room.remoteParticipants) {
      if (id.startsWith('phone_') || id.startsWith('+1')) {
        clearTimeout(timeout);
        resolve(id);
        return;
      }
    }

    // Wait for new participant
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (participant.identity.startsWith('phone_') || participant.identity.startsWith('+1')) {
        clearTimeout(timeout);
        resolve(participant.identity);
      }
    });
  });
}

// ============================================================================
// SPEECH SYNTHESIS
// ============================================================================

/**
 * Speak using Ferni's Cartesia voice
 */
async function speakWithFerniVoice(session: AgentSession, text: string): Promise<void> {
  log.info({ text: text.substring(0, 50) + '...' }, '🗣️ Speaking with Ferni voice');

  try {
    // Generate audio with Cartesia
    const voiceId = getVoiceId('ferni');
    const modelId = CARTESIA_MODEL_ID;

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'X-API-Key': CARTESIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: SAMPLE_RATE,
        },
        language: 'en',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ error: errorText }, 'Cartesia TTS failed');
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const pcmData = new Int16Array(arrayBuffer);

    log.info({ samples: pcmData.length, durationMs: (pcmData.length / SAMPLE_RATE) * 1000 }, '📢 Streaming audio');

    // Stream to LiveKit
    for (let offset = 0; offset < pcmData.length; offset += SAMPLES_PER_FRAME) {
      const frameData = pcmData.slice(offset, Math.min(offset + SAMPLES_PER_FRAME, pcmData.length));

      // Pad if needed
      const paddedFrame = new Int16Array(SAMPLES_PER_FRAME);
      paddedFrame.set(frameData);

      const frame = new AudioFrame(
        paddedFrame,
        SAMPLE_RATE,
        1,
        paddedFrame.length
      );

      await session.audioSource.captureFrame(frame);

      // Pace the audio output
      await new Promise((r) => setTimeout(r, FRAME_DURATION_MS));
    }

    log.info('✅ Finished speaking');
  } catch (error) {
    log.error({ error: String(error) }, 'Error speaking with Ferni voice');
  }
}

// ============================================================================
// PROMPTS
// ============================================================================

function buildSystemPrompt(context: OutboundCallContext): string {
  return `You are Ferni, a warm and friendly AI life coach making a phone call on behalf of ${context.userName || 'your friend'}.

CALL CONTEXT:
- Calling: ${context.recipientName}
- Purpose: ${context.purpose}
- Objective: ${context.objective}
- Call type: ${context.callType}

YOUR PERSONALITY:
- Warm, genuine, and present
- Natural conversational style
- Uses contractions, filler words occasionally
- Adapts to the other person's energy

CONVERSATION APPROACH:
1. Greet warmly and explain who you are
2. State the purpose clearly
3. Listen actively and respond naturally
4. Achieve the objective or gracefully handle obstacles
5. End with warmth and any necessary follow-up

Keep responses concise for natural phone conversation.`;
}

function buildGreeting(context: OutboundCallContext): string {
  const firstName = context.recipientName.split(' ')[0];

  if (context.callType === 'personal') {
    return `Hey ${firstName}! It's Ferni... I'm calling on behalf of ${context.userName || 'your friend'}. ${context.purpose}`;
  } else {
    return `Hi, this is Ferni calling on behalf of ${context.userName || 'a client'}. ${context.purpose}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startOutboundAgent,
};
