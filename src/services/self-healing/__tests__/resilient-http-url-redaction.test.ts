/**
 * The resilient HTTP client logs the request URL on success (debug) and on failure
 * (warn). Clients such as Alpha Vantage put the server's API key in that URL
 * (`apikey=`), so it must be redacted before it is logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logCalls = vi.hoisted(() => [] as unknown[][]);

vi.mock('../../../utils/safe-logger.js', () => {
  const record =
    () =>
    (...args: unknown[]) => {
      logCalls.push(args);
    };
  const logger = {
    debug: vi.fn(record()),
    info: vi.fn(record()),
    warn: vi.fn(record()),
    error: vi.fn(record()),
    child: vi.fn(() => logger),
  };
  return { createLogger: () => logger, getLogger: () => logger };
});

vi.mock('../circuit-alerting.js', () => ({ handleCircuitStateChange: vi.fn() }));
vi.mock('../cloud-metrics.js', () => ({ recordStateChange: vi.fn(), recordCircuitState: vi.fn() }));

import { createResilientClient } from '../resilient-http.js';

const URL_WITH_KEY =
  'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=FAKEKEY123';

function loggedUrls(): unknown[] {
  return logCalls
    .map((args) => args[0])
    .filter((b): b is { url: unknown } => typeof b === 'object' && b !== null && 'url' in b)
    .map((b) => b.url);
}

describe('resilient-http never logs a query-string API key', () => {
  beforeEach(() => {
    logCalls.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('on success (debug "Request succeeded")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    );
    const client = createResilientClient('url-redaction-success', { maxRetries: 0 });
    const res = await client.get(URL_WITH_KEY);

    expect(res.data).toEqual({ ok: 1 });
    expect(loggedUrls()).toContain(
      'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=[redacted]'
    );
    expect(JSON.stringify(logCalls)).not.toContain('FAKEKEY123');
  });

  it('on failure (warn "Request failed")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 400 }))
    );
    const client = createResilientClient('url-redaction-failure', { maxRetries: 0 });
    const res = await client.get(URL_WITH_KEY);

    expect(res.error?.code).toBe('HTTP_ERROR');
    expect(loggedUrls()).toContain(
      'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=[redacted]'
    );
    expect(JSON.stringify(logCalls)).not.toContain('FAKEKEY123');
  });
});
