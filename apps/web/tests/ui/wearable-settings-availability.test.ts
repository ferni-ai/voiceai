/**
 * The wearable panel asks the server which wearables are configured (the same
 * /wearables/status the Integrations screen uses) instead of a hard-coded
 * "coming soon / no backend API yet" flag, and connects through
 * startOAuthConnect (POST /auth/oauth/start) rather than the stub
 * /api/wearable/connect, which returned a bare provider URL that could never
 * complete.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiDelete: vi.fn(),
}));

const mockToastError = vi.fn();
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: mockToastError } }));

const panelStatus = {
  success: true,
  status: {},
  enabledProviders: [],
  config: {
    syncIntervalMinutes: 15,
    enableStressDetection: true,
    enableSleepAnalysis: true,
    enableActivityTracking: true,
    privacyMode: 'aggregated',
  },
};

function serve(providers: Array<{ provider: string; configured: boolean; linked: boolean }>): void {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/api/wearable/status') return { ok: true, status: 200, data: panelStatus };
    if (path === '/wearables/status') return { ok: true, status: 200, data: { providers } };
    return { ok: false, status: 404 };
  });
}

/** The panel row whose name is `name` (unavailable rows have no button to find them by). */
function rowNamed(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('.wearable-settings__provider')].find(
    (r) => r.querySelector('.wearable-settings__provider-name')?.textContent?.includes(name)
  );
  if (!found) throw new Error(`no row named ${name}`);
  return found;
}

async function openPanel(): Promise<void> {
  const { getWearableSettingsUI } = await import('../../src/ui/wearable-settings.ui.js');
  await getWearableSettingsUI().show();
}

describe('wearable settings: server-driven availability', () => {
  beforeEach(async () => {
    vi.resetModules();
    await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockToastError.mockReset();
    document.body.innerHTML = '';
  });

  it('offers Connect for configured providers and says so for unconfigured ones', async () => {
    serve([
      { provider: 'fitbit', configured: true, linked: false },
      { provider: 'oura', configured: true, linked: false },
      { provider: 'garmin', configured: false, linked: false },
      { provider: 'whoop', configured: false, linked: false },
    ]);

    await openPanel();

    const connectable = [...document.querySelectorAll<HTMLElement>('[data-provider]')].map(
      (b) => b.dataset.provider
    );
    expect(connectable).toEqual(['apple_health', 'fitbit', 'oura']);
    for (const unconfigured of ['Garmin', 'Whoop']) {
      const text = rowNamed(unconfigured).textContent ?? '';
      expect(text).toContain('Not set up yet');
      expect(text).not.toMatch(/coming soon/i);
    }
  });

  it('shows a provider linked on the server as connected, with Disconnect', async () => {
    serve([{ provider: 'whoop', configured: false, linked: true }]);

    await openPanel();

    const whoop = document.querySelector<HTMLElement>('[data-provider="whoop"]');
    expect(whoop?.dataset.connected).toBe('true');
    expect(whoop?.textContent).toContain('Disconnect');
  });

  it('connects through POST /auth/oauth/start with the signed-in OAuth helper', async () => {
    serve([{ provider: 'fitbit', configured: true, linked: false }]);
    mockApiPost.mockResolvedValue({ ok: false, status: 503 }); // refuse, so nothing navigates
    await openPanel();

    document.querySelector<HTMLElement>('[data-provider="fitbit"]')?.click();
    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));

    expect(mockApiPost).toHaveBeenCalledWith(
      '/auth/oauth/start',
      { provider: 'fitbit', returnUrl: '/' },
      { maxRetries: 0 }
    );
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/wearable/connect', expect.anything());
    expect(mockToastError).toHaveBeenCalledWith("Fitbit isn't available right now");
  });
});
