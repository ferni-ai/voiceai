/**
 * GET /worker answers the LiveKit platform's status poll with the SDK's shape (#4292).
 *
 * The SDK's keys are listed here from `@livekit/agents` 1.9.3 (http_server.js serves
 * `JSON.stringify(workerListener())`; worker.js builds it): a body with any other key fails, so a
 * later change cannot slip a user, room or job into a route that answers without a credential.
 * The REAL health server (port 0) and the REAL auth middleware; only the logger is faked.
 * Fictional data only.
 */
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = () => undefined;
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

delete process.env['ADMIN_API_KEYS'];
delete process.env['ADMIN_KEY'];

const { startHealthCheckServer } = await import('../health-server.js');
const { isPublicRoute } = await import('../public-routes.js');
const { setActiveJobsSource } = await import('../worker-status.js');

/** worker.js getWorkerInfo(), key for key. */
const SDK_KEYS = [
  'active_jobs',
  'agent_name',
  'agent_name_is_env',
  'deployment',
  'project_type',
  'protocol_version',
  'sdk_version',
  'worker_type',
];

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const sdkVersion = pkg.dependencies['@livekit/agents'];

let server: Server;
let port = 0;

beforeAll(async () => {
  process.env['PORT'] = '0';
  server = startHealthCheckServer('worker-status-test');
  await vi.waitFor(
    () => {
      if (!server.listening) throw new Error('not yet');
    },
    { timeout: 10000, interval: 20 }
  );
  ({ port } = server.address() as AddressInfo);
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

afterEach(() => {
  setActiveJobsSource(() => 0);
  delete process.env['AGENT_NAME'];
  delete process.env['LIVEKIT_AGENT_DEPLOYMENT'];
});

const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
const status = async (): Promise<Record<string, unknown>> =>
  (await get('/worker')).json() as Promise<Record<string, unknown>>;

describe('GET /worker', () => {
  it('answers 200 JSON with no credential, in the SDK shape and no other key', async () => {
    expect(isPublicRoute('/worker')).toBe(true);
    const res = await get('/worker');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(SDK_KEYS);
    expect(body).toMatchObject({
      worker_type: 'JT_ROOM',
      project_type: 'nodejs',
      protocol_version: 1,
      sdk_version: sdkVersion,
      active_jobs: 0,
    });
  });

  it('reports the calls running now, and nothing about them', async () => {
    // A source that has details to leak: only its count may come out.
    setActiveJobsSource(() => ['room-fictional-1', 'user-fictional-9'].length);
    const text = await (await get('/worker')).text();
    expect(JSON.parse(text)).toMatchObject({ active_jobs: 2 });
    expect(text).not.toMatch(/room-fictional|user-fictional/);
  });

  it('names the agent from the environment, as the SDK does', async () => {
    expect(await status()).toMatchObject({ agent_name: 'voice-agent', agent_name_is_env: false });
    process.env['AGENT_NAME'] = 'fictional-agent';
    process.env['LIVEKIT_AGENT_DEPLOYMENT'] = 'deploy-fictional';
    expect(await status()).toMatchObject({
      agent_name: 'fictional-agent',
      agent_name_is_env: true,
      deployment: 'deploy-fictional',
    });
  });

  it('reports the SDK version the repo depends on', async () => {
    expect((await status())['sdk_version']).toBe(sdkVersion);
  });
});

describe('only the exact route is public', () => {
  it.each(['/worker/x', '/worker?x=1', '/worker/', '/WORKER', '/worker%2F'])(
    '%s needs an admin',
    async (path) => {
      expect(isPublicRoute(path)).toBe(false);
      expect((await get(path)).status).toBe(401);
    }
  );
});
