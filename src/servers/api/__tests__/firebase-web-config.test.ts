/**
 * The UI server answers /__/firebase/init.json with the project's Hosting copy, so the web
 * app can sign in when it is opened at the server's own address (the dev Cloud Run URL).
 */
import type { ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFirebaseWebConfigRoute, FIREBASE_INIT_PATH } from '../firebase-web-config.js';
import { handleStaticRoutes } from '../static.js';

const HOSTED = {
  apiKey: 'test-api-key',
  authDomain: 'demo-project.firebaseapp.com',
  projectId: 'demo-project',
  appId: '1:555:web:abc',
  notAWebConfigKey: 'dropped',
};

function fakeRes() {
  const sent: { status?: number; headers?: Record<string, string>; body?: string } = {};
  const res = {
    setHeader: () => undefined,
    getHeader: () => undefined,
    writeHead: (status: number, headers: Record<string, string>) => {
      sent.status = status;
      sent.headers = headers;
      return res;
    },
    end: (body?: string) => {
      sent.body = body;
      return res;
    },
    headersSent: false,
  };
  return { res: res as unknown as ServerResponse, sent };
}

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('createFirebaseWebConfigRoute', () => {
  const env = { GOOGLE_CLOUD_PROJECT: 'demo-project' };

  it("serves the project's Hosting config, web-config keys only", async () => {
    const fetchImpl = vi.fn(() => ok(HOSTED));
    const { res, sent } = fakeRes();
    await createFirebaseWebConfigRoute({ fetchImpl, env })(res);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://demo-project.firebaseapp.com/__/firebase/init.json',
      expect.anything()
    );
    expect(sent.status).toBe(200);
    expect(sent.headers?.['Content-Type']).toBe('application/json');
    const { notAWebConfigKey: _dropped, ...webKeys } = HOSTED;
    expect(JSON.parse(sent.body ?? '')).toEqual(webKeys);
  });

  it('fetches once and keeps the config', async () => {
    const fetchImpl = vi.fn(() => ok(HOSTED));
    const serve = createFirebaseWebConfigRoute({ fetchImpl, env });
    await serve(fakeRes().res);
    const { res, sent } = fakeRes();
    await serve(res);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sent.status).toBe(200);
  });

  it('shares one fetch between requests that arrive together', async () => {
    const fetchImpl = vi.fn(() => ok(HOSTED));
    const serve = createFirebaseWebConfigRoute({ fetchImpl, env });
    const a = fakeRes();
    const b = fakeRes();
    await Promise.all([serve(a.res), serve(b.res)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([a.sent.status, b.sent.status]).toEqual([200, 200]);
  });

  it('answers 502 when Hosting fails, and tries again on the next request', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockImplementationOnce(() => ok(HOSTED));
    const serve = createFirebaseWebConfigRoute({ fetchImpl, env });
    const first = fakeRes();
    await serve(first.res);
    expect(first.sent.status).toBe(502);
    expect(first.sent.headers?.['Cache-Control']).toBe('no-store');
    const second = fakeRes();
    await serve(second.res);
    expect(second.sent.status).toBe(200);
  });

  it('answers 502 when Hosting returns something that is not a web config', async () => {
    const { res, sent } = fakeRes();
    await createFirebaseWebConfigRoute({ fetchImpl: () => ok({ apiKey: 'only-this' }), env })(res);
    expect(sent.status).toBe(502);
  });

  it.each([{}, { GOOGLE_CLOUD_PROJECT: 'evil.example.com/x' }])(
    'answers 404 without fetching when the project is missing or not a project id (%o)',
    async (badEnv) => {
      const fetchImpl = vi.fn(() => ok(HOSTED));
      const { res, sent } = fakeRes();
      await createFirebaseWebConfigRoute({ fetchImpl, env: badEnv })(res);
      expect(sent.status).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );
});

describe('handleStaticRoutes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it(`answers ${FIREBASE_INIT_PATH} itself instead of looking for a static file`, async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'demo-project');
    const fetchMock = vi.fn(() => ok(HOSTED));
    vi.stubGlobal('fetch', fetchMock);
    const { res, sent } = fakeRes();
    expect(handleStaticRoutes({ headers: {} } as never, res, FIREBASE_INIT_PATH)).toBe(true);
    await vi.waitFor(() => expect(sent.status).toBe(200));
    expect(JSON.parse(sent.body ?? '').projectId).toBe('demo-project');
  });
});
