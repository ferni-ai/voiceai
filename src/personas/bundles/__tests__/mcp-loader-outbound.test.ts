/**
 * A developer-registered MCP server's URL is checked when it is saved, but the runtime connection
 * is what reaches it. Every request the SSE transport makes goes through the outbound guard, so a
 * name that resolves to a private address is refused at connect time. Real SDK transport; DNS and
 * fetch are spies, no network.
 */
import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectToMCPServer, disconnectAllMCPServers } from '../mcp-loader.js';
import type { BundleMCPServer } from '../types/commands.js';

function resolveTo(address: string) {
  vi.spyOn(dns.promises, 'lookup').mockImplementation((async () => [
    { address, family: 4 },
  ]) as unknown as typeof dns.promises.lookup);
}

const server = (id: string): BundleMCPServer =>
  ({ id, name: id, transport: 'http', url: 'https://mcp.example.com/sse' }) as BundleMCPServer;

afterEach(async () => {
  await disconnectAllMCPServers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('connectToMCPServer: developer http endpoints', () => {
  it('refuses an endpoint that resolves to a private address, without fetching it', async () => {
    resolveTo('10.0.0.7');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const connection = await connectToMCPServer(server('private-mcp'));
    expect(connection.status).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('opens a public endpoint through the guarded dispatcher with redirects refused', async () => {
    resolveTo('93.184.215.14');
    const fetchSpy = vi.fn(
      async (_url: unknown, _init?: RequestInit) => new Response('no', { status: 503 })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await connectToMCPServer(server('public-mcp'));
    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit & { dispatcher?: unknown };
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://mcp.example.com/sse');
    expect(init.redirect).toBe('error');
    expect(init.dispatcher).toBeDefined();
  });
});
