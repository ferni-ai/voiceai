/**
 * #4069 honest states, Feature Flags: a failed load says so instead of showing an empty
 * list, and the bulk buttons say they change only the trust flags, which is all the
 * server's enable-all and disable-all routes change.
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

type Route = { status: number; body?: unknown } | 'network-error';
let routes: Record<string, Route> = {};

const fetchMock = vi.fn(async (url: string) => {
  const route = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix))?.[1];
  if (!route || route === 'network-error') throw new TypeError('Failed to fetch');
  return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
});

const textOf = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('style').forEach((style) => style.remove());
  return div.textContent ?? '';
};

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
  it('a failed load shows its status, not an empty flag list', async () => {
    routes = { '/api/v1/admin/flags': { status: 403 } };
    const { render } = await import('../../src/admin/sections/FlagsSection.js');
    const text = textOf(await render());
    expect(text).toContain('Feature flags unavailable (HTTP 403)');
    expect(text).not.toContain('No Feature Flags');
  });

  it('the bulk buttons and their dialog say they change only the trust flags', async () => {
    routes = { '/api/v1/admin/flags': { status: 200, body: { flags: [], trustFlags: {} } } };
    const { render } = await import('../../src/admin/sections/FlagsSection.js');
    const text = textOf(await render());
    expect(text).toContain('Enable All Trust Flags');
    expect(text).toContain('Disable All Trust Flags');
    const { runQuickAction } = await import('../../src/admin/admin-events.js');
    await runQuickAction('enable-all-flags');
    const dialog = document.querySelector('.admin-modal-overlay')?.textContent ?? '';
    expect(dialog).toContain('every trust flag');
    expect(dialog).not.toContain('ALL feature flags');
  });
});
