/**
 * Returning user after the deferred profile load (prod call 2026-10-12, miss 9).
 *
 * On the multi-agent fast path session-manager loads the profile after
 * initializeSession has already decided isReturningUser from a null profile,
 * then assigns services.userProfile. The awareness block voice-agent-entry
 * builds must follow the loaded profile, not that early false. Real
 * buildUserAwareness, real session-state manager and userData proxy.
 */
import { describe, expect, it } from 'vitest';
import { createSessionStateManager } from '../../session/session-state.js';
import { createUserDataProxy } from '../../session/user-data-proxy.js';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';
import { injectUserAwareness } from '../user-awareness-injection.js';

const FIRST = /first conversation/i;
const sessionStartTime = new Date('2026-10-12T18:00:00Z');

/** What initializeSession hands back on the fast path: profile not loaded, flag false. */
function fastPathSession() {
  const services: { userProfile: UserProfile | null } = { userProfile: null };
  const isReturningUser = services.userProfile !== null;
  const manager = createSessionStateManager('sess-1', 'ferni', {
    userId: 'u-seth',
    isReturningUser,
  });
  const userData = createUserDataProxy(manager, {}) as unknown as Record<string, unknown>;
  return { services, isReturningUser, userData };
}

function inject(s: ReturnType<typeof fastPathSession>) {
  return injectUserAwareness({
    sessionId: 'sess-1',
    userProfile: s.services.userProfile,
    userData: s.userData,
    isReturningUser: s.isReturningUser,
    userName: 'seth',
    sessionStartTime,
  });
}

describe('injectUserAwareness after the deferred profile load', () => {
  it('a 654-conversation profile that arrives late is a returning user', async () => {
    const s = fastPathSession();
    expect(s.isReturningUser).toBe(false);
    expect(s.userData.isReturningUser).toBe(false);

    // The deferred load lands (session-manager assigns services.userProfile).
    const profile = createUserProfile('u-seth', 'seth');
    profile.totalConversations = 654;
    profile.lastConversationSummary = 'the boat trip and the new job';
    profile.lastContact = new Date('2026-10-11T18:00:00Z');
    s.services.userProfile = profile;

    const result = await inject(s);

    expect(result.isReturningUser).toBe(true);
    expect(s.userData.isReturningUser).toBe(true);
    expect(result.facts.some((f) => FIRST.test(f))).toBe(false);
    expect(result.instructionsBlock).not.toMatch(FIRST);
    expect(result.facts).toContain(
      "You've had 654 conversations together - you know each other well."
    );
    expect(result.facts).toContain('Last time you talked about: the boat trip and the new job');
  });

  it('a genuinely new user (0 conversations) still gets the first-conversation line', async () => {
    const s = fastPathSession();
    s.services.userProfile = createUserProfile('u-new', 'sam');

    const result = await inject(s);

    expect(result.isReturningUser).toBe(false);
    expect(s.userData.isReturningUser).toBe(false);
    expect(result.facts.some((f) => FIRST.test(f))).toBe(true);
  });

  it('no profile yet: no facts, flag stays false', async () => {
    const s = fastPathSession();

    const result = await inject(s);

    expect(result.isReturningUser).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.instructionsBlock).toBe('');
  });
});
