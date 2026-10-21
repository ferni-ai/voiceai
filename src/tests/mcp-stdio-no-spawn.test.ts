/**
 * Publisher MCP config must never start a process on our servers.
 *
 * Covers both ends:
 * - The v2 developer API refuses stdio configs on create/update, and refuses to
 *   "test" or list tools for a stored stdio config, without spawning anything.
 * - The runtime MCP loader refuses stdio configs (from Firestore or anywhere
 *   else) unless the server is in the first-party allowlist checked into the
 *   repo, and even then runs only the allowlisted command.
 * - The create/update schemas refuse stdio on their own, not only through the routes.
 */

import dns from 'node:dns';
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { spawnMock, stdioTransportMock, fakeDb, firestoreDocs } = vi.hoisted(() => {
  const firestoreDocs = new Map<string, Record<string, unknown>>();
  const docRef = (id: string) => ({
    get: vi.fn(async () => ({
      id,
      exists: firestoreDocs.has(id),
      data: () => firestoreDocs.get(id),
    })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      firestoreDocs.set(id, data);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      firestoreDocs.set(id, { ...(firestoreDocs.get(id) ?? {}), ...data });
    }),
    delete: vi.fn(async () => {
      firestoreDocs.delete(id);
    }),
  });
  const docRefs = new Map<string, ReturnType<typeof docRef>>();
  const fakeDb = {
    docRefs,
    collection: vi.fn(() => ({
      doc: (id: string) => {
        if (!docRefs.has(id)) docRefs.set(id, docRef(id));
        return docRefs.get(id)!;
      },
    })),
  };
  return {
    spawnMock: vi.fn(),
    stdioTransportMock: vi.fn(),
    fakeDb,
    firestoreDocs,
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: spawnMock };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: stdioTransportMock,
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  // `function` (not an arrow) so the loader can call it with `new`.
  Client: vi.fn(function () {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../api/v2/developers/shared/middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/v2/developers/shared/middleware.js')>();
  return {
    ...actual,
    requireApiKeyAuth: vi.fn(async () => ({ publisherId: 'pub_1', firebaseUid: 'uid_1' })),
    checkDeveloperRateLimit: vi.fn(async () => false),
  };
});

vi.mock('../api/v1/developers/shared/developer-auth.js', () => ({
  getFirestore: vi.fn(async () => fakeDb),
}));

vi.mock('../services/privacy-crypto.js', () => ({
  encryptSensitive: vi.fn(async (v: string) => `enc_${v}`),
  decryptSensitive: vi.fn(async (v: string) => v.replace(/^enc_/, '')),
}));

// A first-party allowlist with one entry, so the "still works" path is exercised.
// The real list in the repo is empty (no first-party stdio servers exist today).
vi.mock('../personas/bundles/first-party-stdio-mcp.js', () => {
  const entries = [
    { id: 'first-party-test', command: 'node', args: ['dist/first-party-mcp.js'] },
  ] as const;
  return {
    FIRST_PARTY_STDIO_MCP_SERVERS: entries,
    findFirstPartyStdioServer: (id: string) => entries.find((e) => e.id === id) ?? null,
  };
});

const firestoreQueryDocs: Array<Record<string, unknown>> = [];
vi.mock('../utils/firestore-utils.js', () => {
  const query = {
    where: () => query,
    get: async () => ({ docs: firestoreQueryDocs.map((d) => ({ data: () => d })) }),
  };
  return {
    getFirestoreDb: () => ({ collection: () => query }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost', 'content-type': 'application/json' };
  return req;
}

interface CapturedResponse {
  status: number;
  body: { error?: string; success?: boolean; data?: unknown };
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: {} };
  const res = {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    writeHead(status: number) {
      captured.status = status;
      this.statusCode = status;
      return this;
    },
    end(chunk?: string) {
      if (!captured.status) captured.status = this.statusCode;
      if (chunk) captured.body = JSON.parse(chunk);
      this.writableEnded = true;
    },
  };
  return { res: res as unknown as ServerResponse, captured };
}

async function call(method: string, path: string, body?: unknown): Promise<CapturedResponse> {
  const { handleMCPServersRoutes } = await import('../api/v2/developers/mcp-servers-routes.js');
  const { res, captured } = makeRes();
  await handleMCPServersRoutes(makeReq(method, path, body), res, path);
  return captured;
}

const STDIO_REFUSAL = "stdio servers can't be hosted; use an https endpoint";
const BASE = '/api/v2/developers/mcp-servers';

function storeServer(id: string, overrides: Record<string, unknown>): void {
  firestoreDocs.set(id, {
    publisherId: 'pub_1',
    name: 'Stored server',
    description: 'stored',
    autoConnect: true,
    enabled: true,
    status: 'active',
    timeout: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(() => {
  firestoreDocs.clear();
  fakeDb.docRefs.clear();
  firestoreQueryDocs.length = 0;
  spawnMock.mockReset();
  // If anything does reach spawn, fail fast instead of hanging until timeout.
  spawnMock.mockImplementation(() => {
    const listeners: Record<string, (arg: unknown) => void> = {};
    const child = {
      stdout: { on: vi.fn() },
      stdin: { write: vi.fn() },
      kill: vi.fn(),
      on: (event: string, cb: (arg: unknown) => void) => {
        listeners[event] = cb;
        if (event === 'error') void Promise.resolve().then(() => cb(new Error('spawned in test')));
        return child;
      },
    };
    return child;
  });
  stdioTransportMock.mockReset();
  stdioTransportMock.mockImplementation(function () {
    return {};
  });
});

// ---------------------------------------------------------------------------
// API: create / update / test / tools
// ---------------------------------------------------------------------------

describe('v2 developer MCP servers API refuses stdio', () => {
  it('rejects creating a stdio server with 400 and stores nothing', async () => {
    const out = await call('POST', BASE, {
      name: 'Local',
      description: 'local process',
      transport: 'stdio',
      command: 'npx',
      args: ['some-mcp-server'],
    });

    expect(out.status).toBe(400);
    expect(out.body.error).toContain(STDIO_REFUSAL);
    expect(firestoreDocs.size).toBe(0);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects a command on an http server at create time', async () => {
    const out = await call('POST', BASE, {
      name: 'Sneaky',
      description: 'http with a command',
      transport: 'http',
      endpoint: 'https://mcp.example.com',
      command: 'node',
    });

    expect(out.status).toBe(400);
    expect(out.body.error).toContain(STDIO_REFUSAL);
    expect(firestoreDocs.size).toBe(0);
  });

  it('still creates an https server', async () => {
    const out = await call('POST', BASE, {
      name: 'Remote',
      description: 'remote server',
      transport: 'http',
      endpoint: 'https://mcp.example.com',
    });

    expect(out.status).toBe(200);
    expect(firestoreDocs.size).toBe(1);
  });

  it('rejects switching an existing server to stdio on update', async () => {
    storeServer('mcp_http', { transport: 'http', endpoint: 'https://mcp.example.com' });

    const out = await call('PUT', `${BASE}/mcp_http`, {
      transport: 'stdio',
      command: 'node',
    });

    expect(out.status).toBe(400);
    expect(out.body.error).toContain(STDIO_REFUSAL);
    expect(firestoreDocs.get('mcp_http')?.transport).toBe('http');
    expect(firestoreDocs.get('mcp_http')?.command).toBeUndefined();
  });

  it('rejects adding args on update', async () => {
    storeServer('mcp_http', { transport: 'http', endpoint: 'https://mcp.example.com' });

    const out = await call('PUT', `${BASE}/mcp_http`, { args: ['--flag'] });

    expect(out.status).toBe(400);
    expect(firestoreDocs.get('mcp_http')?.args).toBeUndefined();
  });

  it('refuses to test a stored stdio server and never spawns', async () => {
    storeServer('mcp_stdio', { transport: 'stdio', command: 'node', args: ['x.js'] });

    const out = await call('POST', `${BASE}/mcp_stdio/test`);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(out.status).toBe(400);
    expect(out.body.error).toContain(STDIO_REFUSAL);
  });

  it('still tests a stored https server whose stdio fields are null', async () => {
    storeServer('mcp_http', {
      transport: 'http',
      endpoint: 'https://mcp.example.com',
      command: null,
      args: null,
    });
    // A public answer for mcp.example.com: the outbound guard resolves the host before it fetches
    const lookupSpy = vi
      .spyOn(dns.promises, 'lookup')
      .mockImplementation((async () => [
        { address: '93.184.215.14', family: 4 },
      ]) as unknown as typeof dns.promises.lookup);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unreachable in test'));

    const out = await call('POST', `${BASE}/mcp_http/test`);

    expect(fetchSpy).toHaveBeenCalled();
    expect(out.status).toBe(200);
    expect(spawnMock).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    lookupSpy.mockRestore();
  });

  it('refuses to list tools for a stored stdio server and never spawns', async () => {
    storeServer('mcp_stdio', { transport: 'stdio', command: 'npx', args: ['pkg'] });

    const out = await call('GET', `${BASE}/mcp_stdio/tools`);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(out.status).toBe(400);
    expect(out.body.error).toContain(STDIO_REFUSAL);
  });
});

// ---------------------------------------------------------------------------
// Runtime: mcp-loader
// ---------------------------------------------------------------------------

describe('runtime MCP loader refuses stdio outside the first-party allowlist', () => {
  it('drops stdio servers loaded from Firestore', async () => {
    firestoreQueryDocs.push(
      {
        id: 'mcp_stored_stdio',
        publisherId: 'pub_1',
        name: 'Stored stdio',
        transport: 'stdio',
        command: 'node',
        args: ['x.js'],
        autoConnect: true,
      },
      {
        id: 'mcp_stored_http',
        publisherId: 'pub_1',
        name: 'Stored http',
        transport: 'http',
        endpoint: 'https://mcp.example.com',
        autoConnect: true,
      }
    );

    const { loadAPIRegisteredServers } = await import('../personas/bundles/mcp-loader.js');
    const servers = await loadAPIRegisteredServers('pub_1');

    expect(servers.map((s) => s.id)).toEqual(['mcp_stored_http']);
  });

  it('refuses to connect a stdio server that is not allowlisted', async () => {
    const { connectToMCPServer } = await import('../personas/bundles/mcp-loader.js');

    const connection = await connectToMCPServer({
      id: 'mcp_from_firestore',
      name: 'Publisher stdio',
      transport: 'stdio',
      command: 'node',
      args: ['x.js'],
      env: { NODE_OPTIONS: '--require x' },
    });

    expect(connection.status).toBe('error');
    expect(stdioTransportMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('runs an allowlisted first-party server with the allowlisted command only', async () => {
    const { connectToMCPServer, disconnectAllMCPServers } =
      await import('../personas/bundles/mcp-loader.js');

    const connection = await connectToMCPServer({
      id: 'first-party-test',
      name: 'First party',
      transport: 'stdio',
      command: 'python3',
      args: ['other.py'],
      env: { NODE_OPTIONS: '--require x' },
    });

    expect(connection.status).toBe('connected');
    expect(stdioTransportMock).toHaveBeenCalledTimes(1);
    const params = stdioTransportMock.mock.calls[0]?.[0] as {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
    expect(params.command).toBe('node');
    expect(params.args).toEqual(['dist/first-party-mcp.js']);
    expect(params.env?.NODE_OPTIONS).toBeUndefined();

    await disconnectAllMCPServers();
  });
});

// The routes check isStdioMCPConfig themselves, so the route tests above still pass
// if a schema loses its refine. These pin the schema layer on its own.
describe('MCP server schemas refuse stdio on their own', () => {
  it.each([
    ['a stdio transport', { transport: 'stdio' }],
    ['a command', { command: 'sh' }],
    ['args', { args: ['-c', 'id'] }],
  ])('UpdateMCPServerSchema rejects %s', async (_, input) => {
    const { UpdateMCPServerSchema, STDIO_MCP_NOT_HOSTED_MESSAGE } =
      await import('../api/v2/developers/shared/validation.js');
    const parsed = UpdateMCPServerSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain(STDIO_MCP_NOT_HOSTED_MESSAGE);
  });

  it('UpdateMCPServerSchema still accepts a rename or a public https endpoint', async () => {
    const { UpdateMCPServerSchema } = await import('../api/v2/developers/shared/validation.js');
    expect(UpdateMCPServerSchema.safeParse({ name: 'Weather' }).success).toBe(true);
    expect(
      UpdateMCPServerSchema.safeParse({ endpoint: 'https://mcp.example.com/sse' }).success
    ).toBe(true);
  });

  it('CreateMCPServerSchema rejects a stdio server', async () => {
    const { CreateMCPServerSchema, STDIO_MCP_NOT_HOSTED_MESSAGE } =
      await import('../api/v2/developers/shared/validation.js');
    const parsed = CreateMCPServerSchema.safeParse({
      name: 'Local',
      description: 'runs a process',
      transport: 'stdio',
      command: 'sh',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain(STDIO_MCP_NOT_HOSTED_MESSAGE);
  });
});
