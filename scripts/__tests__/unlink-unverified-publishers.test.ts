import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore and Auth are mocked at the firebase-admin boundary: every write the
// script could make lands on the update spy.
const update = vi.fn(async () => {});
const keyUpdate = vi.fn(async () => {});
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
const apiKeys = [
  { id: 'key-victim-1', data: { publisherId: 'pub-victim', enabled: true } },
  { id: 'key-victim-off', data: { publisherId: 'pub-victim', enabled: false } },
  { id: 'key-shared-1', data: { publisherId: 'pub-shared', enabled: true } },
  { id: 'key-good-1', data: { publisherId: 'pub-good', enabled: true } },
];
const DELETE = Symbol('delete');
vi.mock('firebase-admin', () => {
  const firestore = Object.assign(
    () => ({
      collection: (name: string) => ({
        get: async () => {
          expect(name).toBe('publishers');
          return {
            docs: publishers.map((p) => ({
              id: p.id,
              data: () => p.data,
              ref: { id: p.id, update },
            })),
          };
        },
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => {
            expect([name, field]).toEqual(['developer_api_keys', 'publisherId']);
            const docs = apiKeys.filter((k) => k.data.publisherId === value);
            return {
              docs: docs.map((k) => ({ id: k.id, data: () => k.data, ref: { update: keyUpdate } })),
            };
          },
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
  keyUpdate.mockClear();
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
    expect(
      unlinkReason('a@x.com', {
        email: 'a@x.com',
        emailVerified: true,
        anonymous: false,
        disabled: true,
      })
    ).toMatch(/disabled/);
  });
});

describe('unlink-unverified-publishers', () => {
  it('changes nothing with no flags (dry run)', async () => {
    await main(node);
    expect(update).not.toHaveBeenCalled();
    expect(keyUpdate).not.toHaveBeenCalled();
  });

  it('dry run lists the enabled keys of unlinked publishers it would disable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(node);
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('key key-victim-1');
    expect(out).toContain('key key-shared-1');
    expect(out).not.toContain('key-victim-off'); // already disabled
    expect(out).not.toContain('key-good-1'); // sound link keeps its keys
    expect(out).toContain('[dry run] 2 API key(s) to disable');
    expect(out).not.toMatch(/@/); // never prints emails
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

  it('with --apply --confirm-project disables only the unlinked publishers enabled keys', async () => {
    expect(keyUpdate).not.toHaveBeenCalled();
    await main([...node, '--apply', '--confirm-project=johnb-2025']);
    expect(keyUpdate).toHaveBeenCalledTimes(2); // key-victim-1, key-shared-1
    expect(keyUpdate).toHaveBeenCalledWith({ enabled: false, revokedReason: 'publisher-unlinked' });
  });

  it('refused or dry-run --apply disables no keys', async () => {
    await main([...node, '--apply']);
    await main([...node, '--apply', '--confirm-project=johnb-2025', '--dry-run']);
    expect(keyUpdate).not.toHaveBeenCalled();
  });
});
