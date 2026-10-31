/**
 * Keep Ferni's connections to Vertex AI open between turns.
 *
 * Node's fetch (which @google/genai uses for every reply request) closes a
 * socket after 4 s idle. On a call the next reply request comes ~10 s after
 * the last one ended, so every turn opened a new connection: TCP, TLS, and a
 * ~45 KB request (prompt + tool declarations) pushed through a cold TCP window.
 * Offline, replaying 14 dev turns through the real request path, that cost
 * ~127 ms of time to first text at p50 (scripts/perf/reply-latency-bench.ts,
 * 2026-10-11; less where the network to Google is shorter).
 *
 * VERTEX_KEEPALIVE=on installs a fetch dispatcher that keeps Vertex AI sockets
 * (aiplatform.googleapis.com and its regional hosts) for 30 s. Every other
 * origin keeps Node's defaults: a server that closes idle sockets sooner than
 * we expect would fail the next POST on that socket, so the change is limited
 * to the one host where the gain was measured.
 *
 * The dispatcher must reach whichever fetch the runtime bundles. Node 22's fetch reads the
 * global dispatcher from the legacy slot and Node 26's (undici 8) from the newer one, and the
 * two speak different handler APIs. undici 7's setGlobalDispatcher writes both slots and its
 * Agent accepts both handler APIs, so one install covers both runtimes (undici 6 wrote only the
 * legacy slot, so on Node 26 the keep-alive was silently ignored).
 *
 * @module agents/model-provider/vertex-keepalive
 */

import { Agent, Pool, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'VertexKeepAlive' });

type Env = Record<string, string | undefined>;

/** How long an idle Vertex socket is kept. */
export const VERTEX_KEEPALIVE_MS = 30_000;

/** Vertex AI's global host and its regional ones ("us-central1-aiplatform.googleapis.com"). */
export function isVertexOrigin(origin: string | URL): boolean {
  let host: string;
  try {
    host = new URL(String(origin)).hostname;
  } catch {
    return false;
  }
  return host === 'aiplatform.googleapis.com' || host.endsWith('-aiplatform.googleapis.com');
}

/**
 * A dispatcher that keeps idle sockets to the origins `keep` picks for
 * keepAliveMs, and treats every other origin as Node's default dispatcher does.
 */
export function keepAliveDispatcher(
  keepAliveMs: number,
  keep: (origin: string | URL) => boolean
): Agent {
  return new Agent({
    factory: (origin: string | URL, opts: object): Dispatcher =>
      new Pool(
        origin,
        keep(origin)
          ? { ...opts, keepAliveTimeout: keepAliveMs, keepAliveMaxTimeout: keepAliveMs }
          : opts
      ),
  });
}

let installed: Dispatcher | null = null;

/**
 * Install the Vertex keep-alive dispatcher for this process when
 * VERTEX_KEEPALIVE is on. Safe to call more than once; true when it is in place.
 */
export function installVertexKeepAlive(env: Env = process.env): boolean {
  if (!flagOn('VERTEX_KEEPALIVE', env)) return false;
  if (installed && getGlobalDispatcher() === installed) return true;
  installed = keepAliveDispatcher(VERTEX_KEEPALIVE_MS, isVertexOrigin);
  setGlobalDispatcher(installed);
  log.info({ keepAliveMs: VERTEX_KEEPALIVE_MS }, 'Vertex AI sockets kept open between turns');
  return true;
}
