/**
 * Apple Health connects through the Ferni iOS app (ferniapp://healthkit/authorize).
 *
 * Before: the web panel followed that deep link on any device, so on a desktop
 * or Android browser pressing Connect went nowhere. Off iOS it now says where
 * to set Apple Health up instead.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet, apiPost: mockApiPost, apiDelete: vi.fn() }));

const toast = { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function useUserAgent(ua: string): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
}

async function pressConnectAppleHealth(): Promise<void> {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/api/wearable/status') {
      return { ok: true, status: 200, data: { success: true, status: {}, enabledProviders: [], config: {} } };
    }
    if (path === '/wearables/status') return { ok: true, status: 200, data: { providers: [] } };
    return { ok: false, status: 404 };
  });
  const { getWearableSettingsUI } = await import('../../src/ui/wearable-settings.ui.js');
  await getWearableSettingsUI().show();
  document.querySelector<HTMLElement>('[data-provider="apple_health"]')?.click();
  await new Promise((r) => setTimeout(r, 0));
}

describe('Apple Health connect on the web', () => {
  beforeEach(async () => {
    vi.resetModules();
    await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('on a desktop browser, says to use the iPhone app and does not follow the deep link', async () => {
    useUserAgent(DESKTOP_UA);

    await pressConnectAppleHealth();

    await vi.waitFor(() => expect(toast.info).toHaveBeenCalledWith('Set up Apple Health in the Ferni iPhone app'));
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/wearable/connect', expect.anything());
  });

  it('on an iPhone, still asks the server for the HealthKit link', async () => {
    useUserAgent(IPHONE_UA);
    mockApiPost.mockResolvedValue({ ok: true, status: 200, data: { success: false } });

    await pressConnectAppleHealth();

    await vi.waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith('/api/wearable/connect', { provider: 'apple_health' })
    );
    expect(toast.info).not.toHaveBeenCalled();
  });
});
