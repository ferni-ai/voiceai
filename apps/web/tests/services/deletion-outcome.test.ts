/**
 * A delete the browser stopped waiting for may still have run: the server keeps
 * erasing after the client goes. So "delete my data" and "delete my account" each
 * end in one of three outcomes, and only a refusal may say nothing was removed:
 *
 * - confirmed (2xx): success, the device forgets the data;
 * - refused (4xx): nothing was removed, and why (401/403: sign in again);
 * - unknown (timeout, network error, 5xx, 504): couldn't confirm, may still be finishing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n/index.js';
import {
  DATA_RIGHTS_AUTH_WAIT_MS,
  LONG_REQUEST_TIMEOUT_MS,
} from '../../src/utils/request-deadline.js';

const auth = vi.hoisted(() => ({
  tokenDelayMs: 0,
  signOut: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(
    () =>
      new Promise<string>((resolve) => {
        if (auth.tokenDelayMs === 0) resolve('id-token-abc');
        else setTimeout(() => resolve('id-token-abc'), auth.tokenDelayMs);
      })
  ),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut: auth.signOut,
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: auth.signOut }));
vi.mock('../../src/services/rituals.service.js', () => ({ ritualsService: { clearAll: vi.fn() } }));

const { dataExportService, DataRightsError } =
  await import('../../src/services/data-export.service.js');

const realSetItem = Object.getOwnPropertyDescriptor(localStorage, 'setItem') as PropertyDescriptor;
const calls: RequestInit[] = [];

/** The server answers `status`, throws (network error), or never answers. */
function server(answer: number | 'network' | 'never', body: unknown = { success: true }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      calls.push(init);
      if (answer === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      if (answer === 'never') return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response(JSON.stringify(body), { status: answer }));
    })
  );
}

const DELETES = [
  {
    name: 'delete all data',
    run: () => dataExportService.deleteAllData(),
    unknown: 'dataExportService.deleteDataUnknown',
    refused: 'dataExportService.deleteDataFailed',
  },
  {
    name: 'delete account',
    run: () => dataExportService.deleteAccount(),
    unknown: 'dataExportService.deleteAccountUnknown',
    refused: 'dataExportService.deleteAccountFailed',
  },
] as const;

/** Every "nothing happened" phrasing the English copy uses. */
const SAYS_NOTHING_REMOVED = /nothing was (removed|deleted)|try again\?/i;

beforeEach(() => {
  calls.length = 0;
  auth.tokenDelayMs = 0;
  auth.signOut.mockClear();
  localStorage.clear();
  localStorage.setItem('voiceai_userName', 'Sam');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(localStorage, 'setItem', realSetItem); // a confirmed delete seals it
});

async function failure(run: () => Promise<unknown>): Promise<InstanceType<typeof DataRightsError>> {
  const err = await run().then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(DataRightsError);
  return err as InstanceType<typeof DataRightsError>;
}

describe.each(DELETES)('$name', ({ run, unknown, refused }) => {
  it('confirmed (200): resolves and the device forgets the data', async () => {
    server(200, { success: true, details: { failures: [] } });
    await run();
    expect(localStorage.getItem('voiceai_userName')).toBeNull();
  });

  it('refused (401): this request removed nothing, and says to sign in again', async () => {
    server(401, { error: 'Unauthorized' });
    const err = await failure(run);
    expect(err.reason).toBe('refused');
    expect(err.message).toBe(t('dataExportService.deleteRefusedSignIn'));
    expect(err.message).toMatch(/this request deleted nothing/i);
    expect(localStorage.getItem('voiceai_userName')).toBe('Sam');
  });

  it('refused (400): says nothing was removed', async () => {
    server(400, { error: 'Bad request' });
    const err = await failure(run);
    expect(err.reason).toBe('refused');
    expect(err.message).toBe(t(refused));
  });

  it.each([500, 504])('unknown (%i): never says nothing was removed', async (status) => {
    server(status, { error: 'upstream request timeout' });
    const err = await failure(run);
    expect(err.reason).toBe('unknown');
    expect(err.message).toBe(t(unknown));
    expect(err.message).not.toMatch(SAYS_NOTHING_REMOVED);
    expect(localStorage.getItem('voiceai_userName')).toBe('Sam'); // not confirmed: not cleared
  });

  it('unknown (network error): never says nothing was removed', async () => {
    server('network');
    const err = await failure(run);
    expect(err.reason).toBe('unknown');
    expect(err.message).not.toMatch(SAYS_NOTHING_REMOVED);
  });

  it('unknown (timeout): waits past the server 300 s limit, then can\'t confirm', async () => {
    vi.useFakeTimers();
    server('never');
    const settled = vi.fn();
    const pending = failure(run).then((err) => {
      settled();
      return err;
    });

    await vi.advanceTimersByTimeAsync(300_000);
    expect(settled).not.toHaveBeenCalled(); // the server's own answer (or its 504) comes first
    await vi.advanceTimersByTimeAsync(LONG_REQUEST_TIMEOUT_MS - 300_000);
    const err = await pending;

    expect(err.reason).toBe('unknown');
    expect(err.message).toBe(t(unknown));
    expect(err.message).not.toMatch(SAYS_NOTHING_REMOVED);
  });

  it('a slow sign-in token (10 s) is waited for and sent, not dropped into a 401', async () => {
    vi.useFakeTimers();
    auth.tokenDelayMs = 10_000;
    server(200, { success: true, details: { failures: [] } });

    const done = run();
    // 10 s for the token, then apiFetch's own 5 s token wait gives up on this mock
    await vi.advanceTimersByTimeAsync(15_000);
    await done;

    expect(calls).toHaveLength(1);
    expect((calls[0]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer id-token-abc'
    );
  });

  it('a token slower than the wait sends nothing and says nothing was sent', async () => {
    vi.useFakeTimers();
    auth.tokenDelayMs = DATA_RIGHTS_AUTH_WAIT_MS + 1_000;
    server(200);

    const pending = failure(run);
    await vi.advanceTimersByTimeAsync(DATA_RIGHTS_AUTH_WAIT_MS);
    const err = await pending;

    expect(calls).toHaveLength(0);
    expect(err.reason).toBe('refused');
    expect(err.message).toBe(t('dataExportService.authSlow'));
  });
});

describe('deleteAccount: a 200 without its confirmation', () => {
  it('is unknown, not success and not "nothing removed"', async () => {
    server(200, {});
    const err = await failure(() => dataExportService.deleteAccount());
    expect(err.reason).toBe('unknown');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe('checkAccountClosed: after an unknown outcome', () => {
  it.each([
    [200, 'open'],
    [401, 'closed'],
    [403, 'closed'],
    [503, 'unknown'],
  ] as const)('GET /api/account %i means %s, and never sends another delete', async (status, state) => {
    server(status, { userId: 'uid-1' });

    expect(await dataExportService.checkAccountClosed()).toBe(state);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method ?? 'GET').toBe('GET');
    // Closed: this device forgets the account too; otherwise it keeps everything
    expect(localStorage.getItem('voiceai_userName')).toBe(state === 'closed' ? null : 'Sam');
    expect(auth.signOut).toHaveBeenCalledTimes(state === 'closed' ? 1 : 0);
  });
});
