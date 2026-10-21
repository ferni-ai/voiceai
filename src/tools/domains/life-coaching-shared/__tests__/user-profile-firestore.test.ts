/**
 * Life-coaching profiles must use the process's own Firestore (getAdminFirestore():
 * the default app's project and FIRESTORE_DATABASE). The client used to fall back to
 * project 'bogle-voiceai' when GOOGLE_PROJECT_ID was unset.
 */
import { describe, expect, it, vi } from 'vitest';

const adminDb = vi.hoisted(() => ({ collection: vi.fn() }));
const getAdminFirestore = vi.hoisted(() => vi.fn(() => adminDb));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore }));

const { getFirestore } = await import('../user-profile-firestore.js');

describe('life-coaching profile Firestore', () => {
  it('is the default app client, created once on first use', async () => {
    vi.stubEnv('GOOGLE_PROJECT_ID', '');
    expect(getAdminFirestore).not.toHaveBeenCalled();
    await expect(getFirestore()).resolves.toBe(adminDb);
    await expect(getFirestore()).resolves.toBe(adminDb);
    expect(getAdminFirestore).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
