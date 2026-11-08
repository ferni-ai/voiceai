/**
 * A WebSocket upgrade whose token's account couldn't be checked (token-revocation.ts: Auth
 * down, no recent state) is refused 503 with Retry-After, as requireAuth answers over HTTP,
 * not 401 (#3228). It is still refused: verifyUpgradeCaller answers null.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'unchecked') {
      throw Object.assign(new Error('unchecked'), { code: 'auth/revocation-check-unavailable' });
    }
    throw new Error('Authentication service unavailable');
  }),
}));

import { rejectUpgrade, verifyUpgradeCaller } from '../ws-identity.js';

function upgrade(token: string): { request: IncomingMessage; written: () => string } {
  let out = '';
  const socket = {
    writable: true,
    write: (chunk: string) => (out += chunk),
    destroy: vi.fn(),
  } as unknown as Duplex;
  const request = {
    headers: { 'sec-websocket-protocol': `ferni.v1, bearer.${token}` },
    socket,
  } as unknown as IncomingMessage;
  return { request, written: () => out };
}

describe('WebSocket upgrade with a token that could not be checked', () => {
  it('is refused 503 with Retry-After', async () => {
    const { request, written } = upgrade('unchecked');

    expect(await verifyUpgradeCaller(request)).toBeNull();
    rejectUpgrade(request.socket);

    expect(written()).toMatch(/^HTTP\/1\.1 503 Service Unavailable\r\nRetry-After: 5\r\n/);
    expect(request.socket.destroy).toHaveBeenCalled();
  });

  it('any other failure is still a 401, and a 403 stays a 403', async () => {
    const other = upgrade('other');
    expect(await verifyUpgradeCaller(other.request)).toBeNull();
    rejectUpgrade(other.request.socket);
    expect(other.written()).toMatch(/^HTTP\/1\.1 401 Unauthorized\r\n/);

    const forbidden = upgrade('unchecked');
    await verifyUpgradeCaller(forbidden.request);
    rejectUpgrade(forbidden.request.socket, 403);
    expect(forbidden.written()).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/);
  });
});
