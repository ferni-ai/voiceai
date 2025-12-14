/**
 * Video Sessions API Routes
 *
 * API endpoints for multi-modal video session functionality:
 * - GET /api/video/capabilities - Get video capabilities
 * - GET /api/video/state - Get current session state
 * - POST /api/video/enable - Enable video
 * - POST /api/video/disable - Disable video
 * - POST /api/video/screen-share/start - Start screen sharing
 * - POST /api/video/screen-share/stop - Stop screen sharing
 * - POST /api/video/mode - Set display mode
 * - POST /api/video/recording/start - Start recording
 * - POST /api/video/recording/stop - Stop recording
 *
 * @module VideoSessionsRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';

import { getVideoSession, removeVideoSession } from '../../services/video-sessions/index.js';
import type { VideoMode, VideoSessionConfig } from '../../services/video-sessions/types.js';
import { parseBody, requireUserId, sendError, sendJSON } from '../helpers.js';

/**
 * Handle video session routes
 */
export async function handleVideoSessionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/video/* routes
  if (!pathname.startsWith('/api/video')) {
    return false;
  }

  const method = req.method?.toUpperCase();
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return true;

  try {
    // GET /api/video/capabilities
    if (pathname === '/api/video/capabilities' && method === 'GET') {
      const session = getVideoSession(userId);
      const capabilities = session.getCapabilities();

      sendJSON(res, {
        success: true,
        capabilities,
      });
      return true;
    }

    // GET /api/video/state
    if (pathname === '/api/video/state' && method === 'GET') {
      const session = getVideoSession(userId);
      const state = session.getState();
      const config = session.getConfig();

      sendJSON(res, {
        success: true,
        state,
        config,
      });
      return true;
    }

    // POST /api/video/enable
    if (pathname === '/api/video/enable' && method === 'POST') {
      const body = (await parseBody(req)) as { quality?: VideoSessionConfig['videoQuality'] };
      const session = getVideoSession(userId, { enableVideo: true });

      if (body.quality) {
        session.updateConfig({ videoQuality: body.quality });
      }

      const result = session.enableVideo();

      sendJSON(res, {
        success: result.success,
        trackId: result.trackId,
        error: result.error,
      });
      return true;
    }

    // POST /api/video/disable
    if (pathname === '/api/video/disable' && method === 'POST') {
      const session = getVideoSession(userId);
      session.disableVideo();

      sendJSON(res, { success: true });
      return true;
    }

    // POST /api/video/screen-share/start
    if (pathname === '/api/video/screen-share/start' && method === 'POST') {
      const session = getVideoSession(userId, { enableScreenShare: true });
      const result = session.startScreenShare();

      sendJSON(res, {
        success: result.success,
        trackId: result.trackId,
        error: result.error,
      });
      return true;
    }

    // POST /api/video/screen-share/stop
    if (pathname === '/api/video/screen-share/stop' && method === 'POST') {
      const session = getVideoSession(userId);
      session.stopScreenShare();

      sendJSON(res, { success: true });
      return true;
    }

    // POST /api/video/mode
    if (pathname === '/api/video/mode' && method === 'POST') {
      const body = (await parseBody(req)) as { mode: VideoMode };

      if (!body.mode) {
        sendError(res, 'mode is required', 400);
        return true;
      }

      const validModes: VideoMode[] = ['avatar', 'video', 'hybrid', 'screen-share'];
      if (!validModes.includes(body.mode)) {
        sendError(res, `Invalid mode. Valid modes: ${validModes.join(', ')}`, 400);
        return true;
      }

      const session = getVideoSession(userId);
      session.setHybridMode(body.mode === 'hybrid');

      sendJSON(res, {
        success: true,
        mode: session.getState().mode,
      });
      return true;
    }

    // POST /api/video/recording/start
    if (pathname === '/api/video/recording/start' && method === 'POST') {
      const session = getVideoSession(userId, { enableRecording: true });
      const result = session.startRecording();

      sendJSON(res, {
        success: result.success,
        recordingId: result.recordingId,
        error: result.error,
      });
      return true;
    }

    // POST /api/video/recording/stop
    if (pathname === '/api/video/recording/stop' && method === 'POST') {
      const session = getVideoSession(userId);
      const result = session.stopRecording();

      sendJSON(res, {
        success: result.success,
        url: result.url,
      });
      return true;
    }

    // POST /api/video/config
    if (pathname === '/api/video/config' && method === 'POST') {
      const body = (await parseBody(req)) as Partial<VideoSessionConfig>;
      const session = getVideoSession(userId);
      session.updateConfig(body);

      sendJSON(res, {
        success: true,
        config: session.getConfig(),
      });
      return true;
    }

    // DELETE /api/video/session
    if (pathname === '/api/video/session' && method === 'DELETE') {
      removeVideoSession(userId);

      sendJSON(res, { success: true });
      return true;
    }

    // Route not handled by this module
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, errorMessage, 500);
    return true;
  }
}
