/**
 * Household routes (src/api/voice-auth/household-routes.ts) answer 400 unless
 * the request carries X-Device-ID. The header comes from utils/api getDeviceId(),
 * so it must read the key app.state actually persists the device id under.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthToken: vi.fn(async () => null),
  getFirebaseUid: vi.fn(() => null),
  initAuth: vi.fn(async () => ({})),
}));

describe('device id header', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('sends the device id that app.state generated and persisted', async () => {
    const state = await import('../../src/state/app.state.js');
    const { getApiHeaders, getDeviceId } = await import('../../src/utils/api.js');

    const stateDeviceId = state.getDeviceId();
    expect(stateDeviceId).toBeTruthy();
    expect(getDeviceId()).toBe(stateDeviceId);

    const headers = getApiHeaders() as Record<string, string>;
    expect(headers['X-Device-Id']).toBe(stateDeviceId);
  });

  it('reads an id persisted by an earlier session', async () => {
    localStorage.setItem('voiceai_deviceId', 'device-from-last-visit');
    const { getApiHeaders } = await import('../../src/utils/api.js');
    expect((getApiHeaders() as Record<string, string>)['X-Device-Id']).toBe('device-from-last-visit');
  });
});
