/**
 * SMART_HOME_LIFX: the light tools run as the call's own verified caller, with
 * that caller's own saved LIFX token.
 *
 * Before, createSmartHomeTools() was built with no user, so no saved token was
 * ever loaded. The real tool definitions, the real credential store
 * (user-credentials.ts) over a fake Firestore, and the real LIFX client over a
 * stubbed fetch: the bearer token LIFX receives is the one assertion that
 * names whose lights moved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  // bogle_users/{uid}/smart_home/{integration}
  docs: new Map<string, Record<string, unknown>>(),
  credentialReads: [] as string[],
  lifxCalls: [] as Array<{ url: string; method: string; auth: string }>,
}));

vi.mock('../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: (uid: string) => ({
        collection: () => ({
          doc: (integration: string) => ({
            get: async () => {
              h.credentialReads.push(uid);
              const data = h.docs.get(`${uid}/${integration}`);
              return { exists: data !== undefined, data: () => data };
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../services/identity/ecobee-auth.js', () => ({
  isEcobeeConfigured: async () => false,
}));

const { getToolDefinitions } = await import('../index.js');

const TOKEN_A = 'lifx-token-of-caller-a';
const TOKEN_B = 'lifx-token-of-caller-b';

function callFrom(userData: Record<string, unknown>): unknown {
  return { ctx: { userData } };
}

interface LightTool {
  execute: (args: unknown, opts: unknown) => Promise<unknown>;
}

async function lightTools(): Promise<{ control: LightTool; list: LightTool }> {
  const defs = await getToolDefinitions();
  const ctx = {
    userId: 'gateway', // the shared gateway build: the call, not the build, names the caller
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: { has: () => false, get: () => undefined, getOptional: () => undefined },
  } as never;
  const def = (id: string) => {
    const found = defs.find((d) => d.id === id);
    if (!found) throw new Error(`${id} not offered`);
    return found;
  };
  return { control: def('controlLight').create(ctx), list: def('listSmartDevices').create(ctx) };
}

beforeEach(() => {
  h.docs.clear();
  h.credentialReads.length = 0;
  h.lifxCalls.length = 0;
  h.docs.set('uid-a/lifx', { token: TOKEN_A });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    h.lifxCalls.push({ url, method: init?.method ?? 'GET', auth: headers.Authorization ?? '' });
    const body = url.endsWith('/lights/all')
      ? [{ id: 'd073d5', label: 'Bedroom Lamp', power: 'off', brightness: 0.4 }]
      : { results: [{ status: 'ok' }] };
    return new globalThis.Response(JSON.stringify(body), { status: 200 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SMART_HOME_LIFX on', () => {
  beforeEach(() => vi.stubEnv('SMART_HOME_LIFX', 'on'));

  it('offers only the two light tools, in the smart-home domain', async () => {
    const defs = await getToolDefinitions();
    expect(defs.map((d) => [d.id, d.domain])).toEqual([
      ['controlLight', 'smart-home'],
      ['listSmartDevices', 'smart-home'],
    ]);
  });

  it('a verified caller with a LIFX token turns on their own lamp with their own token', async () => {
    const { control } = await lightTools();
    const said = await control.execute(
      { room: 'bedroom lamp', action: 'on' },
      callFrom({ userId: 'uid-a', verifiedCaller: true })
    );

    expect(said).toContain('Bedroom Lamp');
    expect(said).toContain('is now on');
    const put = h.lifxCalls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('https://api.lifx.com/v1/lights/d073d5/state');
    expect(h.lifxCalls.map((c) => c.auth)).toEqual(h.lifxCalls.map(() => `Bearer ${TOKEN_A}`));
    expect(h.lifxCalls.length).toBeGreaterThan(1);
  });

  it("lists the caller's own lights", async () => {
    const { list } = await lightTools();
    const said = await list.execute(
      { type: 'lights' },
      callFrom({ userId: 'uid-a', verifiedCaller: true })
    );
    expect(said).toContain('Bedroom Lamp');
    expect(h.lifxCalls).toEqual([
      { url: 'https://api.lifx.com/v1/lights/all', method: 'GET', auth: `Bearer ${TOKEN_A}` },
    ]);
  });

  it("another verified caller never reaches caller A's token", async () => {
    const { control } = await lightTools();
    // No token of their own, and a model-supplied userId naming caller A.
    const said = await control.execute(
      { room: 'bedroom lamp', action: 'off', userId: 'uid-a' },
      callFrom({ userId: 'uid-b', verifiedCaller: true })
    );
    expect(said).toMatch(/aren't linked yet/);
    expect(h.lifxCalls).toEqual([]);
    expect(h.credentialReads).not.toContain('uid-a');

    // With a token of their own, LIFX hears caller B's token, never A's.
    h.docs.set('uid-b/lifx', { token: TOKEN_B });
    await control.execute(
      { room: 'bedroom lamp', action: 'off' },
      callFrom({ userId: 'uid-b', verifiedCaller: true })
    );
    expect(h.lifxCalls.length).toBeGreaterThan(0);
    expect(new Set(h.lifxCalls.map((c) => c.auth))).toEqual(new Set([`Bearer ${TOKEN_B}`]));
  });

  it.each([
    ['an anonymous caller', { userId: 'anon:5f1c', verifiedCaller: false }],
    ['a device id', { userId: 'device:ipad-1', verifiedCaller: true }],
    ['a caller-ID phone id', { userId: 'phone:+14155550100', verifiedCaller: true }],
    ['the third party on an on-behalf call', { userId: 'onbehalf:call-9', verifiedCaller: true }],
    ['an account the server did not verify', { userId: 'uid-a', verifiedCaller: false }],
    ['a session that never said', { userId: 'uid-a' }],
    ['no caller at all', {}],
  ])('%s is refused and no lights move', async (_who, userData) => {
    const { control, list } = await lightTools();
    for (const said of [
      await control.execute(
        { room: 'bedroom lamp', action: 'on', userId: 'uid-a' },
        callFrom(userData)
      ),
      await list.execute({ type: 'all' }, callFrom(userData)),
    ]) {
      expect(said).toMatch(/signed-in account/);
    }
    expect(h.lifxCalls).toEqual([]);
    expect(h.credentialReads).toEqual([]);
  });
});

describe('SMART_HOME_LIFX off (default)', () => {
  it('offers the same twelve tools in the home domain as before', async () => {
    const defs = await getToolDefinitions();
    expect(defs).toHaveLength(12);
    expect(new Set(defs.map((d) => d.domain))).toEqual(new Set(['home']));
    expect(defs.map((d) => d.id)).toContain('broadcastMessage');
    expect(defs.map((d) => d.id)).not.toContain('listSmartDevices');
  });

  it('controlLight is still built with no caller, so no saved token is loaded', async () => {
    const defs = await getToolDefinitions();
    const control: LightTool = defs
      .find((d) => d.id === 'controlLight')!
      .create({ userId: 'uid-a' } as never);
    const said = await control.execute(
      { room: 'bedroom lamp', action: 'on' },
      callFrom({ userId: 'uid-a', verifiedCaller: true })
    );
    expect(said).toMatch(/Smart Home Not Connected Yet/);
    expect(h.credentialReads).toEqual([]);
    expect(h.lifxCalls).toEqual([]);
  });
});
