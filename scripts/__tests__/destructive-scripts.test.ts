import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore and Auth are mocked at the firebase-admin boundary: every write the
// scripts could make lands on one of these two spies.
const batchDelete = vi.fn();
const deleteUsers = vi.fn(async (uids: string[]) => ({
  successCount: uids.length,
  failureCount: 0,
  errors: [],
}));
const emptyAnonProfiles = [
  { id: 'anon:1', data: () => ({ profile: {} }) },
  { id: 'anon:2', data: () => ({}) },
];
vi.mock('firebase-admin', () => {
  const firestore = () => ({
    collection: () => ({
      get: async () => ({ size: emptyAnonProfiles.length, docs: emptyAnonProfiles }),
      doc: (id: string) => ({ id }),
    }),
    batch: () => ({ delete: batchDelete, commit: async () => {} }),
  });
  const auth = () => ({
    listUsers: async () => ({
      users: [{ uid: 'anon-user', providerData: [], metadata: { creationTime: 'x' } }],
      pageToken: undefined,
    }),
    deleteUsers,
  });
  const admin = {
    apps: [] as unknown[],
    initializeApp: () => {},
    firestore,
    auth,
    credential: { applicationDefault: () => ({}) },
  };
  return { default: admin };
});

const { destructiveMode } = await import('../destructive-gate.js');
const staleProfiles = await import('../delete-stale-profiles.js');
const anonUsers = await import('../cleanup-anonymous-users.js');

const node = ['node', 'script.ts'];

beforeEach(() => {
  batchDelete.mockClear();
  deleteUsers.mockClear();
  process.exitCode = undefined;
});

describe('destructive gate', () => {
  it('is a dry run unless --execute names the right project', () => {
    expect(destructiveMode([], 'johnb-2025')).toBe('dry-run');
    expect(destructiveMode(['--execute'], 'johnb-2025')).toBe('refused');
    expect(destructiveMode(['--execute', '--confirm-project=other'], 'johnb-2025')).toBe('refused');
    expect(destructiveMode(['--execute', '--confirm-project=johnb-2025'], 'johnb-2025')).toBe(
      'execute'
    );
    expect(
      destructiveMode(['--execute', '--confirm-project=johnb-2025', '--dry-run'], 'johnb-2025')
    ).toBe('dry-run');
    expect(destructiveMode(['--apply'], 'johnb-2025')).toBe('refused');
    expect(destructiveMode(['--apply', '--confirm-project=johnb-2025'], 'johnb-2025')).toBe(
      'execute'
    );
  });
});

describe.each([
  ['delete-stale-profiles', () => staleProfiles.main, () => batchDelete],
  ['cleanup-anonymous-users', () => anonUsers.main, () => deleteUsers],
])('%s', (_name, main, deletes) => {
  it('makes no deletes with no flags', async () => {
    await main()(node);
    expect(deletes()).toHaveBeenCalledTimes(0);
  });

  it('makes no deletes with --execute but no matching --confirm-project', async () => {
    await main()([...node, '--execute']);
    await main()([...node, '--execute', '--confirm-project=ferni-prod']);
    expect(deletes()).toHaveBeenCalledTimes(0);
    expect(process.exitCode).toBe(1);
  });

  it('deletes only with --execute --confirm-project=<the target project>', async () => {
    await main()([...node, '--execute', '--confirm-project=johnb-2025']);
    expect(deletes()).toHaveBeenCalled();
  });
});
