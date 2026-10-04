/**
 * Biometrics + banking services call the routes the UI server actually serves
 * and report failure honestly (no navigation to a 503, no fake success).
 *
 * Route contract on the server side: src/servers/api/routes/__tests__/web-route-contract.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiDelete: mockApiDelete,
}));

const mockLocation = { href: 'http://localhost:3004/' };
Object.defineProperty(window, 'location', { value: mockLocation, writable: true });

const ok = <T>(data: T) => ({ ok: true, status: 200, data });

const wearablesStatus = (ouraConfigured: boolean) =>
  ok({
    providers: [
      { provider: 'apple_health', configured: true, linked: false },
      { provider: 'fitbit', configured: false, linked: false },
      { provider: 'oura', configured: ouraConfigured, linked: false },
      { provider: 'garmin', configured: false, linked: false },
      { provider: 'whoop', configured: false, linked: true },
    ],
  });

describe('biometrics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = 'http://localhost:3004/';
  });

  it('does not send users to an unconfigured wearable login (server would 503)', async () => {
    const { connectBiometrics } = await import('../../src/services/biometrics.service.js');
    mockApiGet.mockResolvedValueOnce(wearablesStatus(false));

    const result = await connectBiometrics('oura', 'device-1');

    expect(mockApiGet).toHaveBeenCalledWith('/wearables/status', { user_id: 'device-1' });
    expect(result).toEqual({ success: false, error: "Oura Ring isn't available yet" });
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });

  it('navigates to the server OAuth start route when the provider is configured', async () => {
    const { connectBiometrics } = await import('../../src/services/biometrics.service.js');
    mockApiGet.mockResolvedValueOnce(wearablesStatus(true));

    const result = await connectBiometrics('oura', 'device-1');

    expect(result).toEqual({ success: true });
    expect(mockLocation.href).toBe('/wearables/oura/login?user_id=device-1&return_url=%2F');
  });

  it('says it could not reach the server instead of guessing', async () => {
    const { connectBiometrics } = await import('../../src/services/biometrics.service.js');
    mockApiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    const result = await connectBiometrics('whoop', 'device-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe("Couldn't reach WHOOP. Try again?");
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });

  it('offers only wearables the server has routes for, and only configured ones as available', async () => {
    const { getBiometricsPlatformList, getLinkedWearables } =
      await import('../../src/services/biometrics.service.js');
    const providers = wearablesStatus(true).data.providers;

    const list = getBiometricsPlatformList(providers as never);

    expect(list.map((p) => p.id)).toEqual(['apple_health', 'oura', 'whoop', 'fitbit', 'garmin']);
    expect(list.filter((p) => p.available).map((p) => p.id)).toEqual(['apple_health', 'oura']);
    expect(
      getBiometricsPlatformList(null)
        .filter((p) => p.available)
        .map((p) => p.id)
    ).toEqual(['apple_health']);
    expect(getLinkedWearables(providers as never)).toEqual(['whoop']);
  });

  it('disconnect unlinks linked wearables and the biometrics service, and fails if either fails', async () => {
    const { disconnectBiometrics } = await import('../../src/services/biometrics.service.js');
    mockApiPost.mockResolvedValueOnce(ok({ success: true }));
    mockApiDelete.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await disconnectBiometrics('device-1', ['whoop']);

    expect(mockApiPost).toHaveBeenCalledWith('/wearables/whoop/unlink?user_id=device-1', {});
    expect(mockApiDelete).toHaveBeenCalledWith('/api/v1/integrations/biometrics/disconnect');
    expect(result.success).toBe(false);
  });
});

describe('banking.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the v1 link-token route and says so honestly when Plaid is not configured', async () => {
    const { connectBanking } = await import('../../src/services/banking.service.js');
    mockApiPost.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: 'Plaid service not configured',
    });

    const result = await connectBanking();

    expect(mockApiPost).toHaveBeenCalledWith('/api/v1/integrations/banking/link-token', {});
    expect(result).toEqual({ success: false, error: "Bank linking isn't available yet" });
  });

  it('reads status from the v1 route and its real shape', async () => {
    const { fetchBankingStatus } = await import('../../src/services/banking.service.js');
    mockApiGet.mockResolvedValueOnce(
      ok({ connected: true, institution: 'Chase', linkedAt: '2026-10-01' })
    );

    const status = await fetchBankingStatus();

    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/integrations/banking/status');
    expect(status).toEqual({ connected: true, institution: 'Chase', linkedAt: '2026-10-01' });
  });

  it('disconnects with DELETE (the only method the server accepts)', async () => {
    const { disconnectBanking } = await import('../../src/services/banking.service.js');
    mockApiDelete.mockResolvedValueOnce(ok({ success: true }));

    expect(await disconnectBanking()).toEqual({ success: true });
    expect(mockApiDelete).toHaveBeenCalledWith('/api/v1/integrations/banking/disconnect');
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
