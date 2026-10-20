/**
 * "Privacy & your data": the settings entry that opens the data panel.
 *
 * The entry used to read "Take Your Story", which hid where export, delete
 * data and delete account live. These tests drive the real menu and the real
 * panel wiring (app/panel-methods.ts -> data-export.service.ts) and stub only
 * the network and auth, so a renamed label, a dropped callback or a changed
 * delete request all fail here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(async () => 'id-token-abc'),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/push-preference.js', () => ({
  signOutReleasingPush: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/rituals.service.js', () => ({
  ritualsService: { clearAll: vi.fn() },
}));

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');
const { showDataExport } = await import('../../src/app/panel-methods.js');
const { getDataExportUI } = await import('../../src/ui/data-export.ui.js');

function menuItemByLabel(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.settings-menu__item')].find(
    (el) => el.querySelector('.settings-menu__label')?.textContent?.trim() === label
  );
}

describe('settings menu: "Privacy & your data"', () => {
  const onExportDataClick = vi.fn();

  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    initSettingsMenuUI({ onExportDataClick });
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
    onExportDataClick.mockClear();
  });

  it('shows one clearly named entry that opens the data panel', () => {
    expect(menuItemByLabel('Take Your Story')).toBeUndefined();
    const item = menuItemByLabel('Privacy & your data');
    expect(item, 'menu item labeled "Privacy & your data"').toBeDefined();
    expect(item?.dataset.action).toBe('export');
    expect(onExportDataClick).not.toHaveBeenCalled();

    item?.click();

    expect(onExportDataClick).toHaveBeenCalledTimes(1);
  });
});

describe('data panel: says what Ferni keeps and deletes the account for real', () => {
  type FetchCall = { url: string; method: string; body: unknown };
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({
        url: href,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const body = href === '/api/export/categories' ? { categories: [] } : { success: true };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    getDataExportUI().destroy();
    vi.restoreAllMocks();
  });

  it('tells the user what is saved and links the privacy policy', async () => {
    await showDataExport();

    const footer = document.querySelector('.data-export__footer p');
    expect(footer?.textContent).toContain(
      'I save our conversations and the things you tell me so I can remember them next time, and if you ever want them gone, deleting your account erases them.'
    );
    expect(footer?.textContent).not.toContain('We respect your privacy');

    const link = footer?.querySelector<HTMLAnchorElement>('a.data-export__privacy-link');
    expect(link?.textContent).toBe('Read the privacy policy');
    expect(link?.getAttribute('href')).toBe('https://ferni.ai/privacy');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener');
  });

  it('"Delete my account" sends DELETE /api/account through the real wiring', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // success schedules a redirect home after 1.5s; keep it from navigating jsdom
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await showDataExport();
    const button = document.querySelector<HTMLButtonElement>('.data-export__delete-account');
    expect(button?.textContent).toBe('Delete my account');
    expect(calls.some((c) => c.url === '/api/account')).toBe(false);

    button?.click();

    expect(window.confirm).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/account')).toBe(true));
    const accountCalls = calls.filter((c) => c.url === '/api/account');
    expect(accountCalls).toHaveLength(1);
    expect(accountCalls[0].method).toBe('DELETE');
    expect(accountCalls[0].body).toEqual({ confirmation: 'DELETE_MY_ACCOUNT' });
  });

  it('does not delete anything when the user cancels the confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await showDataExport();
    document.querySelector<HTMLButtonElement>('.data-export__delete-account')?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
});
