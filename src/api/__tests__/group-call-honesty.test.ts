/**
 * POST /api/group/call/add and /call/remove must never claim a call they
 * didn't place.
 *
 * Before: /call/add answered `success: true, status: 'dialing'` without
 * dialing anyone ("For now, return simulated success"), /call/remove answered
 * success without ending anything, and because the router is mounted without
 * a body parser (src/servers/api/index.ts) every real request crashed into a
 * 500 instead. Now both say plainly that call control isn't available.
 */

import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

const { groupConversationRoutes } = await import('../group-conversation-routes.js');

let server: http.Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

/** Serve the router the way src/servers/api/index.ts does, optionally with a JSON body parser. */
async function serve(options: { verifiedUid?: string; parseJson: boolean }): Promise<string> {
  const app = express();
  app.use((req, _res, next) => {
    // bindVerifiedIdentity sets this header only from a verified token.
    if (options.verifiedUid) req.headers['x-firebase-uid'] = options.verifiedUid;
    next();
  });
  if (options.parseJson) app.use(express.json());
  app.use('/api/group', groupConversationRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/group`;
}

async function post(
  url: string,
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const sam = { phoneNumber: '(555) 123-4567', name: 'Sam', relationship: 'friend' };

describe('conference call control', () => {
  it.each([true, false])(
    'add says it is unavailable, never "dialing" (json parser: %s)',
    async (parseJson) => {
      const base = await serve({ verifiedUid: 'signed-in-user', parseJson });

      const { status, body } = await post(`${base}/call/add`, sam);

      expect(status).toBe(501);
      expect(body).toEqual({
        success: false,
        error: "Adding people to a call isn't available yet",
      });
    }
  );

  it('remove does not claim to have removed anyone', async () => {
    const base = await serve({ verifiedUid: 'signed-in-user', parseJson: true });

    const { status, body } = await post(`${base}/call/remove`, {
      sessionId: 'group_1',
      participantId: 'ext_call_1',
    });

    expect(status).toBe(501);
    expect(body.success).toBe(false);
  });

  it('still asks for sign-in first', async () => {
    const base = await serve({ parseJson: true });

    const { status } = await post(`${base}/call/add`, sam);

    expect(status).toBe(401);
  });
});
