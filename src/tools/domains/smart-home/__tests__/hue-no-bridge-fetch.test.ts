/**
 * The agent never contacts a user-supplied Hue bridge: from LiveKit Cloud a
 * home-LAN bridge is unreachable and fetching a user-chosen host is SSRF. A
 * saved bridge gets the calm "needs Hue remote access" answer instead.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ hueClient: vi.fn(), outbound: [] as string[] }));
vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { getLogger: () => logger, createLogger: () => logger, safeLog: () => logger };
});
vi.mock('../../../../services/self-healing/index.js', () => ({
  getLifxClient: vi.fn(() => ({ isHealthy: () => false })),
  getHueClient: h.hueClient, // a trap: nothing may build a client to a bridge
}));
vi.mock('../../../../services/smart-home/user-credentials.js', () => ({
  getUserSmartHomeCredentials: vi.fn(async () => ({
    hue: { bridgeIp: '10.0.0.5', username: 'fixturehueappkey' },
    lifx: null,
    sonos: null,
  })),
}));
vi.mock('../../../../services/identity/ecobee-auth.js', () => ({
  isEcobeeConfigured: async () => false,
}));
vi.mock('../../../../services/identity/ecobee-api.js', () => ({ getEcobeeApi: () => null }));

const { getAllDevices, controlDevice } = await import('../smart-home.js');
const { HUE_NEEDS_REMOTE_ACCESS } =
  await import('../../../../services/smart-home/hue-remote-access.js');

describe('agent Hue tools never fetch the bridge', () => {
  beforeAll(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      h.outbound.push(
        String(typeof input === 'string' ? input : 'url' in input ? input.url : input)
      );
      return new globalThis.Response('{}');
    });
  });
  afterEach(() => {
    // No request may name the user-supplied host, and no Hue client may exist.
    expect(h.outbound.filter((u) => u.includes('10.0.0.5'))).toEqual([]);
    expect(h.hueClient).not.toHaveBeenCalled();
  });

  it('lists no Hue lights for a saved bridge', async () => {
    expect(await getAllDevices('u1')).toEqual([]);
  });

  it('answers a light command with the calm remote-access message', async () => {
    expect(await controlDevice('living room', 'on', undefined, 'u1')).toBe(HUE_NEEDS_REMOTE_ACCESS);
  });
});
