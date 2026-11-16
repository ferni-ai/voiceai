/**
 * Team insights and voice events belong to one person, so they start only
 * once Firebase Auth has answered, and only for a signed-in uid.
 *
 * They used to start with the device id at app load, before auth was ready:
 * a signed-in user's GET /api/team-insights went out as ?userId=device_...
 * (app audit 2026-11-16, item 6). The server answers both from the verified
 * token, so a signed-out visitor has nothing to start.
 */

import { getSignedInUid } from '../utils/api.js';

/** Start both streams for the signed-in person; returns the uid used, or null. */
export async function startPerPersonStreams(): Promise<string | null> {
  const uid = await getSignedInUid();
  if (!uid) return null;
  const [{ initCrossTeamNotifications }, { initVoiceEvents }] = await Promise.all([
    import('../services/cross-team-notifications.service.js'),
    import('../services/voice-events.service.js'),
  ]);
  initCrossTeamNotifications(uid);
  initVoiceEvents(uid);
  return uid;
}
