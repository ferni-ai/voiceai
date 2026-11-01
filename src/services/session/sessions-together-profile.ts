/**
 * The session's profile carries the one count of sessions together.
 *
 * Every context builder reads userProfile.totalConversations, and that counter
 * drifted from the truth (prod: profile 21, relationship engine 17, conversation
 * docs 30 for one user, all reaching the same prompt). When the session loads the
 * profile, the prompt's copy gets the count from sessions-together: completed
 * calls in which the user spoke.
 *
 * The count only replaces the counter when it was read and is above zero, so a
 * failed read or a user whose old calls never recorded an end is never turned
 * into a "first conversation".
 *
 * The stored counter is a different thing and must never go down. The counted
 * value can be lower (old calls that never recorded an end), and the 30 s
 * auto-save once wrote it over the stored one mid-call (41 stored, 3 counted:
 * writes [3, 41], and a crash between them left 3). So every save of the call's
 * profile goes through one SessionCounter.forSave: never below the stored
 * counter, and moved on by what the call added (the end-of-call +1: 41 -> 42).
 *
 * @module services/session/sessions-together-profile
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getSessionsTogether } from '../stores/sessions-together.js';
import { getLogger } from '../../utils/safe-logger.js';

type Counted = Pick<UserProfile, 'totalConversations'>;

/** A slow read must not hold up the call: past this, the stored counter stays. */
const READ_TIMEOUT_MS = 800;

/**
 * The profile with the counted sessions, as a copy. The loaded object is not changed:
 * the profile cache hands that same object to the next reader, and a save from it
 * must carry the stored counter, not the counted one.
 */
export async function withSessionsTogether<P extends Counted>(
  userId: string,
  profile: P | null,
  read: typeof getSessionsTogether = getSessionsTogether
): Promise<P | null> {
  if (!profile) return profile;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
    });
    const sessions = await Promise.race([read(userId), timeout]);
    if (sessions && sessions.count > 0) {
      if (sessions.count !== profile.totalConversations) {
        getLogger().info(
          { userId, stored: profile.totalConversations, counted: sessions.count },
          'Sessions together: using the counted sessions'
        );
      }
      return { ...profile, totalConversations: sessions.count };
    }
  } catch (error) {
    getLogger().debug({ error: String(error), userId }, 'Sessions together read failed');
  } finally {
    clearTimeout(timer);
  }
  return profile;
}

/** One call's counter: the prompt reads the counted value, the store never goes below the stored one. */
export interface SessionCounter {
  /** Load: the prompt's copy with the counted sessions; remembers the stored counter. */
  load: <P extends Counted>(userId: string, profile: P | null) => Promise<P | null>;
  /** The profile as it may be written: every save of the call's profile goes through here. */
  forSave: <P extends Counted>(profile: P) => P;
}

export function sessionCounter(
  read: typeof getSessionsTogether = getSessionsTogether
): SessionCounter {
  let stored = 0;
  let offset = 0; // stored minus counted, when the counted value is the lower one
  return {
    async load(userId, profile) {
      const loaded = await withSessionsTogether(userId, profile, read);
      stored = profile?.totalConversations ?? 0;
      offset = Math.max(0, stored - (loaded?.totalConversations ?? stored));
      return loaded;
    },
    forSave(profile) {
      // max(stored, counted) plus what the call added since load (0 mid-call, 1 at the end)
      const total = Math.max(stored, profile.totalConversations + offset);
      return total === profile.totalConversations
        ? profile
        : { ...profile, totalConversations: total };
    },
  };
}
