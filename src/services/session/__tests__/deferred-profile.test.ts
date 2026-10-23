/**
 * Returning-user decisions after the deferred profile load (prod call 2026-10-12).
 *
 * createSessionServices({ deferProfileLoad: true }) returns with no profile and
 * attaches it later. Session init used to decide "returning" at that moment, so
 * every user was new: the trial and onboarding-arc branches took the new-user
 * path and userData.isReturningUser stayed false. Drives the real
 * createSessionServices; only the global store and its profile cache are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';

const profiles = new Map<string, UserProfile>();
let releaseLoad: () => void = () => {};
let loadGate: Promise<void> = Promise.resolve();

const store = {
  getProfileForWrite: vi.fn(async (uid: string) => {
    await loadGate;
    return profiles.get(uid) ?? null;
  }),
  saveProfile: vi.fn(async () => {}),
};

vi.mock('../../global-services.js', () => ({
  getGlobalServices: async () => ({ store }),
}));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<UserProfile | null>) =>
    load(uid),
  cacheProfile: async () => {},
  invalidateProfile: async () => {},
}));

const { createSessionServices } = await import('../session-manager.js');
const { returningOnceLoaded, syncReturningOnceLoaded } = await import('../deferred-profile.js');

function holdLoad(): void {
  loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
}

async function fastPathSession(userId: string) {
  const services = await createSessionServices({
    sessionId: `sess-${userId}`,
    userId,
    deferProfileLoad: true,
  });
  // What session-init-handler decides at this point.
  const initFlag = (services.userProfile?.totalConversations ?? 0) > 0;
  return { services, initFlag };
}

describe('returning user after the deferred profile load', () => {
  beforeEach(() => {
    profiles.clear();
    loadGate = Promise.resolve();
  });

  it('a 654-conversation user is returning once the load lands, and userData follows', async () => {
    const seth = createUserProfile('user-seth-654', 'seth');
    seth.totalConversations = 654;
    profiles.set(seth.id, seth);
    holdLoad();

    const { services, initFlag } = await fastPathSession(seth.id);
    expect(services.userProfile).toBeNull();
    expect(initFlag).toBe(false);

    const userData: { isReturningUser?: unknown } = { isReturningUser: false };
    syncReturningOnceLoaded(services, initFlag, userData);
    const decided = returningOnceLoaded(services, initFlag);

    releaseLoad();
    await expect(decided).resolves.toBe(true);
    expect(services.userProfile?.totalConversations).toBe(654);
    await vi.waitFor(() => expect(userData.isReturningUser).toBe(true));
  });

  it('a genuinely new user (0 conversations) stays new', async () => {
    const sam = createUserProfile('user-sam-new', 'sam');
    profiles.set(sam.id, sam);

    const { services, initFlag } = await fastPathSession(sam.id);
    const userData: { isReturningUser?: unknown } = { isReturningUser: false };
    syncReturningOnceLoaded(services, initFlag, userData);

    await expect(returningOnceLoaded(services, initFlag)).resolves.toBe(false);
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(userData.isReturningUser).toBe(false);
  });

  it('no profile anywhere: new user, and the wait still resolves', async () => {
    const { services, initFlag } = await fastPathSession('user-nobody-0');
    await expect(returningOnceLoaded(services, initFlag)).resolves.toBe(false);
  });
});
