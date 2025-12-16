/**
 * Music Status Routes
 *
 * Music player status and diagnostics for the dev panel.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as spotifyService from '../services/spotify.js';

// Spotify configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

/**
 * Handle music status routes
 */
export async function handleMusicRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // Music player status - returns info about music system readiness
  if (pathname === '/api/music/status' && method === 'GET') {
    const refreshToken = spotifyService.getRefreshToken();
    const isSpotifyConfigured = !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
    const isSpotifyLinked = !!(refreshToken && isSpotifyConfigured);

    // Check iTunes API availability
    let itunesAvailable = false;
    try {
      const itunesCheck = await fetch(
        'https://itunes.apple.com/search?term=test&limit=1&media=music',
        { signal: AbortSignal.timeout(3000) }
      );
      itunesAvailable = itunesCheck.ok;
    } catch {
      itunesAvailable = false;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        // Note: Music player runs in voice agent, not UI server
        initialized: false,
        isPlaying: false,
        currentTrack: null,
        volume: 0.25,
        isDucked: false,
        isAmbient: false,
        queueLength: 0,
        itunesAvailable,
        spotifyStatus: {
          configured: isSpotifyConfigured,
          linked: isSpotifyLinked,
          accessToken: false,
          deviceConnected: !!spotifyService.getWebDeviceId(),
        },
        note: 'Music player runs in voice agent. This shows API availability only.',
      })
    );
    return true;
  }

  // Test iTunes API - search for a track
  if (pathname === '/api/music/test-itunes' && method === 'POST') {
    try {
      const testQuery = 'Beatles Yesterday';
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(testQuery)}&limit=1&media=music`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) {
        throw new Error(`iTunes API returned ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          trackName: string;
          artistName: string;
          previewUrl?: string;
        }>;
      };
      const track = data.results?.[0];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          track: track
            ? {
                name: track.trackName,
                artist: track.artistName,
                previewUrl: track.previewUrl?.slice(0, 50) + '...',
                hasPreview: !!track.previewUrl,
              }
            : null,
        })
      );
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: (err as Error).message,
        })
      );
    }
    return true;
  }

  return false;
}
