/**
 * LiveKit token generation and room management
 */

import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import type { RoomMetadata, TokenOptions } from '../shared/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LiveKitToken' });

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
    log.error(
      'Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
    );
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
  if (agentDispatch === null) {
    try {
      agentDispatch = new AgentDispatchClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    } catch {
      log.warn('AgentDispatchClient not available - using room creation only');
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

  return token.toJwt();
}

/**
 * Outcome of creating a room and dispatching the voice agent into it.
 * `agentDispatched: false` means no agent will join: the named agent is only
 * ever sent by explicit dispatch, so callers must not report the call as ready.
 */
export interface RoomDispatchResult {
  roomReady: boolean;
  agentDispatched: boolean;
}

/**
 * Create room and dispatch agent
 */
export async function createRoomWithAgent(
  roomName: string,
  metadata: RoomMetadata,
  emptyTimeout = 60,
  maxParticipants = 10
): Promise<RoomDispatchResult> {
  try {
    await getRoomService().createRoom({
      name: roomName,
      emptyTimeout,
      maxParticipants,
      metadata: JSON.stringify(metadata),
    });
    log.info(
      {
        roomName,
        firebaseUid: metadata.firebase_uid || 'none',
        deviceId: metadata.device_id || 'anonymous',
      },
      'Room created'
    );
  } catch (error) {
    const err = error as Error;
    // Room might already exist, which is fine: the agent still needs dispatching.
    if (!err.message?.includes('already exists')) {
      log.error({ error: err.message, roomName }, 'Error creating room');
      return { roomReady: false, agentDispatched: false };
    }
    log.debug({ roomName }, 'Room already exists');
  }

  return { roomReady: true, agentDispatched: await dispatchAgent(roomName, metadata) };
}

/**
 * Explicitly dispatch the voice agent. The worker registers with an agent name,
 * so LiveKit never auto-dispatches it: a failure here means the caller hears silence.
 */
async function dispatchAgent(roomName: string, metadata: RoomMetadata): Promise<boolean> {
  const dispatch = getAgentDispatch();
  if (!dispatch) {
    log.error({ roomName, agentName: AGENT_NAME }, 'Agent dispatch client unavailable');
    return false;
  }
  try {
    await dispatch.createDispatch(roomName, AGENT_NAME, { metadata: JSON.stringify(metadata) });
    log.info({ agentName: AGENT_NAME, roomName }, 'Agent dispatched');
    return true;
  } catch (dispatchError) {
    log.error(
      { error: (dispatchError as Error).message, agentName: AGENT_NAME, roomName },
      'Agent dispatch failed'
    );
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
): Promise<RoomDispatchResult> {
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
