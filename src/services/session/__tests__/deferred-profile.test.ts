/**
 * Returning-user decisions after the deferred profile load (prod call 2026-10-12).
 *
 * createSessionServices({ deferProfileLoad: true }) returns with no profile and
 * attaches it later. Session init used to decide "returning" at that moment, so
 * every user was new: the trial and onboarding-arc branches took the new-user
 * path and userData.isReturningUser stayed false. Drives the real
 * createSessionServices; only the global store and its profile cache are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const {
  returningOnceLoaded,
  syncReturningOnceLoaded,
  trackDeferredProfileLoad,
  deferredProfileSettled,
} = await import('../deferred-profile.js');

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

describe('deferredProfileSettled: a bounded wait for the load', () => {
  afterEach(() => vi.useRealTimers());

  it('nothing pending, or already settled: true at once, and no timer is armed to get there', async () => {
    vi.useFakeTimers();
    const none = {};
    const noneWait = deferredProfileSettled(none, 1200);
    expect(vi.getTimerCount()).toBe(0); // the async function has run to its first await by now
    await expect(noneWait).resolves.toBe(true);

    const done = {};
    trackDeferredProfileLoad(done, Promise.resolve());
    await vi.advanceTimersByTimeAsync(0); // the load settles
    const doneWait = deferredProfileSettled(done, 1200);
    expect(vi.getTimerCount()).toBe(0); // a cap timer armed here is cleared later, so look now
    await expect(doneWait).resolves.toBe(true);
  });

  it('settles inside the cap: true, and the cap timer is cleared', async () => {
    vi.useFakeTimers();
    const services = {};
    trackDeferredProfileLoad(
      services,
      new Promise((r) => {
        setTimeout(r, 300);
      })
    );
    const wait = deferredProfileSettled(services, 1200);
    await vi.advanceTimersByTimeAsync(300);
    await expect(wait).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a failed load settles too: true, never a rejection', async () => {
    const services = {};
    trackDeferredProfileLoad(services, Promise.reject(new Error('store down')));
    await expect(deferredProfileSettled(services, 1200)).resolves.toBe(true);
  });

  it('still loading at the cap: false', async () => {
    vi.useFakeTimers();
    const services = {};
    trackDeferredProfileLoad(
      services,
      new Promise(() => {
        /* never settles */
      })
    );
    const wait = deferredProfileSettled(services, 1200);
    await vi.advanceTimersByTimeAsync(1199);
    let settled: boolean | undefined;
    void wait.then((v) => {
      settled = v;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await expect(wait).resolves.toBe(false);
  });
});
