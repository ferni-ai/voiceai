/**
 * A deployment without an Ecobee app key still answers "are you connected?".
 *
 * Every route used to 503 when the key was unset, including GET /status, which
 * the Set the Mood panel calls on open: each user saw a failed request, a retry
 * and console errors for an integration that simply isn't offered.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeAll, describe, expect, it } from 'vitest';

delete process.env.ECOBEE_API_KEY;

const { handleEcobeeRoutes } = await import('../ecobee.js');

async function call(method: string, pathname: string) {
  const req = { method, headers: {} } as IncomingMessage;
  let status = 0;
  let body = '';
  const res = {
    setHeader: () => res,
    writeHead: (code: number) => ((status = code), res),
    end: (chunk?: string) => void (body = chunk ?? ''),
  } as unknown as ServerResponse;
  await handleEcobeeRoutes(req, res, pathname, new URL(`http://x${pathname}`));
  return { status, body: body ? JSON.parse(body) : undefined };
}

describe('Ecobee routes without an app key', () => {
  beforeAll(() => expect(process.env.ECOBEE_API_KEY).toBeUndefined());

  it('status says not connected instead of failing', async () => {
    expect(await call('GET', '/api/ecobee/status')).toEqual({
      status: 200,
      body: { connected: false, configured: false },
    });
  });

  it('actions still report that Ecobee is not set up', async () => {
    expect((await call('POST', '/api/ecobee/link/start')).status).toBe(503);
    expect((await call('POST', '/api/ecobee/temperature')).status).toBe(503);
  });
});
