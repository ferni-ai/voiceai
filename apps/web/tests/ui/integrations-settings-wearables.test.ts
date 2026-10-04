/**
 * The integrations panel only offers wearables the server can actually connect,
 * hides platforms with no server route (Google Fit, Eight Sleep), and renders
 * with the real /api/v1/integrations/status shape (which has no `linkedin`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out', STANDARD: 'ease' },
}));
vi.mock('../../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1' }));

const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

/** Exactly what src/api/v1/integrations/handler.ts sends for GET /status. */
const serverStatus = {
  userId: 'u1',
  integrations: {
    biometrics: { connected: false, platform: null },
    calendar: { connected: false },
    banking: { connected: false },
    socialGraph: { enabled: true, peopleTracked: 0 },
  },
  capabilities: {
    stressAwareness: false,
    sleepAwareness: false,
    eventAnticipation: false,
    locationAwareness: false,
    financialPrediction: false,
    relationshipInsights: false,
  },
};

function routeApi(
  wearables: Array<{ provider: string; configured: boolean; linked: boolean }>
): void {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/api/v1/integrations/status')
      return { ok: true, status: 200, data: serverStatus };
    if (path === '/wearables/status')
      return { ok: true, status: 200, data: { providers: wearables } };
    return { ok: false, status: 404 };
  });
}

describe('IntegrationsSettingsUI wearables', () => {
  beforeEach(() => {
    vi.resetModules();
    mockApiGet.mockReset();
    document.body.innerHTML = '';
  });

  it('enables only server-configured wearables and hides ones with no route', async () => {
    routeApi([
      { provider: 'apple_health', configured: true, linked: false },
      { provider: 'oura', configured: true, linked: false },
      { provider: 'whoop', configured: false, linked: false },
      { provider: 'fitbit', configured: false, linked: false },
      { provider: 'garmin', configured: false, linked: false },
    ]);
    const { getIntegrationsSettingsUI } = await import('../../src/ui/integrations-settings.ui.js');

    await getIntegrationsSettingsUI().show();

    const connectable = [...document.querySelectorAll('[data-action="connect-biometrics"]')].map(
      (b) => (b as HTMLElement).dataset.platform
    );
    expect(connectable).toEqual(['apple_health', 'oura']);
    const disabled = [
      ...document.querySelectorAll('.integrations-settings__platform-btn--disabled'),
    ].map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
    expect(disabled).toEqual([
      'WHOOP Not available yet',
      'Fitbit Not available yet',
      'Garmin Not available yet',
    ]);
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Google Fit');
    expect(text).not.toContain('Eight Sleep');
  });

  it('shows a wearable linked through /wearables as connected', async () => {
    routeApi([{ provider: 'oura', configured: true, linked: true }]);
    const { getIntegrationsSettingsUI } = await import('../../src/ui/integrations-settings.ui.js');

    await getIntegrationsSettingsUI().show();

    expect(document.querySelector('[data-action="disconnect-biometrics"]')).not.toBeNull();
    expect(document.querySelector('[data-action="connect-biometrics"]')).toBeNull();
  });
});
