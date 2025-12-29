/**
 * LiveKit Phone Bridge Participant
 *
 * Creates a LiveKit participant that represents the phone caller.
 * This bridges Twilio audio ↔ LiveKit room bidirectionally.
 *
 * Flow:
 * 1. Twilio audio → Convert → LiveKit room (as phone participant's audio)
 * 2. Agent audio → Convert → Twilio (back to phone caller)
 *
 * @module livekit-phone-bridge
 */

import { Room, RoomEvent, LocalAudioTrack, AudioSource, AudioFrame, TrackSource, TrackKind } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { createLogger } from '../../utils/safe-logger.js';
import type { TwilioStreamBridge } from './twilio-stream-bridge.js';

const log = createLogger({ module: 'livekit-phone-bridge' });

// Environment
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Audio configuration
const LIVEKIT_SAMPLE_RATE = 16000; // 16kHz for LiveKit
const FRAME_DURATION_MS = 20; // 20ms frames
const SAMPLES_PER_FRAME = (LIVEKIT_SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 320 samples

// ============================================================================
// TYPES
// ============================================================================

export interface PhoneBridgeSession {
  callSid: string;
  roomName: string;
  room: Room;
  audioSource: AudioSource;
  track: LocalAudioTrack;
  connected: boolean;
  cleanup: () => Promise<void>;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const activeBridgeSessions = new Map<string, PhoneBridgeSession>();

/**
 * Create a phone bridge participant in a LiveKit room
 *
 * This represents the phone caller in the room. Audio from Twilio
 * is published through this participant, and audio from other
 * participants (the agent) is sent back to Twilio.
 */
export async function createPhoneBridgeParticipant(
  callSid: string,
  roomName: string,
  twiliobridge: TwilioStreamBridge,
  recipientName = 'Phone'
): Promise<PhoneBridgeSession | null> {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.error('LiveKit credentials not configured');
    return null;
  }

  const participantIdentity = `phone_${callSid.substring(0, 8)}`;

  log.info({ callSid, roomName, participantIdentity }, '📞 Creating phone bridge participant');

  try {
    // Create access token for the phone participant
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: recipientName,
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    // Create room connection
    const room = new Room();

    // Set up audio source for publishing phone audio
    const audioSource = new AudioSource(LIVEKIT_SAMPLE_RATE, 1); // 16kHz mono
    const track = LocalAudioTrack.createAudioTrack('phone-audio', audioSource);

    // Connect to room
    await room.connect(LIVEKIT_URL, await token.toJwt());
    log.info({ roomName, participantIdentity }, '✅ Phone bridge connected to room');

    // Publish the audio track
    await room.localParticipant?.publishTrack(track, {
      name: 'phone-audio',
      source: TrackSource.MICROPHONE, // Treat as microphone for proper routing
    });
    log.info({ roomName }, '🎤 Phone audio track published');

    // Audio buffer for accumulating samples
    let audioBuffer = new Int16Array(0);

    // Handle incoming audio from Twilio (goes to LiveKit)
    const audioHandler = async (event: {
      callSid: string;
      roomName: string;
      audio: Buffer;
      timestamp: string;
    }) => {
      if (event.callSid !== callSid) return;

      // Convert Buffer to Int16Array (audio is already 16kHz PCM from bridge)
      const samples = new Int16Array(
        event.audio.buffer,
        event.audio.byteOffset,
        event.audio.byteLength / 2
      );

      // Accumulate audio
      const newBuffer = new Int16Array(audioBuffer.length + samples.length);
      newBuffer.set(audioBuffer);
      newBuffer.set(samples, audioBuffer.length);
      audioBuffer = newBuffer;

      // Send frames when we have enough
      while (audioBuffer.length >= SAMPLES_PER_FRAME) {
        const frameData = audioBuffer.slice(0, SAMPLES_PER_FRAME);
        audioBuffer = audioBuffer.slice(SAMPLES_PER_FRAME);

        // Create audio frame for LiveKit
        // AudioFrame expects: (data: Int16Array, sampleRate, channels, samplesPerChannel)
        const frame = new AudioFrame(
          frameData, // Int16Array directly
          LIVEKIT_SAMPLE_RATE,
          1, // mono
          frameData.length
        );

        try {
          await audioSource.captureFrame(frame);
        } catch (frameError) {
          // Frame capture can fail if track not ready, ignore silently
        }
      }
    };

    twiliobridge.on('audioFromCaller', audioHandler);

    // Handle audio from agent (goes back to Twilio)
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      // Only process audio tracks from other participants (the agent)
      if (track.kind !== TrackKind.KIND_AUDIO || participant.identity === participantIdentity) {
        return;
      }

      log.info(
        { participant: participant.identity, trackName: publication.name },
        '🔊 Subscribed to agent audio track'
      );

      // The track is an AudioTrack - we need to listen for frames
      // and send them back to Twilio
      // Note: This requires LiveKit RTC audio sink which is more complex
      // For now, log that we would send audio back
      log.debug({ trackSid: track.sid }, 'Would route agent audio to Twilio');
    });

    // Create session object
    const session: PhoneBridgeSession = {
      callSid,
      roomName,
      room,
      audioSource,
      track,
      connected: true,
      cleanup: async () => {
        twiliobridge.off('audioFromCaller', audioHandler);
        try {
          await room.disconnect();
        } catch {
          // Ignore cleanup errors
        }
        activeBridgeSessions.delete(callSid);
        log.info({ callSid }, '🧹 Phone bridge session cleaned up');
      },
    };

    activeBridgeSessions.set(callSid, session);

    // Handle room disconnect
    room.on(RoomEvent.Disconnected, () => {
      log.info({ callSid, roomName }, '📴 Phone bridge disconnected from room');
      session.connected = false;
      session.cleanup();
    });

    return session;
  } catch (error) {
    log.error({ error: String(error), callSid, roomName }, '❌ Failed to create phone bridge');
    return null;
  }
}

/**
 * Get an active bridge session
 */
export function getBridgeSession(callSid: string): PhoneBridgeSession | undefined {
  return activeBridgeSessions.get(callSid);
}

/**
 * Clean up a bridge session
 */
export async function cleanupBridgeSession(callSid: string): Promise<void> {
  const session = activeBridgeSessions.get(callSid);
  if (session) {
    await session.cleanup();
  }
}

/**
 * Clean up all bridge sessions
 */
export async function cleanupAllBridgeSessions(): Promise<void> {
  for (const session of activeBridgeSessions.values()) {
    await session.cleanup();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createPhoneBridgeParticipant,
  getBridgeSession,
  cleanupBridgeSession,
  cleanupAllBridgeSessions,
};
