/**
 * An invalid stored profile is reported by field name, never by value.
 *
 * InvalidStoredProfileError used to carry the whole stored doc as an enumerable field, so any
 * logger or Sentry that serialised the error wrote the member's profile (tokens included) into
 * the logs. The repair still sees the doc; the error and the log lines don't.
 */
import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record =
    (level: string) =>
    (...args: unknown[]) =>
      void logged.push([level, ...args]);
  const logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => logger,
  };
  return { ...actual, getLogger: () => logger, createLogger: () => logger };
});

const { FirestoreStore } = await import('../firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { InvalidStoredProfileError } = await import('../profile-read-failure.js');

const SECRETS = ['Dana Q. Private', '+15555550123', 'panic attacks since june', 'li-token-abc'];
const directWriterDoc = {
  name: SECRETS[0],
  phone: SECRETS[1],
  notes: SECRETS[2],
  email: 42,
  linkedInTokens: { accessToken: SECRETS[3] },
};

let store: InstanceType<typeof FirestoreStore>;

beforeEach(() => {
  logged.length = 0;
  resetCallStartReads();
  const state = newMergeFakeState();
  state.docs.set('bogle_users/u1', structuredClone(directWriterDoc));
  store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
});

const leaks = (text: string) => SECRETS.filter((s) => text.includes(s));

describe('an invalid stored profile', () => {
  it('throws an error that names the bad fields and serialises no profile value', async () => {
    const error = await store.getProfileStrict('u1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidStoredProfileError);
    expect(leaks(JSON.stringify(error))).toEqual([]);
    expect(leaks(inspect(error, { depth: 10, showHidden: true }))).toEqual([]);
    expect(leaks(String(error))).toEqual([]);
    expect((error as InstanceType<typeof InvalidStoredProfileError>).invalidFields).toEqual([
      'id',
      'email',
    ]);
  });

  it('logs field names only', async () => {
    await store.getProfileStrict('u1').catch(() => undefined);
    expect(logged.some(([level]) => level === 'error')).toBe(true);
    expect(leaks(inspect(logged, { depth: 10 }))).toEqual([]);
  });

  it('the repair still keeps the stored fields, but not the token fields', async () => {
    const repaired = await store.getProfileForWrite('u1');
    expect(repaired).toMatchObject({ id: 'u1', name: SECRETS[0], notes: SECRETS[2] });
    expect(repaired).not.toHaveProperty('linkedInTokens');
  });
});
