/**
 * The raw invite token never reaches a log line, on any path: it is the only
 * thing between a forwarded log and someone else's calendar. Only its hash is
 * ever stored (connect-invites.test.ts).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const lines = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger: Record<string, unknown> = { child: () => logger };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
    logger[level] = (...args: unknown[]) => lines.push([level, ...args]);
  }
  return { createLogger: () => logger, logger, default: logger };
});

const { memorySingleUseStore, sha256Hex } = await import('../../stores/single-use-records.js');
const { createFakeFirestore, newFakeFirestoreState } =
  await import('../../../tests/helpers/fake-firestore.js');
const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
const invites = await import('../connect-invites.js');
type Store = import('../../stores/single-use-records.js').SingleUseStore<
  import('../connect-invites.js').ConnectInvite
>;

let store: Store;
beforeEach(() => {
  lines.length = 0;
  vi.stubEnv('CONNECT_MOMENT_CALENDAR', 'on');
  store = memorySingleUseStore(100);
  invites.setConnectInviteStore(store);
  const firestore = newFakeFirestoreState();
  firestore.docs.set('bogle_users/ana', {});
  vi.mocked(getFirestoreDb).mockImplementation(createFakeFirestore(firestore) as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  invites.setConnectInviteStore(null);
});

it('logs no raw token when an invite is made, refused, spent, expired, returned or the store fails', async () => {
  const token = (await invites.createConnectInvite({
    uid: 'ana',
    integration: 'calendar',
  })) as string;
  expect(await invites.redeemConnectInvite(token, 'ben')).toBeNull();
  const spent = await invites.redeemConnectInvite(token, 'ana');
  if (!spent) throw new Error('the owner could not spend the invite');
  await invites.returnConnectInvite(token, spent);
  expect(await invites.redeemConnectInvite(token, 'ana')).not.toBeNull();
  expect(await invites.redeemConnectInvite(token, 'ana')).toBeNull();

  const expired = 'q'.repeat(43);
  await store.put(sha256Hex(expired), {
    uid: 'ana',
    integration: 'calendar',
    createdAt: 0,
    expiresAt: 1,
  });
  expect(await invites.redeemConnectInvite(expired, 'ana')).toBeNull();

  const broken = 'z'.repeat(43);
  const fail = async (key: string) => {
    throw new Error(`store down at ${key}`);
  };
  invites.setConnectInviteStore({ ...store, get: fail, put: fail });
  expect(await invites.redeemConnectInvite(broken, 'ana')).toBeNull();
  await invites.returnConnectInvite(broken, spent);

  const logged = JSON.stringify(lines);
  // The capture works: each path above did log something.
  expect(logged).toContain('other_account');
  expect(logged).toContain('Could not redeem invite');
  expect(logged).toContain('Could not return invite');
  for (const secret of [token, expired, broken]) expect(logged).not.toContain(secret);
});
