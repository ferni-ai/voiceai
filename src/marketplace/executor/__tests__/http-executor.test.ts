/**
 * Marketplace HTTP tools call a publisher-stored endpoint from inside our network. The call goes
 * through the outbound URL guard: a public-looking name that resolves to a private address, or a
 * redirect to one, is refused before (or instead of) reaching it. DNS and fetch are spies.
 */
import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeHttpTool } from '../http-executor.js';
import type { ToolManifest } from '../../schema/types.js';
import type { ExecutionContext, ExecutionOptions } from '../sandbox.js';

vi.mock('../../../utils/safe-logger.js', () => {
  const noop = () => undefined;
  const logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };
  return { getLogger: () => logger, createLogger: () => logger };
});

function resolveTo(map: Record<string, string>) {
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async (host: string) => {
    const address = map[host];
    if (!address) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return [{ address, family: address.includes(':') ? 6 : 4 }];
  }) as unknown as typeof dns.promises.lookup);
}

function manifest(endpoint: string): ToolManifest {
  return {
    id: 'tool-1',
    version: '1.0.0',
    execution: { runtime: { endpoint } },
  } as unknown as ToolManifest;
}

const context = { userId: 'user-1', agentId: 'ferni' } as unknown as ExecutionContext;
const options = {} as ExecutionOptions;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('executeHttpTool: outbound guard', () => {
  it('refuses an endpoint whose name resolves to a private address, without fetching', async () => {
    resolveTo({ 'tools.example.com': '10.0.0.7' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      executeHttpTool(manifest('https://tools.example.com/run'), {}, context, options, 5000)
    ).rejects.toThrow(/invalid or points to internal resources/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses an IPv4-translated IPv6 loopback literal', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      executeHttpTool(manifest('https://[::ffff:0:7f00:1]/run'), {}, context, options, 5000)
    ).rejects.toThrow(/invalid or points to internal resources/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not follow a redirect to the metadata service', async () => {
    resolveTo({ 'tools.example.com': '93.184.215.14' });
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response(null, { status: 307, headers: { location: 'https://169.254.169.254/x' } })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      executeHttpTool(manifest('https://tools.example.com/run'), {}, context, options, 5000)
    ).rejects.toThrow(/invalid or points to internal resources/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', method: 'POST' });
  });

  it('calls a public endpoint with the anonymized token and returns its summary', async () => {
    resolveTo({ 'tools.example.com': '93.184.215.14' });
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response(JSON.stringify({ summary: 'done', data: { ok: true } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const result = await executeHttpTool(
      manifest('https://tools.example.com/run'),
      { q: 1 },
      context,
      options,
      5000
    );
    expect(result).toEqual({ data: { ok: true }, summary: 'done' });
    const headers = new globalThis.Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-ferni-user-token')).toBeTruthy();
    expect(headers.get('x-ferni-user-token')).not.toBe('user-1');
  });
});
