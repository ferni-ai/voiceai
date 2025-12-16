/**
 * LiveKit token generation and room management
 */

import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import type { RoomMetadata, TokenOptions } from '../shared/types.js';

// Configuration from environment
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

// Convert WSS URL to HTTPS for API calls
const LIVEKIT_HOST = LIVEKIT_URL.replace('wss://', 'https://');

// Lazy-initialized clients
let roomService: RoomServiceClient | null = null;
let agentDispatch: AgentDispatchClient | null = null;

/**
 * Validate LiveKit configuration
 */
export function validateConfig(): boolean {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing required environment variables:');
    console.error('   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
    return false;
  }
  return true;
}

/**
 * Get LiveKit URL
 */
export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

/**
 * Get or create RoomServiceClient
 */
function getRoomService(): RoomServiceClient {
  if (!roomService) {
    roomService = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return roomService;
}

/**
 * Get or create AgentDispatchClient
 */
function getAgentDispatch(): AgentDispatchClient | null {
  if (agentDispatch === undefined) {
    try {
      agentDispatch = new AgentDispatchClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    } catch {
      console.log('⚠️  AgentDispatchClient not available - using room creation only');
      agentDispatch = null;
    }
  }
  return agentDispatch;
}

/**
 * Create a LiveKit access token
 */
export async function createToken(options: TokenOptions): Promise<string> {
  const { roomName, participantName, metadata = {}, ttl = '10m' } = options;

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl,
    metadata: JSON.stringify(metadata),
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}

/**
 * Create room and dispatch agent
 */
export async function createRoomWithAgent(
  roomName: string,
  metadata: RoomMetadata,
  emptyTimeout = 60,
  maxParticipants = 10
): Promise<boolean> {
  try {
    const roomService = getRoomService();

    // Create the room
    await roomService.createRoom({
      name: roomName,
      emptyTimeout,
      maxParticipants,
      metadata: JSON.stringify(metadata),
    });

    console.log(
      `✅ Room created: ${roomName} (firebase: ${metadata.firebase_uid || 'none'}, device: ${metadata.device_id || 'anonymous'})`
    );

    // Try to dispatch agent if available
    const dispatch = getAgentDispatch();
    if (dispatch) {
      try {
        await dispatch.createDispatch(roomName, AGENT_NAME, {
          metadata: JSON.stringify(metadata),
        });
        console.log(`✅ Agent dispatched: ${AGENT_NAME} -> ${roomName}`);
      } catch (dispatchError) {
        const error = dispatchError as Error;
        console.log(`⚠️  Agent dispatch failed (may auto-dispatch): ${error.message}`);
      }
    }

    return true;
  } catch (error) {
    const err = error as Error;
    // Room might already exist, which is fine
    if (err.message?.includes('already exists')) {
      console.log(`ℹ️  Room already exists: ${roomName}`);
      return true;
    }
    console.error(`❌ Error creating room: ${err.message}`);
    return false;
  }
}

/**
 * Create a demo room with limited permissions
 */
export async function createDemoRoom(
  roomName: string,
  demoId: string,
  durationMinutes: number
): Promise<boolean> {
  const metadata: RoomMetadata = {
    persona_id: 'ferni',
    device_id: demoId,
    user_name: 'Visitor',
    is_demo: true,
    demo_started: Date.now(),
    demo_expires: Date.now() + durationMinutes * 60 * 1000,
    source: 'landing_page',
  };

  return createRoomWithAgent(
    roomName,
    metadata,
    durationMinutes * 60 + 30, // Session duration + buffer
    2 // Just visitor + agent
  );
}
