/**
 * POST /api/semantic-store/cleanup deletes documents across caller-named
 * collections. It used to run for anyone, unauthenticated.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/auth-middleware.js', () => ({ requireAdmin }));
const runTTLCleanup = vi.hoisted(() => vi.fn(async () => ({ totalDocsDeleted: 0 })));
vi.mock('../../../../services/data-layer/ttl-cleanup.js', () => ({
  runTTLCleanup,
  toPublicCleanupReport: (r: unknown) => r,
}));

import { handleHealthRoutes } from '../health.js';

async function post() {
  const req = Readable.from([Buffer.from(JSON.stringify({ dryRun: false, collections: ['bogle_users'] }))]) as unknown as IncomingMessage;
  Object.assign(req, { method: 'POST', url: '/api/semantic-store/cleanup', headers: {} });
  const res = {
    statusCode: 200,
    writeHead(status: number) {
      this.statusCode = status;
      return this;
    },
    setHeader() {},
    end() {},
  };
  await handleHealthRoutes(req, res as unknown as ServerResponse, '/api/semantic-store/cleanup');
  return res.statusCode;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/semantic-store/cleanup', () => {
  it('runs nothing for a caller who is not an admin', async () => {
    requireAdmin.mockImplementation(async (_req, res: ServerResponse) => {
      res.writeHead(401);
      res.end();
      return null;
    });
    expect(await post()).toBe(401);
    expect(runTTLCleanup).not.toHaveBeenCalled();
  });

  it('runs for an admin', async () => {
    requireAdmin.mockResolvedValue({ userId: 'ops', isAdmin: true });
    expect(await post()).toBe(200);
    expect(runTTLCleanup).toHaveBeenCalledWith({ dryRun: false, collections: ['bogle_users'] });
  });
});
