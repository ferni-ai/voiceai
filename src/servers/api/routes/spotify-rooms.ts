/**
 * Spotify Rooms API Routes
 *
 * CRUD operations for room configurations and device discovery.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  createRoom,
  deleteRoom,
  getRoomConfig,
  setDefaultRoom,
  updateRoom,
  createRoomGroup,
  deleteRoomGroup,
} from '../../../services/identity/spotify-room-config-store.js';
import { discoverDevices } from '../../../services/identity/spotify-room-service.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'spotify-rooms-routes' });

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => {
      resolve(null);
    });
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleSpotifyRoomsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Require authentication for all routes
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Authentication required');
    return true;
  }

  // ============================================================================
  // GET /api/spotify/devices - Discover Spotify devices
  // ============================================================================
  if (pathname === '/api/spotify/devices' && req.method === 'GET') {
    const result = await discoverDevices();
    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to discover devices');
      return true;
    }
    sendJson(res, 200, { devices: result.data });
    return true;
  }

  // ============================================================================
  // GET /api/spotify/rooms - Get room configuration
  // ============================================================================
  if (pathname === '/api/spotify/rooms' && req.method === 'GET') {
    const result = await getRoomConfig(userId);
    if (!result.success) {
      sendError(res, 500, result.error || 'Failed to get room config');
      return true;
    }
    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // POST /api/spotify/rooms - Create a room
  // ============================================================================
  if (pathname === '/api/spotify/rooms' && req.method === 'POST') {
    const body = await parseBody<{
      name: string;
      deviceIds: string[];
      defaultVolume?: number;
      icon?: string;
    }>(req);

    if (!body || !body.name || !body.deviceIds || body.deviceIds.length === 0) {
      sendError(res, 400, 'name and deviceIds are required');
      return true;
    }

    const result = await createRoom(userId, {
      name: body.name,
      deviceIds: body.deviceIds,
      defaultVolume: body.defaultVolume,
      icon: body.icon as
        | 'living-room'
        | 'bedroom'
        | 'kitchen'
        | 'office'
        | 'bathroom'
        | 'outdoor'
        | 'custom',
    });

    if (!result.success) {
      sendError(res, 400, result.error || 'Failed to create room');
      return true;
    }

    log.info({ userId, roomId: result.data?.id, roomName: body.name }, 'Room created');
    sendJson(res, 201, result.data);
    return true;
  }

  // ============================================================================
  // PUT /api/spotify/rooms/default - Set default room
  // ============================================================================
  if (pathname === '/api/spotify/rooms/default' && req.method === 'PUT') {
    const body = await parseBody<{ roomId: string | null }>(req);
    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    const result = await setDefaultRoom(userId, body.roomId);
    if (!result.success) {
      sendError(res, 400, result.error || 'Failed to set default room');
      return true;
    }

    log.info({ userId, roomId: body.roomId }, 'Default room set');
    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // PUT /api/spotify/rooms/:id - Update a room
  // ============================================================================
  const roomUpdateMatch = pathname.match(/^\/api\/spotify\/rooms\/([a-f0-9-]+)$/);
  if (roomUpdateMatch && req.method === 'PUT') {
    const roomId = roomUpdateMatch[1];
    const body = await parseBody<{
      name?: string;
      deviceIds?: string[];
      defaultVolume?: number;
      icon?: string;
    }>(req);

    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    const result = await updateRoom(userId, {
      id: roomId,
      ...body,
      icon: body.icon as
        | 'living-room'
        | 'bedroom'
        | 'kitchen'
        | 'office'
        | 'bathroom'
        | 'outdoor'
        | 'custom',
    });

    if (!result.success) {
      sendError(
        res,
        result.error === 'Room not found' ? 404 : 400,
        result.error || 'Failed to update room'
      );
      return true;
    }

    log.info({ userId, roomId }, 'Room updated');
    sendJson(res, 200, result.data);
    return true;
  }

  // ============================================================================
  // DELETE /api/spotify/rooms/:id - Delete a room
  // ============================================================================
  if (roomUpdateMatch && req.method === 'DELETE') {
    const roomId = roomUpdateMatch[1];
    const result = await deleteRoom(userId, roomId);

    if (!result.success) {
      sendError(
        res,
        result.error === 'Room not found' ? 404 : 400,
        result.error || 'Failed to delete room'
      );
      return true;
    }

    log.info({ userId, roomId }, 'Room deleted');
    sendJson(res, 200, { success: true });
    return true;
  }

  // ============================================================================
  // POST /api/spotify/rooms/groups - Create a room group
  // ============================================================================
  if (pathname === '/api/spotify/rooms/groups' && req.method === 'POST') {
    const body = await parseBody<{
      name: string;
      roomIds: string[];
    }>(req);

    if (!body || !body.name || !body.roomIds || body.roomIds.length === 0) {
      sendError(res, 400, 'name and roomIds are required');
      return true;
    }

    const result = await createRoomGroup(userId, {
      name: body.name,
      roomIds: body.roomIds,
    });

    if (!result.success) {
      sendError(res, 400, result.error || 'Failed to create group');
      return true;
    }

    log.info({ userId, groupId: result.data?.id, groupName: body.name }, 'Room group created');
    sendJson(res, 201, result.data);
    return true;
  }

  // ============================================================================
  // DELETE /api/spotify/rooms/groups/:id - Delete a room group
  // ============================================================================
  const groupDeleteMatch = pathname.match(/^\/api\/spotify\/rooms\/groups\/([a-f0-9-]+)$/);
  if (groupDeleteMatch && req.method === 'DELETE') {
    const groupId = groupDeleteMatch[1];
    const result = await deleteRoomGroup(userId, groupId);

    if (!result.success) {
      sendError(
        res,
        result.error === 'Group not found' ? 404 : 400,
        result.error || 'Failed to delete group'
      );
      return true;
    }

    log.info({ userId, groupId }, 'Room group deleted');
    sendJson(res, 200, { success: true });
    return true;
  }

  // Not a Spotify rooms route
  return false;
}
