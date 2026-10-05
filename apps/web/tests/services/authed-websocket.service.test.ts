/**
 * Per-user WebSockets carry the Firebase ID token as a subprotocol, never in
 * the URL: Cloud Run and the Google front end log full request URLs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthToken = vi.fn<() => Promise<string | null>>();
vi.mock('../../src/services/firebase-auth.service.js', () => ({ getAuthToken }));

const { openAuthedWebSocket } = await import('../../src/services/authed-websocket.service.js');

const opened: Array<{ url: string; protocols: unknown }> = [];
class FakeWebSocket {
  constructor(url: string, protocols?: unknown) {
    opened.push({ url, protocols });
  }
}

describe('openAuthedWebSocket', () => {
  beforeEach(() => {
    opened.length = 0;
    getAuthToken.mockReset();
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers the token as bearer.<token> next to ferni.v1, not in the URL', async () => {
    getAuthToken.mockResolvedValue('jwt.abc.def');
    await openAuthedWebSocket('wss://app.test/ws/director?sessionId=s1&userId=u1&token=old');

    expect(opened).toHaveLength(1);
    expect(opened[0].protocols).toEqual(['ferni.v1', 'bearer.jwt.abc.def']);
    expect(opened[0].url).toBe('wss://app.test/ws/director?sessionId=s1');
    expect(opened[0].url).not.toContain('jwt.abc.def');
  });

  it('opens nothing and throws when no one is signed in', async () => {
    getAuthToken.mockResolvedValue(null);
    await expect(openAuthedWebSocket('wss://app.test/ws/insights')).rejects.toThrow(
      /Not signed in/
    );
    expect(opened).toHaveLength(0);
  });
});
