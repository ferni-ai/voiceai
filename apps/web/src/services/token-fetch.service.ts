/**
 * Token Fetch
 *
 * Requests a LiveKit room token from the server for the connection service.
 * Split out of connection.service.ts.
 */

import { API } from '../config/index.js';
import type { TokenRequest, TokenResponse } from '../types/livekit.js';
import { isValidTokenResponse } from '../types/livekit.js';
import { createLogger } from '../utils/logger.js';

// Same logger name as connection.service.ts so existing log filters keep matching.
const log = createLogger('Connection');

/**
 * Fetch a LiveKit token from the server.
 */
export async function fetchConnectionToken(request: TokenRequest): Promise<TokenResponse> {
  const params = new URLSearchParams({
    room: request.room,
    username: request.username,
    device_id: request.deviceId,
    persona_id: request.personaId,
  });

  // The caller's time zone, so Ferni knows their local time of day.
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) params.set('timezone', timezone);
  } catch {
    // Not available: Ferni falls back to not assuming a time of day.
  }

  // Add Firebase UID if available (Priority 2 for user identification)
  if (request.firebaseUid) {
    params.set('firebase_uid', request.firebaseUid);
  }

  // Add user's preferred accent for voice localization (🌍 international accent support)
  if (request.preferredAccent) {
    params.set('accent', request.preferredAccent);
  }

  // Add claimed demo conversation if available (Better than human)
  if (request.claimedDemoConversation) {
    params.set('claimed_demo', JSON.stringify(request.claimedDemoConversation));
  }

  const url = `${API.TOKEN}?${params.toString()}`;

  // 🔐 CRITICAL FIX: Include Firebase Auth Bearer token for user identification
  // Without this, the server can't verify who you are and conversations
  // get saved under anonymous device IDs instead of your profile!
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  try {
    const { getAuthToken } = await import('./firebase-auth.service.js');
    const authToken = await getAuthToken();
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      log.debug('Including Firebase auth token in token request');
    }
  } catch (authError) {
    // Auth service not available or not signed in - continue without
    log.debug('No Firebase auth token available:', authError);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      // iOS sometimes needs explicit cache control
      cache: 'no-cache',
    });
  } catch (fetchError) {
    log.error('Fetch error:', fetchError);
    throw new Error(
      `Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect'}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    log.error('Token error response:', errorText);
    throw new Error(`Token request failed: ${response.status} - ${errorText.slice(0, 100)}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (jsonError) {
    log.error('JSON parse error:', jsonError);
    throw new Error('Invalid response format from server');
  }

  if (!isValidTokenResponse(data)) {
    log.error('Invalid token response:', data);
    throw new Error('Invalid token response from server');
  }

  return data;
}
