import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore and Auth are mocked at the firebase-admin boundary: every write the
// script could make lands on the update spy.
const update = vi.fn(async () => {});
const users: Record<string, object> = {
  'uid-good': { email: 'Good@Example.com', emailVerified: true, providerData: [{}] },
  'uid-unverified': { email: 'victim@example.com', emailVerified: false, providerData: [{}] },
  'uid-anon': { emailVerified: false, providerData: [] },
};
const publishers = [
  { id: 'pub-good', data: { email: 'good@example.com', firebaseUid: 'uid-good' } },
  { id: 'pub-victim', data: { email: 'victim@example.com', firebaseUid: 'uid-unverified' } },
  { id: 'pub-shared', data: { email: '', firebaseUid: 'uid-anon' } },
  { id: 'pub-gone', data: { email: 'gone@example.com', firebaseUid: 'uid-deleted' } },
  { id: 'pub-unlinked', data: { email: 'legacy@example.com' } },
];
const DELETE = Symbol('delete');
vi.mock('firebase-admin', () => {
  const firestore = Object.assign(
    () => ({
      collection: () => ({
        get: async () => ({
          docs: publishers.map((p) => ({
            id: p.id,
            data: () => p.data,
            ref: { id: p.id, update },
          })),
        }),
      }),
    }),
    { FieldValue: { delete: () => DELETE } }
  );
  const auth = () => ({
    getUser: async (uid: string) => {
      if (!users[uid]) throw new Error('auth/user-not-found');
      return users[uid];
    },
  });
  return { default: { apps: [] as unknown[], initializeApp: () => {}, firestore, auth } };
});

const { main, unlinkReason } = await import('../unlink-unverified-publishers.js');
const node = ['node', 'script.ts'];

beforeEach(() => {
  update.mockClear();
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('unlinkReason', () => {
  it('keeps a link only for a verified, matching, non-anonymous account', () => {
    expect(
      unlinkReason('a@x.com', { email: 'A@x.com', emailVerified: true, anonymous: false })
    ).toBeNull();
    expect(
      unlinkReason('a@x.com', { email: 'a@x.com', emailVerified: false, anonymous: false })
    ).toMatch(/not verified/);
    expect(unlinkReason('', { emailVerified: false, anonymous: true })).toMatch(/anonymous/);
    expect(
      unlinkReason('a@x.com', { email: 'b@x.com', emailVerified: true, anonymous: false })
    ).toMatch(/differs/);
    expect(unlinkReason('a@x.com', null)).toMatch(/no longer exists/);
  });
});

describe('unlink-unverified-publishers', () => {
  it('changes nothing with no flags (dry run)', async () => {
    await main(node);
    expect(update).not.toHaveBeenCalled();
  });

  it('changes nothing with --apply but no matching --confirm-project', async () => {
    await main([...node, '--apply']);
    await main([...node, '--apply', '--confirm-project=ferni-prod']);
    expect(update).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('--dry-run wins over --apply', async () => {
    await main([...node, '--apply', '--confirm-project=johnb-2025', '--dry-run']);
    expect(update).not.toHaveBeenCalled();
  });

  it('with --apply --confirm-project clears only the unsound links', async () => {
    await main([...node, '--apply', '--confirm-project=johnb-2025']);
    expect(update).toHaveBeenCalledTimes(3); // victim, shared, gone; never good or unlinked
    expect(update).toHaveBeenCalledWith({ firebaseUid: DELETE });
  });
});
