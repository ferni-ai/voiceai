/**
 * Group Coaching - LiveKit Integration
 *
 * Handles LiveKit multiparty room management for group coaching sessions:
 * - Room creation with session metadata
 * - Participant token generation
 * - Track management (mute/unmute)
 * - Room cleanup
 *
 * @module GroupCoachingLiveKit
 */

import { AccessToken, RoomServiceClient, DataPacket_Kind, TrackSource } from 'livekit-server-sdk';
import type { GroupSession, GroupParticipant, ParticipantRole } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GroupCoachingLiveKit' });

// Configuration from environment
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

// Convert WSS URL to HTTPS for API calls
const LIVEKIT_HOST = LIVEKIT_URL.replace('wss://', 'https://');

// Lazy-initialized room service
let roomService: RoomServiceClient | null = null;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Validate LiveKit configuration
 */
export function validateLiveKitConfig(): boolean {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.error('Missing LiveKit configuration for group coaching');
    return false;
  }
  return true;
}

/**
 * Get LiveKit URL for clients
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

// ============================================================================
// ROOM METADATA
// ============================================================================

export interface GroupRoomMetadata {
  session_type: string;
  session_id: string;
  host_user_id: string;
  max_participants: number;
  is_group_session: true;
  created_at: number;
}

/**
 * Build room metadata from session
 */
function buildRoomMetadata(session: GroupSession): GroupRoomMetadata {
  return {
    session_type: session.type,
    session_id: session.id,
    host_user_id: session.hostUserId,
    max_participants: session.config.maxParticipants,
    is_group_session: true,
    created_at: Date.now(),
  };
}

/**
 * Get LiveKit room name from session ID
 * Prefixes with 'group_' to distinguish from 1:1 sessions
 */
export function getRoomName(sessionId: string): string {
  return `group_${sessionId}`;
}

// ============================================================================
// ROOM LIFECYCLE
// ============================================================================

/**
 * Create a LiveKit room for a group session
 */
export async function createGroupRoom(session: GroupSession): Promise<{
  success: boolean;
  roomName: string;
  error?: string;
}> {
  if (!validateLiveKitConfig()) {
    return { success: false, roomName: '', error: 'LiveKit not configured' };
  }

  const roomName = getRoomName(session.id);
  const metadata = buildRoomMetadata(session);

  try {
    const service = getRoomService();

    await service.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes - shorter for group sessions
      maxParticipants: session.config.maxParticipants + 1, // +1 for Ferni agent
      metadata: JSON.stringify(metadata),
    });

    log.info(
      { roomName, sessionId: session.id, type: session.type },
      'Group coaching room created'
    );

    return { success: true, roomName };
  } catch (error) {
    const err = error as Error;

    // Room might already exist, which is fine
    if (err.message?.includes('already exists')) {
      log.debug({ roomName }, 'Group room already exists');
      return { success: true, roomName };
    }

    log.error({ error: err.message, roomName }, 'Failed to create group room');
    return { success: false, roomName, error: err.message };
  }
}

/**
 * Close a group coaching room
 */
export async function closeGroupRoom(sessionId: string): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    await service.deleteRoom(roomName);

    log.info({ roomName, sessionId }, 'Group coaching room closed');
    return true;
  } catch (error) {
    const err = error as Error;

    // Room might already be deleted
    if (err.message?.includes('not found')) {
      log.debug({ roomName }, 'Group room already deleted');
      return true;
    }

    log.error({ error: err.message, roomName }, 'Failed to close group room');
    return false;
  }
}

// ============================================================================
// TOKEN GENERATION
// ============================================================================

interface ParticipantTokenMetadata {
  user_id: string;
  display_name: string;
  role: ParticipantRole;
  session_id: string;
  session_type: string;
}

/**
 * Generate a LiveKit access token for a participant
 */
export async function generateParticipantToken(
  session: GroupSession,
  participant: GroupParticipant,
  ttl: string = '2h'
): Promise<string> {
  const roomName = getRoomName(session.id);

  const metadata: ParticipantTokenMetadata = {
    user_id: participant.userId,
    display_name: participant.displayName,
    role: participant.role,
    session_id: session.id,
    session_type: session.type,
  };

  // Determine permissions based on role
  const canPublish = participant.role !== 'observer';
  const canSubscribe = true;
  const canPublishData = participant.role === 'host' || participant.role === 'co-host';

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participant.userId,
    name: participant.displayName,
    ttl,
    metadata: JSON.stringify(metadata),
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe,
    canPublishData,
    // Host/co-host can manage other participants
    roomAdmin: participant.role === 'host' || participant.role === 'co-host',
  });

  const jwt = await token.toJwt();

  log.info(
    {
      sessionId: session.id,
      userId: participant.userId.substring(0, 8),
      role: participant.role,
    },
    'Generated group session token'
  );

  return jwt;
}

/**
 * Generate token for Ferni agent to join the group session
 */
export async function generateAgentToken(
  session: GroupSession,
  ttl: string = '4h'
): Promise<string> {
  const roomName = getRoomName(session.id);

  const metadata = {
    is_agent: true,
    agent_name: 'ferni',
    session_id: session.id,
    session_type: session.type,
  };

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'ferni-agent',
    name: 'Ferni',
    ttl,
    metadata: JSON.stringify(metadata),
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Agent has admin privileges to manage the session
    roomAdmin: true,
  });

  const jwt = await token.toJwt();

  log.info({ sessionId: session.id, roomName }, 'Generated agent token for group session');

  return jwt;
}

// ============================================================================
// PARTICIPANT MANAGEMENT
// ============================================================================

/**
 * Mute/unmute a participant's audio
 */
export async function setParticipantMute(
  sessionId: string,
  userId: string,
  muted: boolean
): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();

    // Get participant info to find their microphone track SID
    const participant = await service.getParticipant(roomName, userId);
    if (!participant) {
      log.warn({ sessionId, userId: userId.substring(0, 8) }, 'Participant not found in room');
      return false;
    }

    // Find the microphone track
    const micTrack = participant.tracks.find((t) => t.source === TrackSource.MICROPHONE);

    if (!micTrack) {
      log.warn({ sessionId, userId: userId.substring(0, 8) }, 'No microphone track found');
      return false;
    }

    await service.mutePublishedTrack(roomName, userId, micTrack.sid, muted);

    log.info({ sessionId, userId: userId.substring(0, 8), muted }, 'Participant mute updated');
    return true;
  } catch (error) {
    const err = error as Error;
    log.error(
      { error: err.message, sessionId, userId: userId.substring(0, 8) },
      'Failed to update participant mute'
    );
    return false;
  }
}

/**
 * Remove a participant from the room
 */
export async function removeParticipantFromRoom(
  sessionId: string,
  userId: string
): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    await service.removeParticipant(roomName, userId);

    log.info({ sessionId, userId: userId.substring(0, 8) }, 'Participant removed from room');
    return true;
  } catch (error) {
    const err = error as Error;
    log.error(
      { error: err.message, sessionId, userId: userId.substring(0, 8) },
      'Failed to remove participant'
    );
    return false;
  }
}

/**
 * Get list of participants currently in the room
 */
export async function getRoomParticipants(sessionId: string): Promise<string[]> {
  if (!validateLiveKitConfig()) {
    return [];
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    const participants = await service.listParticipants(roomName);

    return participants.map((p) => p.identity);
  } catch (error) {
    const err = error as Error;
    log.error({ error: err.message, sessionId }, 'Failed to list room participants');
    return [];
  }
}

// ============================================================================
// ROOM INFO
// ============================================================================

/**
 * Check if a group room exists
 */
export async function roomExists(sessionId: string): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    const rooms = await service.listRooms([roomName]);

    return rooms.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get room info for a session
 */
export async function getRoomInfo(sessionId: string): Promise<{
  exists: boolean;
  participantCount: number;
  metadata: GroupRoomMetadata | null;
}> {
  if (!validateLiveKitConfig()) {
    return { exists: false, participantCount: 0, metadata: null };
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    const rooms = await service.listRooms([roomName]);

    if (rooms.length === 0) {
      return { exists: false, participantCount: 0, metadata: null };
    }

    const room = rooms[0];
    let metadata: GroupRoomMetadata | null = null;

    try {
      metadata = JSON.parse(room.metadata || '{}') as GroupRoomMetadata;
    } catch {
      // Invalid metadata, ignore
    }

    return {
      exists: true,
      participantCount: room.numParticipants,
      metadata,
    };
  } catch (error) {
    const err = error as Error;
    log.error({ error: err.message, sessionId }, 'Failed to get room info');
    return { exists: false, participantCount: 0, metadata: null };
  }
}

// ============================================================================
// DATA MESSAGES
// ============================================================================

/**
 * Send a data message to all participants in the room
 */
export async function broadcastToRoom(
  sessionId: string,
  data: Record<string, unknown>,
  topic?: string
): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    const payload = new Uint8Array(Buffer.from(JSON.stringify(data)));

    await service.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
      topic,
    });

    log.debug({ sessionId, topic }, 'Broadcast sent to group room');
    return true;
  } catch (error) {
    const err = error as Error;
    log.error({ error: err.message, sessionId }, 'Failed to broadcast to room');
    return false;
  }
}

/**
 * Send a data message to specific participants
 */
export async function sendToParticipants(
  sessionId: string,
  userIds: string[],
  data: Record<string, unknown>,
  topic?: string
): Promise<boolean> {
  if (!validateLiveKitConfig()) {
    return false;
  }

  const roomName = getRoomName(sessionId);

  try {
    const service = getRoomService();
    const payload = new Uint8Array(Buffer.from(JSON.stringify(data)));

    await service.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
      destinationIdentities: userIds,
      topic,
    });

    log.debug({ sessionId, recipientCount: userIds.length, topic }, 'Data sent to participants');
    return true;
  } catch (error) {
    const err = error as Error;
    log.error({ error: err.message, sessionId }, 'Failed to send data to participants');
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  validateLiveKitConfig,
  getLiveKitUrl,
  getRoomName,
  createGroupRoom,
  closeGroupRoom,
  generateParticipantToken,
  generateAgentToken,
  setParticipantMute,
  removeParticipantFromRoom,
  getRoomParticipants,
  roomExists,
  getRoomInfo,
  broadcastToRoom,
  sendToParticipants,
};
