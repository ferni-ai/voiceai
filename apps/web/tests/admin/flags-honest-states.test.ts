/**
 * #4069 honest states, Feature Flags. The section lists the trust flags, the only flags
 * GET /api/v1/admin/flags manages, once each with their real descriptions; a failed load
 * says so; and the bulk buttons say exactly what the server does to them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer admin-token' })),
}));

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

type Route = { status: number; body?: unknown };
let routes: Record<string, Route> = {};

const fetchMock = vi.fn(async (url: string) => {
  const route = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix))?.[1];
  if (!route) throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
});

/** GET /api/v1/admin/flags as the server builds it: `flags` is Object.values(trustFlags). */
const trustFlags = {
  'trust.boundary-memory': {
    enabled: true,
    percentage: 100,
    description: 'Remember topics to avoid',
  },
  'trust.small-wins': {
    enabled: false,
    percentage: 0,
    description: 'Celebrate effort and progress',
  },
};
const serverResponse = {
  flags: Object.values(trustFlags),
  trustFlags,
  categories: ['trust', 'features', 'experimental'],
  count: 2,
};

async function renderSection(): Promise<HTMLElement> {
  const { render } = await import('../../src/admin/sections/FlagsSection.js');
  const root = document.createElement('div');
  root.innerHTML = await render();
  root.querySelectorAll('style').forEach((style) => style.remove());
  return root;
}

/** Open a bulk action's dialog, check its text, confirm it, and wait for its request. */
async function confirmAction(action: string, path: string): Promise<string> {
  const { runQuickAction } = await import('../../src/admin/admin-events.js');
  await runQuickAction(action);
  const dialog = document.querySelector('.admin-modal-overlay') as HTMLElement;
  const text = dialog.textContent ?? '';
  const confirm = dialog.querySelector('[data-action="confirm"]') as HTMLButtonElement;
  expect(confirm.getAttribute('aria-label')).toBe(confirm.textContent?.trim());
  confirm.click();
  await vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' }))
  );
  return text;
}

beforeEach(() => {
  routes = {};
  fetchMock.mockClear();
  Object.values(toast).forEach((fn) => fn.mockClear());
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature Flags (FL1, FL2)', () => {
  it('lists each trust flag once, by id, with its real description and state', async () => {
    routes = { '/api/v1/admin/flags': { status: 200, body: serverResponse } };
    const root = await renderSection();
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.flag-item'));
    expect(rows.map((row) => row.dataset.flag)).toEqual(Object.keys(trustFlags));
    expect(rows.map((row) => row.querySelector('.flag-name')?.textContent)).toEqual(
      Object.keys(trustFlags)
    );
    expect(rows.map((row) => row.querySelector('.flag-desc')?.textContent)).toEqual([
      'Remember topics to avoid',
      'Celebrate effort and progress',
    ]);
    expect(rows.map((row) => row.classList.contains('flag-item--disabled'))).toEqual([false, true]);
    expect(root.textContent).not.toMatch(/undefined|System/);
  });

  it('a failed load shows its status, not an empty flag list', async () => {
    routes = { '/api/v1/admin/flags': { status: 403 } };
    const text = (await renderSection()).textContent ?? '';
    expect(text).toContain('Feature flags unavailable (HTTP 403)');
    expect(text).not.toContain('No Feature Flags');
  });

  it('the bulk buttons say they change only the trust flags', async () => {
    routes = { '/api/v1/admin/flags': { status: 200, body: serverResponse } };
    const text = (await renderSection()).textContent ?? '';
    expect(text).toContain('Enable All Trust Flags');
    expect(text).toContain('Disable All Trust Flags');
  });

  it('enable all: the dialog says what happens, then the request and toast follow', async () => {
    routes = { '/api/v1/admin/flags/enable-all': { status: 200, body: { success: true } } };
    const text = await confirmAction('enable-all-flags', '/api/v1/admin/flags/enable-all');
    expect(text).toContain('Enable All Trust Flags');
    expect(text).toContain('every trust flag listed here, at 100% rollout');
    expect(text).not.toMatch(/ALL feature flags/i);
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('All trust flags enabled'));
  });

  it('disable all: the dialog says what happens, then the request and toast follow', async () => {
    routes = { '/api/v1/admin/flags/disable-all': { status: 200, body: { success: true } } };
    const text = await confirmAction('disable-all-flags', '/api/v1/admin/flags/disable-all');
    expect(text).toContain('Disable All Trust Flags');
    expect(text).toContain('every trust flag listed here, at 0% rollout (kill switch)');
    expect(text).not.toMatch(/ALL feature flags/i);
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledWith('All trust flags disabled'));
  });

  it('a refused bulk action says it failed', async () => {
    routes = { '/api/v1/admin/flags/disable-all': { status: 403 } };
    await confirmAction('disable-all-flags', '/api/v1/admin/flags/disable-all');
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't disable trust flags")
    );
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
