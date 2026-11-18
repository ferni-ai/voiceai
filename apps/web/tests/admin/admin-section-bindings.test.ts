/**
 * Business Metrics and Model Config bind their controls once per visit:
 * - Business Metrics' init() was never called, so the section made no requests, and its
 *   minute poll was never stored, so nothing could stop it.
 * - Model Config re-ran its whole setup on "Load", binding every other form again, so the
 *   next save sent its PUT twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminGet = vi.fn(async (path: string) =>
  path === '/api/analytics/concurrent' ? { ok: false, status: 500 } : { ok: false, status: 503 }
);
vi.mock('../../src/admin/admin-api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/admin/admin-api.js')>()),
  adminGet,
  getAdminHeadersAsync: async () => ({ Authorization: 'Bearer admin-token' }),
}));

const { ADMIN_SECTIONS } = await import('../../src/admin/section-registry.js');
const section = (id: string) => {
  const found = ADMIN_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};
const paths = () => adminGet.mock.calls.map(([p]) => p);

beforeEach(() => {
  adminGet.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Business Metrics', () => {
  it('loads its numbers when the portal opens it', async () => {
    const bm = section('business-metrics');
    document.body.innerHTML = `<div id="adminContent">${await bm.component()}</div>`;
    await bm.setup?.(document.getElementById('adminContent') as HTMLElement);
    expect(paths()).toEqual(
      expect.arrayContaining([
        '/api/analytics/summary',
        '/api/subscription/metrics',
        '/api/analytics/concurrent',
      ])
    );
    bm.cleanup?.();
  });

  it('shows "--", not 0, when the active-now read fails', async () => {
    const bm = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = bm.render();
    await bm.init();
    expect(document.getElementById('concurrent-count')?.textContent).toBe('--');
    bm.cleanup();
  });

  it('refreshes from its Refresh button', async () => {
    const bm = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = bm.render();
    await bm.init();
    adminGet.mockClear();
    document.querySelector<HTMLButtonElement>('[data-bm-refresh]')?.click();
    await vi.waitFor(() => expect(paths()).toContain('/api/analytics/summary'));
    bm.cleanup();
  });

  it('stops both polls when the portal leaves it', async () => {
    vi.useFakeTimers();
    const bm = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = bm.render();
    await bm.init();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(paths()).toContain('/api/analytics/summary');
    bm.cleanup();
    adminGet.mockClear();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(adminGet).not.toHaveBeenCalled();
  });

  it('does not stack a second set of polls when opened twice', async () => {
    vi.useFakeTimers();
    const bm = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = bm.render();
    await bm.init();
    await bm.init();
    adminGet.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(paths().filter((p) => p === '/api/analytics/concurrent')).toHaveLength(1);
    bm.cleanup();
  });
});

describe('Model Config', () => {
  it('sends one PUT per save after a persona is loaded', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('{"success":true}', { status: 200 });
      if (url === '/api/v1/admin/model-config') {
        const defaults = { model: 'gemini-3.5-flash', temperature: 0.7, language: 'en-US' };
        const store = { defaults, toolDefaults: null, personas: {}, version: 1 };
        return new Response(JSON.stringify({ data: store }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const mc = await import('../../src/admin/sections/ModelConfigSection.js');
    document.body.innerHTML = await mc.render();
    mc.setupEvents();

    for (let i = 0; i < 3; i++) {
      document.querySelector<HTMLButtonElement>('[data-action="load-persona"]')?.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const form = document.querySelector<HTMLFormElement>('[data-form="defaults"]');
    expect(form).not.toBeNull();
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true)
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts.map(([url]) => url)).toEqual(['/api/v1/admin/model-config/defaults']);
  });
});
