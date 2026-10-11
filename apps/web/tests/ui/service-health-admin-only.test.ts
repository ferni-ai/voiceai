/**
 * The service health pill reports the UI server's internal HTTP clients, so
 * only admins see it, it never polls for anyone else, and importing the module
 * does not start a second copy of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const ADMIN_KEY = 'ferni_admin_id';
const POLL_MS = 30_000;

async function loadModule() {
  return import('../../src/ui/service-health.ui.js');
}

function pills(): number {
  return document.querySelectorAll('.service-health-container').length;
}

describe('service health pill', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    apiGet.mockReset();
    apiGet.mockResolvedValue({
      ok: true,
      data: {
        status: 'unavailable',
        timestamp: new Date().toISOString(),
        summary: { totalClients: 0, healthyClients: 0, openCircuits: 0, halfOpenCircuits: 0 },
        unhealthyServices: [],
        httpClients: [],
      },
    });
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    const mod = await loadModule();
    mod.cleanupServiceHealthUI();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('shows nothing and never fetches for a non-admin user', async () => {
    const { initServiceHealthUI } = await loadModule();
    initServiceHealthUI();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);

    expect(pills()).toBe(0);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('does not start itself when the module is imported', async () => {
    localStorage.setItem(ADMIN_KEY, 'admin-1');
    await loadModule();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(pills()).toBe(0);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows one pill to an admin and keeps polling', async () => {
    localStorage.setItem(ADMIN_KEY, 'admin-1');
    const { initServiceHealthUI } = await loadModule();
    initServiceHealthUI();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(pills()).toBe(1);
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/health/circuits');

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(pills()).toBe(1);
  });
});
