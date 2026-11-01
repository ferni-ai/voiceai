/**
 * The outbound URL guard refuses every non-public destination: by literal, by DNS answer, by
 * redirect target, and at socket connect time (so a name that re-resolves to a private
 * address after the pre-flight check still cannot be reached). DNS is a spy; no network.
 */
import dns from 'node:dns';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Agent } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSafeOutboundUrl,
  checkOutboundUrl,
  getGuardedAgent,
  guardedLookup,
  isBlockedIp,
  OutboundUrlBlockedError,
  readCappedText,
  guardedStreamFetch,
  safeOutboundFetch,
} from '../outbound-url-guard.js';

const PUBLIC_V4 = '93.184.215.14';

function resolveTo(map: Record<string, string>) {
  const answers = (host: string) => {
    const address = map[host];
    if (!address) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return [{ address, family: address.includes(':') ? 6 : 4 }];
  };
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async (host: string) =>
    answers(host)) as unknown as typeof dns.promises.lookup);
  vi.spyOn(dns, 'lookup').mockImplementation(((
    host: string,
    _opts: unknown,
    cb: (err: unknown, list?: unknown) => void
  ) => {
    try {
      cb(null, answers(host));
    } catch (err) {
      cb(err);
    }
  }) as unknown as typeof dns.lookup);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('checkOutboundUrl: literal destinations', () => {
  const blocked = [
    'https://127.0.0.1/',
    'https://127.8.9.10/',
    'https://10.1.2.3/',
    'https://172.16.0.1/',
    'https://172.31.255.255/',
    'https://192.168.1.10/',
    'https://169.254.169.254/',
    'https://169.254.1.1/',
    'https://100.64.0.1/',
    'https://100.127.255.254/',
    'https://0.0.0.0/',
    'https://0.1.2.3/',
    'https://2130706433/', // decimal form of 127.0.0.1
    'https://0x7f.1/',
    'https://[::1]/',
    'https://[::]/',
    'https://[fc00::1]/',
    'https://[fd12:3456::1]/',
    'https://[fe80::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:7f00:1]/',
    'https://[::ffff:a9fe:a9fe]/', // mapped 169.254.169.254
    'https://[::ffff:10.0.0.1]/',
    'https://[0:0:0:0:0:ffff:c0a8:0101]/', // mapped 192.168.1.1
    'https://localhost/',
    'https://foo.localhost/',
    'https://metadata.google.internal/',
    'https://metadata/',
    'https://printer.local/',
  ];
  it.each(blocked)('refuses %s', (url) => {
    const result = checkOutboundUrl(url);
    expect(result.ok).toBe(false);
  });

  it.each(['https://example.com/hook', 'https://8.8.8.8/', 'https://[2606:4700::1111]/'])(
    'accepts public %s',
    (url) => {
      expect(checkOutboundUrl(url).ok).toBe(true);
    }
  );

  it('requires https, no credentials and the default port', () => {
    expect(checkOutboundUrl('http://example.com/')).toEqual({
      ok: false,
      reason: 'https required',
    });
    expect(checkOutboundUrl('ftp://example.com/').ok).toBe(false);
    expect(checkOutboundUrl('https://user:pw@example.com/')).toMatchObject({ ok: false });
    expect(checkOutboundUrl('https://example.com:8443/')).toEqual({
      ok: false,
      reason: 'non-default port',
    });
    expect(checkOutboundUrl('wss://example.com/', { protocols: ['https:', 'wss:'] }).ok).toBe(true);
  });

  it('isBlockedIp treats mapped IPv6 like the IPv4 it carries', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:5db8:d70e')).toBe(false); // mapped 93.184.215.14
  });
});

describe('isBlockedIp: IPv4 embedded in IPv6', () => {
  it('blocks IPv4-translated and local-use NAT64 addresses', () => {
    expect(isBlockedIp('::ffff:0:7f00:1')).toBe(true);
    expect(isBlockedIp('64:ff9b:1::a00:7')).toBe(true);
  });
});

describe('assertSafeOutboundUrl: DNS answers', () => {
  it('refuses a public-looking name that resolves to a private address', async () => {
    resolveTo({ 'internal-alias.example.com': '10.0.0.7' });
    await expect(assertSafeOutboundUrl('https://internal-alias.example.com/x')).rejects.toThrow(
      OutboundUrlBlockedError
    );
  });

  it('refuses a name that resolves to mapped IPv6 loopback', async () => {
    resolveTo({ 'v6-alias.example.com': '::ffff:127.0.0.1' });
    await expect(assertSafeOutboundUrl('https://v6-alias.example.com/')).rejects.toThrow(
      /private or reserved/
    );
  });

  it('accepts a name whose every answer is public', async () => {
    resolveTo({ 'hooks.example.com': PUBLIC_V4 });
    await expect(assertSafeOutboundUrl('https://hooks.example.com/a')).resolves.toBeInstanceOf(URL);
  });
});

describe('safeOutboundFetch: redirects', () => {
  it('does not follow a redirect to a private host', async () => {
    resolveTo({ 'hooks.example.com': PUBLIC_V4 });
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) =>
        new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/x' } })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(safeOutboundFetch('https://hooks.example.com/start')).rejects.toThrow(
      /redirect target not allowed/
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect to another public host and re-checks it', async () => {
    resolveTo({ 'hooks.example.com': PUBLIC_V4, 'cdn.example.net': '93.184.215.15' });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: 'https://cdn.example.net/y' } })
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await safeOutboundFetch('https://hooks.example.com/start', {
      headers: { authorization: 'Bearer t' },
    });
    expect(res.status).toBe(200);
    const second = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(new globalThis.Headers(second.headers).get('authorization')).toBeNull();
  });

  it('refuses a private URL without making any request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(safeOutboundFetch('https://[::1]/')).rejects.toThrow(OutboundUrlBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('guardedStreamFetch', () => {
  it('refuses a name that resolves to a private address without fetching', async () => {
    resolveTo({ 'mcp.example.com': '192.168.1.4' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(guardedStreamFetch('https://mcp.example.com/sse')).rejects.toThrow(
      OutboundUrlBlockedError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('adds no timeout, refuses redirects and connects through the guarded agent', async () => {
    resolveTo({ 'mcp.example.com': PUBLIC_V4 });
    const fetchSpy = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('ok'));
    vi.stubGlobal('fetch', fetchSpy);
    await guardedStreamFetch(new URL('https://mcp.example.com/sse'), { method: 'GET' });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit & { dispatcher?: unknown };
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(init.signal).toBeUndefined();
    expect(init.dispatcher).toBe(getGuardedAgent());
  });

  // Pre-flight sees a public answer; the socket's own lookup sees a private one (a name that
  // re-resolves between the two). The refusal must happen at connect, on the real fetch path.
  it.each([
    ['private', '10.0.0.7'],
    ['loopback', '127.0.0.1'],
    ['metadata service', '169.254.169.254'],
    ['IPv6 loopback', '::1'],
    ['mapped metadata service', '::ffff:a9fe:a9fe'],
  ])('refuses at connect time when the socket lookup answers %s (%s)', async (_label, address) => {
    vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
      { address: PUBLIC_V4, family: 4 },
    ]) as unknown as typeof dns.promises.lookup);
    const socketLookup = vi
      .spyOn(dns, 'lookup')
      .mockImplementation(((
        _host: string,
        _opts: unknown,
        cb: (err: unknown, list?: unknown) => void
      ) =>
        cb(null, [
          { address, family: address.includes(':') ? 6 : 4 },
        ])) as unknown as typeof dns.lookup);

    const failure = await guardedStreamFetch('https://mcp.example.test/sse').catch(
      (e: unknown) => e
    );
    expect(failure).toBeInstanceOf(OutboundUrlBlockedError);
    expect(socketLookup).toHaveBeenCalled();
  });
});

describe('connect-time lookup (DNS rebinding)', () => {
  it('guardedLookup refuses when any answer is private', async () => {
    resolveTo({ 'rebind.example.com': '127.0.0.1' });
    const err = await new Promise<Error | null>((resolve) => {
      guardedLookup('rebind.example.com', {}, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(OutboundUrlBlockedError);
  });

  it('the guarded dispatcher will not open a socket to a rebound private address', async () => {
    // Pre-flight skipped on purpose: this is the socket lookup on its own.
    resolveTo({ 'rebind.example.com': '127.0.0.1' });
    const failure = await fetch('https://rebind.example.com/', {
      dispatcher: getGuardedAgent(),
    } as RequestInit).catch((e: unknown) => e as Error & { cause?: unknown });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as { cause?: unknown }).cause).toBeInstanceOf(OutboundUrlBlockedError);
  });

  it.each([
    ['metadata service', '169.254.169.254'],
    ['mapped metadata service', '::ffff:a9fe:a9fe'],
    ['mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-translated loopback', '::ffff:0:7f00:1'],
    ['unique local', 'fd00::1'],
    ['IPv6 loopback', '::1'],
    ['link-local', 'fe80::1'],
  ])('guardedLookup refuses a %s answer (%s)', async (_label, address) => {
    resolveTo({ 'rebind.example.test': address });
    const err = await new Promise<Error | null>((resolve) => {
      guardedLookup('rebind.example.test', {}, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(OutboundUrlBlockedError);
  });

  it('guardedLookup refuses when one of several answers is private', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((
      _host: string,
      _opts: unknown,
      cb: (err: unknown, list?: unknown) => void
    ) =>
      cb(null, [
        { address: PUBLIC_V4, family: 4 },
        { address: '10.0.0.7', family: 4 },
      ])) as unknown as typeof dns.lookup);
    const err = await new Promise<Error | null>((resolve) => {
      guardedLookup('mixed.example.test', {}, (e) => resolve(e));
    });
    expect(err).toBeInstanceOf(OutboundUrlBlockedError);
  });

  it('safeOutboundFetch refuses a name that is public at pre-flight and private at connect', async () => {
    // First answer (pre-flight) public, the socket's own lookup private: the rebinding case.
    vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
      { address: PUBLIC_V4, family: 4 },
    ]) as unknown as typeof dns.promises.lookup);
    const socketLookup = vi
      .spyOn(dns, 'lookup')
      .mockImplementation(((
        _host: string,
        _opts: unknown,
        cb: (err: unknown, list?: unknown) => void
      ) => cb(null, [{ address: '127.0.0.1', family: 4 }])) as unknown as typeof dns.lookup);

    const failure = await safeOutboundFetch('https://flip.example.test/hook').catch(
      (e: unknown) => e
    );
    // The connect-time refusal reaches the caller as the guard's own error, not fetch's wrapper.
    expect(failure).toBeInstanceOf(OutboundUrlBlockedError);
    expect(socketLookup).toHaveBeenCalled();
  });
});

/**
 * Behaviour, not just the error class: a real local listener counts connections. The control
 * proves the harness can see a connection (same Agent class, same resolver, no guard); the
 * guarded dispatcher must deliver zero. Pre-flight is skipped on purpose (it would refuse the
 * port), so this is the socket lookup alone. Plain http keeps the control's response simple.
 */
describe('connect-time lookup: no socket reaches a private listener', () => {
  async function listener(host: string) {
    let connections = 0;
    const server = http.createServer((_req, res) => res.end('reached'));
    server.on('connection', () => connections++);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port: 0, host, ipv6Only: false }, () => resolve());
    });
    return {
      port: (server.address() as AddressInfo).port,
      connections: () => connections,
      close: () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    };
  }

  /** Same resolver the guard uses (dns.lookup, spied), with no address check. */
  const unguardedAgent = () =>
    new Agent({
      connect: {
        lookup: (hostname, options, callback) =>
          dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
            if (err) return callback(err, '');
            const [first] = addresses;
            if (!first) return callback(new Error('no address'), '');
            if (options.all) return callback(null, addresses);
            return callback(null, first.address, first.family);
          }),
      },
    });

  async function hasDualStack(): Promise<boolean> {
    try {
      await (await listener('::')).close();
      return true;
    } catch {
      return false;
    }
  }

  it('control: an unguarded agent with the same resolver does reach the listener', async () => {
    const srv = await listener('127.0.0.1');
    const agent = unguardedAgent();
    try {
      resolveTo({ 'rebind.example.test': '127.0.0.1' });
      const res = await fetch(`http://rebind.example.test:${srv.port}/`, {
        dispatcher: agent,
      } as RequestInit);
      expect(await res.text()).toBe('reached');
      expect(srv.connections()).toBe(1);
    } finally {
      await agent.close();
      await srv.close();
    }
  });

  it('the guarded agent opens zero connections to a name rebound to loopback', async () => {
    const srv = await listener('127.0.0.1');
    try {
      resolveTo({ 'rebind.example.test': '127.0.0.1' });
      const failure = await fetch(`http://rebind.example.test:${srv.port}/`, {
        dispatcher: getGuardedAgent(),
      } as RequestInit).catch((e: unknown) => e as Error & { cause?: unknown });
      expect((failure as { cause?: unknown }).cause).toBeInstanceOf(OutboundUrlBlockedError);
      expect(srv.connections()).toBe(0);
    } finally {
      await srv.close();
    }
  });

  it('mapped IPv6 loopback: the control connects, the guarded agent does not', async (ctx) => {
    if (!(await hasDualStack())) ctx.skip(); // no IPv6 on this host: nothing to listen on
    const srv = await listener('::');
    const agent = unguardedAgent();
    try {
      resolveTo({ 'rebind.example.test': '::ffff:127.0.0.1' });
      const url = `http://rebind.example.test:${srv.port}/`;
      const control = await fetch(url, { dispatcher: agent } as RequestInit);
      expect(await control.text()).toBe('reached');
      expect(srv.connections()).toBe(1);

      const failure = await fetch(url, { dispatcher: getGuardedAgent() } as RequestInit).catch(
        (e: unknown) => e as Error & { cause?: unknown }
      );
      expect((failure as { cause?: unknown }).cause).toBeInstanceOf(OutboundUrlBlockedError);
      expect(srv.connections()).toBe(1); // still only the control's
    } finally {
      await agent.close();
      await srv.close();
    }
  });

  it('guardedStreamFetch never follows a redirect to a private listener', async () => {
    // The first hop stands in for a public MCP server (a local listener reached through an
    // unguarded agent, since every local address is private). It redirects to a name that
    // resolves to loopback, where a second listener counts connections.
    const target = await listener('127.0.0.1');
    let firstHop = 0;
    const origin = http.createServer((_req, res) => {
      res.writeHead(302, { location: `http://rebind.example.test:${target.port}/sse` }).end();
    });
    origin.on('connection', () => firstHop++);
    await new Promise<void>((resolve) => {
      origin.listen(0, '127.0.0.1', () => resolve());
    });
    const originPort = (origin.address() as AddressInfo).port;
    const agent = unguardedAgent();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) =>
      realFetch(`http://127.0.0.1:${originPort}/sse`, { ...init, dispatcher: agent } as RequestInit)
    );
    try {
      resolveTo({ 'mcp.example.test': PUBLIC_V4, 'rebind.example.test': '127.0.0.1' });
      await expect(guardedStreamFetch('https://mcp.example.test/sse')).rejects.toThrow();
      expect(firstHop).toBe(1); // the request did go out
      expect(target.connections()).toBe(0); // and the redirect was not followed
    } finally {
      await agent.close();
      await target.close();
      await new Promise<void>((resolve) => {
        origin.close(() => resolve());
      });
    }
  });
});

describe('readCappedText', () => {
  it('reads no more than the cap', async () => {
    const text = await readCappedText(new Response('x'.repeat(10_000)), 100);
    expect(text).toHaveLength(100);
  });
});
