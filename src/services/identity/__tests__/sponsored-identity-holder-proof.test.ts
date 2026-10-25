/**
 * saveIdentity rewrites the whole sponsored identity, so it must keep the
 * holder's proof (phoneVerifiedAt, the pending code) that holder-verification
 * merged in: a rename or a call-stat write must not un-verify the holder. It
 * keeps the proof only for the same number, and never takes it from memory.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (c: string, id: string) => ({
    id,
    get: async () => ({
      id,
      exists: docs.has(`${c}/${id}`),
      data: () => docs.get(`${c}/${id}`),
    }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const prev = opts?.merge ? docs.get(`${c}/${id}`) : undefined;
      docs.set(`${c}/${id}`, { ...prev, ...data });
    },
    delete: async () => void docs.delete(`${c}/${id}`),
  });
  const db = { collection: (c: string) => ({ doc: (id: string) => ref(c, id) }) };
  return { docs, db };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fake.db }));
vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => fake.db,
}));

const svc = await import('../sponsored-identity.js');
const { defaultHolderDeps } = await import('../../messaging/holder-verification.js');

const stored = (id: string) => fake.docs.get(`sponsored_identities/${id}`);

beforeEach(() => {
  fake.docs.clear();
  svc.clearCaches();
});

async function verifiedMom(): Promise<string> {
  const mom = await svc.createSponsoredIdentity('seth', {
    displayName: 'Mom',
    relationship: 'mother',
    phoneNumber: '+12025550133',
  });
  // what recordHolderCode writes when the holder replies with the right code
  await defaultHolderDeps().save(mom.id, {
    phoneVerifiedAt: '2026-10-18T16:00:00.000Z',
    holderVerification: null,
  });
  return mom.id;
}

describe('saveIdentity keeps the holder proof', () => {
  it('verify, then rename: still verified', async () => {
    const id = await verifiedMom();
    expect(stored(id)?.phoneVerifiedAt).toBe('2026-10-18T16:00:00.000Z');
    await svc.updateSponsoredIdentity(id, 'seth', { displayName: 'Barbara' });
    expect(stored(id)).toMatchObject({
      displayName: 'Barbara',
      phoneVerifiedAt: '2026-10-18T16:00:00.000Z',
    });
    svc.clearCaches();
    expect((await svc.getSponsoredIdentity(id))?.phoneVerifiedAt).toBe('2026-10-18T16:00:00.000Z');
  });

  it('a pending code survives a rename too', async () => {
    const mom = await svc.createSponsoredIdentity('seth', {
      displayName: 'Mom',
      relationship: 'mother',
      phoneNumber: '+12025550133',
    });
    const pending = { codeHash: 'h', sentAt: 's', expiresAt: 'e', tries: 1 };
    await defaultHolderDeps().save(mom.id, { holderVerification: pending });
    await svc.updateSponsoredIdentity(mom.id, 'seth', { notes: 'calls on Sundays' });
    expect(stored(mom.id)?.holderVerification).toEqual(pending);
  });

  it('verify, then change the number: the new number is not verified and has no code', async () => {
    const id = await verifiedMom();
    const pending = { codeHash: 'h', sentAt: 's', expiresAt: 'e', tries: 0 };
    await defaultHolderDeps().save(id, { holderVerification: pending });
    await svc.updateSponsoredIdentity(id, 'seth', { phoneNumber: '+12025550199' });
    expect(stored(id)?.phoneNumber).toBe('+12025550199');
    expect(stored(id)?.phoneVerifiedAt).toBeUndefined();
    expect(stored(id)?.holderVerification).toBeUndefined();
  });

  it('never writes the proof from the in-memory identity', async () => {
    const mom = await svc.createSponsoredIdentity('seth', {
      displayName: 'Mom',
      relationship: 'mother',
      phoneNumber: '+12025550133',
    });
    const forged = { notes: 'x', phoneVerifiedAt: '2026-10-25T00:00:00Z' };
    await svc.updateSponsoredIdentity(mom.id, 'seth', forged);
    expect(stored(mom.id)?.phoneVerifiedAt).toBeUndefined();
  });
});
