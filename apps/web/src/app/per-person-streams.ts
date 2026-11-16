/**
 * Team insights and voice events belong to one person, so they start only
 * once Firebase Auth has answered, and only for a signed-in uid.
 *
 * They used to start with the device id at app load, before auth was ready:
 * a signed-in user's GET /api/team-insights went out as ?userId=device_...
 * (app audit 2026-11-16, item 6). The server answers both from the verified
 * token. Someone signed out at load is watched instead: signing in does not
 * reload the page, so the streams start when their uid arrives.
 */

import { onAuthStateChange } from '../services/firebase-auth.service.js';
import { getSignedInUid } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PerPersonStreams');

/** Both streams start at most once per page, whichever path gets there first. */
let started = false;

async function startFor(uid: string): Promise<void> {
  if (started) return;
  started = true;
  const [{ initCrossTeamNotifications }, { initVoiceEvents }] = await Promise.all([
    import('../services/cross-team-notifications.service.js'),
    import('../services/voice-events.service.js'),
  ]);
  initCrossTeamNotifications(uid);
  initVoiceEvents(uid);
}

/** Start both streams once the uid of a signed-in person arrives, then stop listening. */
function startOnSignIn(): void {
  let signedIn = false;
  let subscribed = false; // the listener runs once inside onAuthStateChange, before it returns
  const unsubscribe = onAuthStateChange((state) => {
    if (signedIn || !state.uid) return;
    signedIn = true;
    if (subscribed) unsubscribe();
    startFor(state.uid).catch((error) => log.warn('Per-person streams did not start after sign-in', error));
  });
  subscribed = true;
  if (signedIn) unsubscribe();
}

/**
 * Start both streams for the signed-in person; returns the uid used, or null
 * when nobody is signed in yet (they start later, on sign-in).
 */
export async function startPerPersonStreams(): Promise<string | null> {
  const uid = await getSignedInUid();
  if (!uid) {
    startOnSignIn();
    return null;
  }
  await startFor(uid);
  return uid;
}
