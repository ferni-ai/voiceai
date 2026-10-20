/**
 * Session start survives a refused profile write. In production the synthetic
 * write guard refuses a new harness user's profile (code 7, never retried);
 * with the blocking load (MULTI_AGENT_MODE=false) that save was awaited with no
 * catch, so the job ended before the greeting. Drives the real
 * createSessionServices; only the global store and its profile cache are faked.
 */
import { describe, expect, it, vi } from 'vitest';

const store = {
  getProfile: vi.fn(async () => null),
  saveProfile: vi.fn(async () => {
    throw Object.assign(new Error('Refused a production Firestore write'), { code: 7 });
  }),
};
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => {},
  invalidateProfile: async () => {},
}));

const { createSessionServices } = await import('../session-manager.js');

describe('a refused profile save at session start', () => {
  it('leaves the call running with the new in-memory profile', async () => {
    const services = await createSessionServices({
      sessionId: 'sess-voice-eval-refused',
      userId: 'voice-eval-story-20261018120000-abcd',
      deferProfileLoad: false,
    });
    expect(store.saveProfile).toHaveBeenCalled();
    expect(services.userProfile?.id).toBe('voice-eval-story-20261018120000-abcd');
  });
});
