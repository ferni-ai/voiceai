/**
 * The session's profile carries the one count of sessions together.
 *
 * Every context builder reads userProfile.totalConversations, and that counter
 * drifted from the truth (prod: profile 21, relationship engine 17, conversation
 * docs 30 for one user, all reaching the same prompt). When the session loads the
 * profile, totalConversations is set from sessions-together: completed calls in
 * which the user spoke.
 *
 * The count only replaces the counter when it was read and is above zero, so a
 * failed read or a user whose old calls never recorded an end is never turned
 * into a "first conversation".
 *
 * @module services/session/sessions-together-profile
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getSessionsTogether } from '../stores/sessions-together.js';
import { getLogger } from '../../utils/safe-logger.js';

/** A slow read must not hold up the call: past this, the stored counter stays. */
const READ_TIMEOUT_MS = 800;

export async function withSessionsTogether<P extends Pick<UserProfile, 'totalConversations'>>(
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
      profile.totalConversations = sessions.count;
    }
  } catch (error) {
    getLogger().debug({ error: String(error), userId }, 'Sessions together read failed');
  } finally {
    clearTimeout(timer);
  }
  return profile;
}
