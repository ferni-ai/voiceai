import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlobalDispatcher, request, setGlobalDispatcher } from 'undici';
import {
  installVertexKeepAlive,
  isVertexOrigin,
  keepAliveDispatcher,
  VERTEX_KEEPALIVE_MS,
} from '../vertex-keepalive.js';

const original = getGlobalDispatcher();
afterEach(() => setGlobalDispatcher(original));

/** A server that never closes idle sockets nor hints a keep-alive timeout (as Vertex's front end). */
async function server(): Promise<{ url: string; connections: () => number; close: () => void }> {
  let connections = 0;
  const srv: Server = createServer((_req, res) => res.end('ok'));
  srv.keepAliveTimeout = 0; // no "Keep-Alive: timeout=" hint, no server-side close
  srv.on('connection', () => connections++);
  await new Promise<void>((resolve) => {
    srv.listen(0, '127.0.0.1', resolve);
  });
  const { port } = srv.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    connections: () => connections,
    close: () => srv.close(),
  };
}

describe('vertex keep-alive', () => {
  it('picks Vertex AI hosts only', () => {
    expect(isVertexOrigin('https://aiplatform.googleapis.com')).toBe(true);
    expect(isVertexOrigin(new URL('https://us-central1-aiplatform.googleapis.com/v1'))).toBe(true);
    expect(isVertexOrigin('https://generativelanguage.googleapis.com')).toBe(false);
    expect(isVertexOrigin('https://api.cartesia.ai')).toBe(false);
    expect(isVertexOrigin('https://aiplatform.googleapis.com.evil.example')).toBe(false);
    expect(isVertexOrigin('not a url')).toBe(false);
  });

  it('is off by default and leaves the global dispatcher alone', () => {
    expect(installVertexKeepAlive({})).toBe(false);
    expect(getGlobalDispatcher()).toBe(original);
  });

  it('installs once when VERTEX_KEEPALIVE=on', () => {
    expect(installVertexKeepAlive({ VERTEX_KEEPALIVE: 'on' })).toBe(true);
    const installed = getGlobalDispatcher();
    expect(installed).not.toBe(original);
    expect(installVertexKeepAlive({ VERTEX_KEEPALIVE: 'on' })).toBe(true);
    expect(getGlobalDispatcher()).toBe(installed);
    expect(VERTEX_KEEPALIVE_MS).toBeGreaterThan(10_000); // longer than the ~10 s between turns
  });

  // @google/genai calls the runtime's global fetch, which is the undici bundled with Node, not
  // this package: Node 22's reads the legacy global-dispatcher slot, Node 26's the newer one.
  // Run under both (CI runs 22); on Node 26 an install that writes only the legacy slot is red.
  it('the runtime’s own fetch dispatches through the installed dispatcher', async () => {
    expect(installVertexKeepAlive({ VERTEX_KEEPALIVE: 'on' })).toBe(true);
    const installed = getGlobalDispatcher();
    const dispatch = vi.spyOn(installed, 'dispatch');
    const srv = await server();
    try {
      const res = await fetch(srv.url);
      expect(await res.text()).toBe('ok');
      expect(dispatch).toHaveBeenCalled();
    } finally {
      dispatch.mockRestore();
      srv.close();
    }
  });

  it('reuses a socket idle past Node’s 4 s default only for the origins it keeps', async () => {
    const kept = await server();
    const other = await server();
    const keepUrl = new URL(kept.url);
    const dispatcher = keepAliveDispatcher(
      VERTEX_KEEPALIVE_MS,
      (origin) => new URL(String(origin)).port === keepUrl.port
    );
    const get = async (url: string) => {
      const res = await request(url, { dispatcher });
      await res.body.text();
    };
    try {
      await Promise.all([get(kept.url), get(other.url)]);
      await new Promise((r) => {
        setTimeout(r, 4_600); // past Node's 4 s idle close
      });
      await Promise.all([get(kept.url), get(other.url)]);
      expect(kept.connections()).toBe(1); // the idle socket was kept and reused
      expect(other.connections()).toBe(2); // Node's default: closed after 4 s, reconnected
    } finally {
      await dispatcher.close();
      kept.close();
      other.close();
    }
  }, 15_000);
});
