/**
 * "Privacy & your data" after a delete: a refusal is a toast saying nothing was
 * removed; a delete with no confirmed outcome reopens the panel saying it couldn't
 * be confirmed, with "Check again", which looks at what's there now and never
 * sends a second delete.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n/index.js';

const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(async () => 'id-token-abc'),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut: auth.signOut,
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: auth.signOut }));
vi.mock('../../src/services/rituals.service.js', () => ({ ritualsService: { clearAll: vi.fn() } }));
const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

/** Everything shown: the panel's text and every toast. */
const shown = (): string =>
  [
    document.body.textContent ?? '',
    ...Object.values(toast).flatMap((fn) => fn.mock.calls.map((c) => String(c[0]))),
  ].join('\n');

const { getAuthToken } = await import('../../src/services/firebase-auth.service.js');
const { dataRightsCallbacks } = await import('../../src/app/data-rights-callbacks.js');
const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

type Route = { method: string; url: string; status: number; body: unknown };
let routes: Route[] = [];
const sent: string[] = [];

function serve(...r: Route[]): void {
  routes = r;
}

const realSetItem = Object.getOwnPropertyDescriptor(localStorage, 'setItem') as PropertyDescriptor;

beforeEach(() => {
  sent.length = 0;
  auth.signOut.mockClear();
  Object.values(toast).forEach((fn) => fn.mockClear());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // never leave for '/'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      sent.push(`${method} ${url}`);
      const route = routes.find((r) => r.method === method && r.url === url);
      if (!route) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(route.body), { status: route.status });
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  getDataExportUI().destroy();
  document.body.innerHTML = '';
  Object.defineProperty(localStorage, 'setItem', realSetItem);
});

const status = (): HTMLElement | null => document.querySelector('.data-export__status');
const checkAgain = (): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.data-export__status button')].find(
    (b) => b.textContent === t('dataExport.checkAgain')
  );
const settle = (): Promise<void> => vi.advanceTimersByTimeAsync(0);

describe('delete all data', () => {
  it('a 504 shows "couldn\'t confirm" with Check again, never "Nothing was removed"', async () => {
    serve({ method: 'DELETE', url: '/api/export/all', status: 504, body: {} });

    await dataRightsCallbacks().onDeleteData?.();

    expect(status()?.getAttribute('role')).toBe('alert');
    expect(status()?.textContent).toContain(t('dataExportService.deleteDataUnknown'));
    expect(shown()).not.toMatch(/nothing was removed/i);
    expect(checkAgain()).toBeDefined();
  });

  it('Check again re-reads the counts and sends no second delete', async () => {
    serve(
      { method: 'DELETE', url: '/api/export/all', status: 504, body: {} },
      { method: 'GET', url: '/api/export/categories', status: 200, body: { categories: [] } }
    );
    await dataRightsCallbacks().onDeleteData?.();

    checkAgain()?.click();
    await settle();

    expect(sent).toEqual(['DELETE /api/export/all', 'GET /api/export/categories']);
    expect(document.querySelector('.data-export__categories')).not.toBeNull();
  });

  // The erasure refuses the sign-in on that server (markErasing), so the re-read can fail
  // because the delete ran: it must not say "Nothing has changed" (dataExport.loadFailed).
  it.each([
    ['a 401', 401],
    ['a 500', 500],
    ['a network failure', 'network'],
  ] as const)("Check again that gets %s says it still can't confirm", async (_, answer) => {
    serve(
      { method: 'DELETE', url: '/api/export/all', status: 504, body: {} },
      ...(answer === 'network'
        ? []
        : [{ method: 'GET', url: '/api/export/categories', status: answer, body: {} }])
    );
    await dataRightsCallbacks().onDeleteData?.();

    checkAgain()?.click();
    await settle();

    expect(sent).toEqual(['DELETE /api/export/all', 'GET /api/export/categories']);
    expect(status()?.getAttribute('role')).toBe('alert');
    expect(status()?.textContent).toContain(t('dataExportService.deleteDataStillUnknown'));
    expect(shown()).not.toContain(t('dataExport.loadFailed'));
    expect(shown()).not.toMatch(/nothing has changed|nothing was removed/i);
    expect(checkAgain()).toBeDefined(); // and it can be checked again later
  });

  // Signed out in another tab, or the token refresh failed offline: the signed-out list
  // (every category at 0) would read as "your data is gone" with no server answer.
  it("Check again with no sign-in says it still can't confirm, never an empty list", async () => {
    serve({ method: 'DELETE', url: '/api/export/all', status: 504, body: {} });
    await dataRightsCallbacks().onDeleteData?.();
    vi.mocked(getAuthToken).mockResolvedValueOnce(null);

    checkAgain()?.click();
    await settle();

    expect(sent).toEqual(['DELETE /api/export/all']);
    expect(document.querySelector('.data-export__categories')).toBeNull();
    expect(status()?.textContent).toContain(t('dataExportService.deleteDataStillUnknown'));
    expect(checkAgain()).toBeDefined();
  });

  it('a 401 is a refusal: says nothing was deleted and to sign in again', async () => {
    serve({ method: 'DELETE', url: '/api/export/all', status: 401, body: {} });

    await dataRightsCallbacks().onDeleteData?.();

    expect(status()).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(t('dataExportService.deleteRefusedSignIn'));
  });
});

describe('delete account', () => {
  it('a network error shows "couldn\'t confirm"; Check again finds it still open', async () => {
    serve({ method: 'GET', url: '/api/account', status: 200, body: { userId: 'uid-1' } });

    await dataRightsCallbacks().onDeleteAccount?.(); // DELETE has no route: network error
    expect(status()?.textContent).toContain(t('dataExportService.deleteAccountUnknown'));
    expect(shown()).not.toMatch(/nothing was removed/i);

    checkAgain()?.click();
    await settle();

    expect(sent).toEqual(['DELETE /api/account', 'GET /api/account']);
    expect(status()?.textContent).toContain(t('dataExportService.accountStillOpen'));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('Check again that gets a 401 signs out and says only that the sign-in is refused', async () => {
    serve(
      { method: 'DELETE', url: '/api/account', status: 504, body: {} },
      { method: 'GET', url: '/api/account', status: 401, body: {} }
    );
    localStorage.setItem('voiceai_userName', 'Sam');
    await dataRightsCallbacks().onDeleteAccount?.();

    checkAgain()?.click();
    await settle();

    expect(sent).toEqual(['DELETE /api/account', 'GET /api/account']);
    const said = t('dataExportService.accountSignInRefused');
    expect(toast.info).toHaveBeenCalledWith(said);
    expect(toast.success).not.toHaveBeenCalled();
    // A 401 is also an expired or revoked token: never claims the account is closed
    expect(said).not.toMatch(/\bclosed\b|is deleted|was deleted/i);
    expect(said).toMatch(/no longer accepted/i);
    expect(said).toMatch(/sign in again/i);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('voiceai_userName')).toBeNull();
  });
});
