/**
 * Life-coaching profiles persist through getAdminFirestore(): the main project (the
 * default app's) and the process's database. They used to go to a fallback project
 * that prod could not reach, so saves failed and nothing persisted.
 */
import { describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as { path: string; data: unknown }[]);
const getAdminFirestore = vi.hoisted(() =>
  vi.fn(() => {
    const ref = (path: string) => ({
      collection: (c: string) => col(`${path}/${c}`),
      get: async () => ({ exists: false, data: () => undefined }),
      set: async (data: unknown) => void writes.push({ path, data }),
    });
    const col = (path: string) => ({ doc: (id: string) => ref(`${path}/${id}`) });
    return { collection: (c: string) => col(c) };
  })
);
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore }));

const { updateLifeCoachingProfile } = await import('../user-profile.js');

describe('life-coaching profile persistence', () => {
  it('saves the profile through the main-project client', async () => {
    expect(getAdminFirestore).not.toHaveBeenCalled();
    await updateLifeCoachingProfile('u-main', {});
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(getAdminFirestore).toHaveBeenCalledTimes(1);
    expect(writes[0]?.path).toBe('bogle_users/u-main/life_coaching/profile');
  });
});
