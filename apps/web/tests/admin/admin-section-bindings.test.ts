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

  it('runs a full refresh every minute and checks active-now every 10 seconds', async () => {
    vi.useFakeTimers();
    const bm = await import('../../src/admin/sections/BusinessMetricsSection.js');
    document.body.innerHTML = bm.render();
    await bm.init();
    adminGet.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(paths().filter((p) => p === '/api/analytics/summary')).toHaveLength(1);
    expect(paths().filter((p) => p === '/api/analytics/concurrent')).toHaveLength(6);
    bm.cleanup();
  });

  it('the portal stops it through the registry when it leaves the section', async () => {
    vi.useFakeTimers();
    const entry = section('business-metrics');
    document.body.innerHTML = `<div id="adminContent">${await entry.component()}</div>`;
    await entry.setup?.(document.getElementById('adminContent') as HTMLElement);
    entry.cleanup?.();
    await vi.advanceTimersByTimeAsync(0);
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

const DEFAULTS = { model: 'gemini-3.5-flash', temperature: 0.7, language: 'en-US' };
const FERNI = {
  personaId: 'ferni',
  useSystemPromptOverride: true,
  systemPromptOverride: 'be brief',
  gemini: DEFAULTS,
  updatedAt: '2026-11-18T00:00:00.000Z',
};

/** A model-config server: GET answers with the store, PUT and DELETE succeed. */
function modelConfigServer(personas: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'DELETE') {
      return new Response('{"success":true}', { status: 200 });
    }
    if (url === '/api/v1/admin/model-config') {
      const store = { defaults: DEFAULTS, toolDefaults: null, personas, version: 1 };
      return new Response(JSON.stringify({ data: store }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    sent: (method: string) =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === method).map(([url]) => url),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('Model Config', () => {
  it('sends one PUT per save after a persona is loaded', async () => {
    const server = modelConfigServer({});
    const mc = await import('../../src/admin/sections/ModelConfigSection.js');
    document.body.innerHTML = await mc.render();
    mc.setupEvents();

    for (let i = 0; i < 3; i++) {
      document.querySelector<HTMLButtonElement>('[data-action="load-persona"]')?.click();
    }
    await settle();

    const form = document.querySelector<HTMLFormElement>('[data-form="defaults"]');
    expect(form).not.toBeNull();
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(server.sent('PUT')).not.toHaveLength(0));
    await settle();
    expect(server.sent('PUT')).toEqual(['/api/v1/admin/model-config/defaults']);
  });

  it('binds the persona form once on first render and again after a load', async () => {
    const server = modelConfigServer({ ferni: FERNI });
    vi.stubGlobal('confirm', () => true);
    const mc = await import('../../src/admin/sections/ModelConfigSection.js');
    document.body.innerHTML = await mc.render();
    mc.setupEvents();

    const exercise = async (): Promise<void> => {
      const form = document.querySelector<HTMLFormElement>('[data-form="persona"]');
      const box = form?.querySelector<HTMLInputElement>('input[name="useSystemPromptOverride"]');
      const prompt = form?.querySelector<HTMLTextAreaElement>(
        'textarea[name="systemPromptOverride"]'
      );
      expect(box && prompt).toBeTruthy();
      if (!box || !prompt) return;
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      expect(prompt.disabled).toBe(true);
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      expect(prompt.disabled).toBe(false);
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
      form?.querySelector<HTMLButtonElement>('[data-action="delete-persona"]')?.click();
      await settle();
    };

    await exercise();
    expect(server.sent('PUT')).toEqual(['/api/v1/admin/model-config/persona/ferni']);
    expect(server.sent('DELETE')).toEqual(['/api/v1/admin/model-config/persona/ferni']);

    document.querySelector<HTMLButtonElement>('[data-action="load-persona"]')?.click();
    await settle();
    await exercise();
    expect(server.sent('PUT')).toHaveLength(2);
    expect(server.sent('DELETE')).toHaveLength(2);
  });
});
