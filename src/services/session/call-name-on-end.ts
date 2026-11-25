/**
 * NAME_SURVIVES_END_SAVE: the name the call saved is the name the end-of-call save writes.
 *
 * endSession builds its last save from the profile loaded at call start (session-manager.ts),
 * so its session totals count once. Every mid-call save (the turn-3 auto-save, rememberName's
 * own save) replaces services.userProfile with an updated copy, and a name confirmed after the
 * first of them lands only on that copy. The end-of-call save then wrote the call-start name
 * back. Only the two name fields are taken from the live profile: taking the whole live
 * profile would count the session again for every mid-call save (updateProfileFromSession
 * adds one to totalConversations each time it runs).
 *
 * @module services/session/call-name-on-end
 */

import { flagOn, type Env } from '../../config/env-flag.js';

interface Named {
  name?: string;
  preferredName?: string;
}

/** `ending` with the live profile's name fields; `ending` itself with the flag off or no live profile. */
export function keepCallName<P extends Named>(
  ending: P,
  live: Named | null | undefined,
  env: Env = process.env
): P {
  if (!live || !flagOn('NAME_SURVIVES_END_SAVE', env)) return ending;
  return {
    ...ending,
    ...(live.name !== undefined ? { name: live.name } : {}),
    ...(live.preferredName !== undefined ? { preferredName: live.preferredName } : {}),
  };
}
