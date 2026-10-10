/**
 * What I Do For You (Ferni Care): the Connected services tab shows real status.
 *
 * Before, it said "coming soon" and offered nothing to connect.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const api = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: () => api.userId,
}));

const service = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  createFromTemplate: vi.fn(),
}));
vi.mock('../../src/services/life-automation.service.js', () => ({
  getLifeAutomationService: () => service,
}));

const mockOpenEverythingConnected = vi.fn();
vi.mock('../../src/ui/everything-connected.js', () => ({
  openEverythingConnected: mockOpenEverythingConnected,
}));

const mockToastError = vi.fn();
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: mockToastError } }));

let showFerniCareDashboard: () => void;

const text = (): string => document.body.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(async () => {
  // Fresh modules: both screens are singletons that keep a reference to their last overlay
  vi.resetModules();
  ({ showFerniCareDashboard } = await import('../../src/ui/ferni-care/dashboard.ui.js'));
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  api.userId = 'user-1';
  mockApiGet.mockReset();
  mockToastError.mockReset();
  mockOpenEverythingConnected.mockReset();
  service.listWorkflows.mockReset().mockResolvedValue([]);
  service.createWorkflow.mockReset().mockResolvedValue({ id: 'wf-1' });
  service.updateWorkflow.mockReset();
  service.createFromTemplate.mockReset();
  document.body.innerHTML = '';
});

describe('Ferni Care dashboard: Connected services tab', () => {
  async function openConnectionsTab(): Promise<void> {
    showFerniCareDashboard();
    await vi.waitFor(() => expect(document.querySelector('[data-tab="connections"]')).not.toBeNull());
    document.querySelector<HTMLElement>('[data-tab="connections"]')?.click();
  }

  it('lists real connection status instead of "coming soon"', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/integrations/status')
        return {
          ok: true,
          status: 200,
          data: { integrations: { calendar: { connected: true }, biometrics: { connected: false } } },
        };
      if (path === '/wearables/status')
        return {
          ok: true,
          status: 200,
          data: {
            providers: [
              { provider: 'oura', configured: true, linked: true },
              { provider: 'fitbit', configured: true, linked: false },
              { provider: 'garmin', configured: false, linked: false },
            ],
          },
        };
      return { ok: false, status: 404 };
    });

    await openConnectionsTab();
    await vi.waitFor(() => expect(text()).toContain('Oura Ring'));

    const rows = Object.fromEntries(
      [...document.querySelectorAll('.ferni-routine')].map((r) => [
        r.querySelector('.ferni-routine__name')?.textContent?.trim(),
        r.querySelector('.ferni-routine__status')?.textContent?.trim(),
      ])
    );
    expect(rows['Your Calendar']).toBe('Connected');
    expect(rows['Oura Ring']).toBe('Connected');
    expect(rows['Fitbit']).toBe('Not connected');
    expect(rows['Garmin']).toBeUndefined(); // the server has no OAuth for it: nothing to offer
    expect(text()).not.toMatch(/coming soon/i);
  });

  it('opens Everything Connected from the tab', async () => {
    mockApiGet.mockResolvedValue({ ok: true, status: 200, data: { providers: [] } });
    await openConnectionsTab();
    await vi.waitFor(() => expect(document.querySelector('[data-action="open-connections"]')).not.toBeNull());
    expect(text()).toContain('Everything Connected');
    document.querySelector<HTMLElement>('[data-action="open-connections"]')?.click();

    expect(mockOpenEverythingConnected).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ferni-care-overlay.visible')).toBeNull(); // the dashboard stepped aside
  });

  it('says so when the connections cannot be loaded', async () => {
    mockApiGet.mockResolvedValue({ ok: false, status: 500 });

    await openConnectionsTab();

    await vi.waitFor(() => expect(text()).toContain("Couldn't load your connected services"));
  });
});
