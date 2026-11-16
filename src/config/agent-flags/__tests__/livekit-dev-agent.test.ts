/**
 * The LiveKit adapter for the dev agent's flag secrets: bound to the dev project only, reads
 * back only flag names, gives up on the rooms after 10 s, and never puts the API secret in an
 * error. Fakes only: no call reaches LiveKit.
 */
import { Room } from '@livekit/protocol';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ constructed: [] as unknown[][] }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    constructor(...args: unknown[]) {
      sdk.constructed.push(args);
    }
    async listRooms(): Promise<Room[]> {
      return [];
    }
  },
}));

const { liveKitDevAgent } = await import('../adapters/livekit-dev-agent.js');

const API_KEY = 'APIfictionalKey01';
const API_SECRET = 'fictional-secret-not-real-0123456789abcdef';
const ENV = {
  LIVEKIT_URL: 'wss://dev-8sm1ba0z.livekit.cloud',
  LIVEKIT_API_KEY: API_KEY,
  LIVEKIT_API_SECRET: API_SECRET,
};

interface Call {
  method: string;
  body: unknown;
}

function fakeRpc(response: unknown = { secrets: [] }) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (method: 'ListAgentSecrets', body: object) => {
    calls.push({ method, body });
    return response;
  });
  return { rpc, calls };
}

const noRooms = { listRooms: async (): Promise<Room[]> => [] };

beforeEach(() => {
  sdk.constructed.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('liveKitDevAgent: bound to the dev project', () => {
  it.each([
    ['the prod project', 'wss://prod-x.livekit.cloud'],
    ['a lookalike suffix', 'wss://dev-8sm1ba0z.livekit.cloud.example.test'],
    ['a lookalike subdomain', 'wss://x.dev-8sm1ba0z.livekit.cloud'],
    ['a host with no scheme', 'dev-8sm1ba0z.livekit.cloud'],
    ['an empty url', ''],
  ])('throws on %s', (_label, url) => {
    const { rpc } = fakeRpc();
    expect(() => liveKitDevAgent({ ...ENV, LIVEKIT_URL: url }, rpc, noRooms)).toThrow(
      /dev-8sm1ba0z\.livekit\.cloud/
    );
  });

  it('throws when LIVEKIT_URL is unset', () => {
    const { LIVEKIT_URL: _unset, ...env } = ENV;
    expect(() => liveKitDevAgent(env, fakeRpc().rpc, noRooms)).toThrow(/LIVEKIT_URL/);
  });

  it.each(['wss://dev-8sm1ba0z.livekit.cloud', 'https://dev-8sm1ba0z.livekit.cloud/'])(
    'accepts the dev project as %s',
    (url) => {
      expect(() =>
        liveKitDevAgent({ ...ENV, LIVEKIT_URL: url }, fakeRpc().rpc, noRooms)
      ).not.toThrow();
    }
  );

  it.each(['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const)(
    'throws without %s, naming it and not the secret',
    (name) => {
      for (const value of [undefined, '']) {
        const env = { ...ENV, [name]: value };
        let message = '';
        try {
          liveKitDevAgent(env, fakeRpc().rpc, noRooms);
        } catch (err) {
          message = err instanceof Error ? err.message : String(err);
        }
        expect(message).toContain(name);
        expect(message).not.toContain(API_SECRET);
      }
    }
  );
});

describe('flagSecretTimes', () => {
  it('asks for the dev agent and keeps only flag names', async () => {
    const { rpc, calls } = fakeRpc({
      secrets: [
        {
          name: 'SOUND_CONDUCTOR',
          value: '',
          kind: 'AGENT_SECRET_KIND_ENVIRONMENT',
          updated_at: '2026-11-16T10:00:00Z',
        },
        { name: 'CARTESIA_API_KEY', value: '', updated_at: '2026-11-15T09:00:00Z' },
        { name: 'ALLOW_PRODUCTION_DATA', value: '', updated_at: '2026-11-15T09:00:00Z' },
        { name: 'LATENCY_ARM_PERCENT', value: '', updated_at: '2026-11-14T08:00:00Z' },
        { name: 'ABUSE_DISCLOSURE_PATTERNS', value: '' },
        { name: '__proto__', updated_at: '2026-11-14T08:00:00Z' },
      ],
    });
    const times = await liveKitDevAgent(ENV, rpc, noRooms).flagSecretTimes();
    expect(calls).toEqual([{ method: 'ListAgentSecrets', body: { agentId: 'CA_siTDMHEba4Fg' } }]);
    expect(times).toEqual({
      SOUND_CONDUCTOR: '2026-11-16T10:00:00Z',
      LATENCY_ARM_PERCENT: '2026-11-14T08:00:00Z',
    });
  });

  it('throws on a response with no secrets list', async () => {
    const { rpc } = fakeRpc({ unexpected: true });
    await expect(liveKitDevAgent(ENV, rpc, noRooms).flagSecretTimes()).rejects.toThrow(
      /ListAgentSecrets/
    );
  });
});

describe('occupiedRooms', () => {
  it('returns only rooms with someone in them', async () => {
    const rooms = {
      listRooms: async () => [
        new Room({ name: 'call-empty', numParticipants: 0 }),
        new Room({ name: 'call-live', numParticipants: 2 }),
      ],
    };
    const agent = liveKitDevAgent(ENV, fakeRpc().rpc, rooms);
    expect(await agent.occupiedRooms()).toEqual([{ name: 'call-live', participants: 2 }]);
  });

  it('gives up after 10 s when the room service never answers', async () => {
    vi.useFakeTimers();
    try {
      const hung = {
        listRooms: () =>
          new Promise<Room[]>(() => {
            // never settles, like a hung room service
          }),
      };
      const failed = vi.fn();
      void liveKitDevAgent(ENV, fakeRpc().rpc, hung).occupiedRooms().catch(failed);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(failed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(failed).toHaveBeenCalledTimes(1);
      expect(String(failed.mock.calls[0]?.[0])).toMatch(
        /dev LiveKit rooms timed out after 10000ms/
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists rooms on the dev project by default', () => {
    liveKitDevAgent(ENV, fakeRpc().rpc);
    expect(sdk.constructed).toEqual([[`https://dev-8sm1ba0z.livekit.cloud`, API_KEY, API_SECRET]]);
  });
});

describe('the default transport (fetch)', () => {
  type FetchArgs = [string, RequestInit];

  function stubFetch(status: number, body: string) {
    const calls: FetchArgs[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
      })
    );
    return calls;
  }

  it('posts to the CloudAgent service with an agent admin token issued by the key', async () => {
    const calls = stubFetch(200, JSON.stringify({ secrets: [] }));
    await liveKitDevAgent(ENV, undefined, noRooms).flagSecretTimes();
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as FetchArgs;
    expect(url).toBe('https://agents.livekit.cloud/twirp/livekit.CloudAgent/ListAgentSecrets');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ agentId: 'CA_siTDMHEba4Fg' });
    const headers = new globalThis.Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-LIVEKIT-CLI-VERSION')).toBe('2.19.0');
    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(API_SECRET),
      { issuer: API_KEY }
    );
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.agent).toEqual({ admin: true });
    expect((payload.exp ?? 0) - (payload.nbf ?? 0)).toBe(300);
  });

  it('reports a twirp error by method, status and code, without the API secret', async () => {
    stubFetch(
      400,
      JSON.stringify({ code: 'malformed', msg: `bad token signed with ${API_SECRET}` })
    );
    const err = await liveKitDevAgent(ENV, undefined, noRooms)
      .flagSecretTimes()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const { message } = err as Error;
    expect(message).toContain('ListAgentSecrets');
    expect(message).toContain('400');
    expect(message).toContain('malformed');
    expect(message).not.toContain(API_SECRET);
  });

  it('throws on a response that is not JSON', async () => {
    stubFetch(502, '<html>bad gateway</html>');
    await expect(liveKitDevAgent(ENV, undefined, noRooms).flagSecretTimes()).rejects.toThrow(
      /ListAgentSecrets.*502/
    );
  });
});
