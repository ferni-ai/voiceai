/**
 * A LiveKit token's identity is the verified id when one is given, and the
 * display name is always the participant name. Without an identity (the demo
 * route), the name doubles as the identity, as before.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

let createToken: typeof import('../livekit.js').createToken;

beforeAll(async () => {
  vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret-test-secret-test-secret');
  ({ createToken } = await import('../livekit.js'));
});

/** The JWT's claims (LiveKit puts the identity in `sub` and the display name in `name`) */
function claims(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('createToken identity', () => {
  it('uses the verified identity and keeps the participant name as the display name', async () => {
    const jwt = await createToken({ roomName: 'r', participantName: 'Sam', identity: 'uid-123' });
    expect(claims(jwt)).toMatchObject({ sub: 'uid-123', name: 'Sam' });
  });

  it('falls back to the participant name as the identity', async () => {
    const jwt = await createToken({ roomName: 'r', participantName: 'Visitor' });
    expect(claims(jwt)).toMatchObject({ sub: 'Visitor', name: 'Visitor' });
  });
});
