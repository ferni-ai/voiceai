/**
 * TOOL_COVERAGE_SHADOW (#4399): the log-only measurement of which tools a smaller core would miss.
 *
 * Fictional data throughout. The rows pin: flag off is main (same tool set, no line); the line
 * carries a domain name, booleans and the session id and nothing the caller said; the core and
 * the intent flag are read from the right place; a failure in the shadow never reaches the turn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shadowLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'ToolCoverageShadow' ? shadowLog : actual.createLogger(bindings),
  };
});
const registered = vi.hoisted(() => {
  const domains: Record<string, string> = {};
  return { domains, failGet: false };
});
vi.mock('../../registry/index.js', () => ({
  toolRegistry: {
    get: (name: string) => {
      if (registered.failGet) throw new Error('registry down');
      const domain = registered.domains[name];
      return domain ? { domain } : undefined;
    },
  },
}));

import type { Tool } from '../../registry/types.js';
import { shadowSelection } from '../coverage-shadow.js';

const ID_LENGTH = 40;

/** The tool set `getToolsForAgent` would hand out for a selection of `tools`. */
const withCoverageShadow = async (tools: Record<string, Tool>, sessionId: string | undefined) =>
  (await shadowSelection(Promise.resolve({ tools }), sessionId)).tools;
const CALLER_WORDS = 'my aunt died and nobody in zorbleflax knows';

const tool = (result: unknown = 'ok', description = 'a tool'): Tool =>
  ({ description, execute: vi.fn(async () => result) }) as unknown as Tool;

/** The SDK's second execute() argument, with the caller's last message in the session history. */
const runCtx = (text: string | undefined) => ({
  ctx: {
    session: {
      history: {
        items: [
          { type: 'message', role: 'user', textContent: 'earlier words' },
          { type: 'function_call', role: undefined },
          ...(text === undefined ? [] : [{ type: 'message', role: 'user', textContent: text }]),
          { type: 'message', role: 'assistant', textContent: 'a reply' },
        ],
      },
    },
  },
});

const callLines = () => shadowLog.info.mock.calls.filter((c) => c[1] === 'Tool coverage');
const sizeLines = () =>
  shadowLog.info.mock.calls.filter((c) => c[1] === 'Tool coverage schema size');

beforeEach(() => {
  registered.domains = { callOnBehalf: 'telephony', playMusic: 'entertainment', grieve: 'grief' };
  registered.failGet = false;
  vi.stubEnv('TOOL_COVERAGE_SHADOW', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  shadowLog.info.mockReset();
});

describe('flag off is main', () => {
  it('returns the very tool set it was given, and a call logs nothing', async () => {
    vi.stubEnv('TOOL_COVERAGE_SHADOW', 'off');
    const tools = { callOnBehalf: tool('called') };
    const out = await withCoverageShadow(tools, 'session-fic1');
    expect(out).toBe(tools);
    expect(await out.callOnBehalf.execute?.({}, runCtx(CALLER_WORDS))).toBe('called');
    expect(shadowLog.info).not.toHaveBeenCalled();
  });

  it('is off when the flag is unset', async () => {
    vi.unstubAllEnvs();
    const tools = { callOnBehalf: tool() };
    expect(await withCoverageShadow(tools, 'session-fic1')).toBe(tools);
    expect(shadowLog.info).not.toHaveBeenCalled();
  });
});

describe('flag on: one numbers-only line per call', () => {
  it('names the domain, the core and the turn intent, and the tool still returns its result', async () => {
    const tools = await withCoverageShadow(
      { callOnBehalf: tool('called'), grieve: tool('held') },
      'session-fic1'
    );

    expect(await tools.callOnBehalf.execute?.({ to: 'Mom' }, runCtx(CALLER_WORDS))).toBe('called');
    expect(callLines()[0][0]).toEqual({
      sessionId: 'session-fic1',
      domain: 'telephony',
      inCore: true,
      intentNamedDomain: false, // "died" names the grief domain, not telephony
      userTextFound: true,
    });

    expect(await tools.grieve.execute?.({}, runCtx(CALLER_WORDS))).toBe('held');
    expect(callLines()[1][0]).toMatchObject({
      domain: 'grief',
      inCore: false,
      intentNamedDomain: true,
    });
  });

  it('marks a tool outside the candidate core', async () => {
    const tools = await withCoverageShadow({ playMusic: tool() }, 'session-fic1');
    await tools.playMusic.execute?.({}, runCtx('play something'));
    expect(callLines()[0][0]).toMatchObject({ domain: 'entertainment', inCore: false });
  });

  it('reads handoff tools, built outside the registry, as the handoff domain', async () => {
    const tools = await withCoverageShadow(
      { handoffToMaya: tool(), mysteryTool: tool() },
      'session-fic1'
    );
    await tools.handoffToMaya.execute?.({}, runCtx(undefined));
    await tools.mysteryTool.execute?.({}, runCtx(undefined));
    expect(callLines()[0][0]).toMatchObject({ domain: 'handoff', inCore: true });
    expect(callLines()[1][0]).toMatchObject({ domain: 'unregistered', inCore: false });
  });

  it('says so when the live session gave no caller message', async () => {
    const tools = await withCoverageShadow({ callOnBehalf: tool() }, 'session-fic1');
    await tools.callOnBehalf.execute?.({}, undefined);
    expect(callLines()[0][0]).toMatchObject({ intentNamedDomain: false, userTextFound: false });
  });

  it.each([
    ['telephony', true],
    ['calendar', true], // manageContact finds "mom" in the address book
    ['communication', true],
    ['scheduling', true],
    ['memory', true],
    ['handoff', true],
    ['productivity', false],
    ['family', false],
    ['habits', false],
    ['wellness', false],
    ['entertainment', false],
    ['information', false],
    ['games', false],
    ['human-transfer', false], // a crisis tool outside the core would be a finding
  ])('reads the %s domain as inCore %s', async (domain, inCore) => {
    registered.domains = { someTool: domain };
    const tools = await withCoverageShadow({ someTool: tool() }, 'session-fic1');
    await tools.someTool.execute?.({}, runCtx(undefined));
    expect(callLines()[0][0]).toMatchObject({ domain, inCore });
  });
});

describe('what the lines can carry', () => {
  it('no string field is longer than an id, and none holds the caller words, arguments or result', async () => {
    const secret = 'zorbleflax-fictional-secret-phrase-that-is-far-longer-than-any-id';
    const tools = await withCoverageShadow(
      { callOnBehalf: tool(secret, secret.repeat(3)) },
      'session-fic1'
    );
    await tools.callOnBehalf.execute?.({ purpose: secret }, runCtx(`${CALLER_WORDS} ${secret}`));

    const logged = shadowLog.info.mock.calls.flatMap((c) => Object.values(c[0] as object));
    expect(logged.length).toBeGreaterThan(0);
    for (const value of logged) {
      if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(ID_LENGTH);
    }
    const everything = JSON.stringify(shadowLog.info.mock.calls);
    expect(everything).not.toContain('zorbleflax');
    expect(everything).not.toContain('Mom');
  });
});

describe('schema size, once per session', () => {
  it('logs the tool count and token estimate on the first selection only', async () => {
    const set = () => ({ a: tool('ok', 'x'.repeat(400)), b: tool('ok', 'y'.repeat(200)) });
    await withCoverageShadow(set(), 'session-size-a');
    await withCoverageShadow(set(), 'session-size-a');
    expect(sizeLines()).toHaveLength(1);
    // (10 + 400/4 + 50) + (10 + 200/4 + 50) = 160 + 110
    expect(sizeLines()[0][0]).toEqual({
      sessionId: 'session-size-a',
      toolCount: 2,
      schemaTokens: 270,
    });

    await withCoverageShadow(set(), 'session-size-b');
    expect(sizeLines()).toHaveLength(2);
  });
});

describe('an exception in the shadow never reaches the turn', () => {
  it('a logger that throws leaves the tool result untouched', async () => {
    const tools = await withCoverageShadow({ callOnBehalf: tool('called') }, 'session-fic1');
    shadowLog.info.mockImplementation(() => {
      throw new Error('log sink down');
    });
    expect(await tools.callOnBehalf.execute?.({}, runCtx(CALLER_WORDS))).toBe('called');
  });

  it('a registry that throws leaves the tool result untouched', async () => {
    const tools = await withCoverageShadow({ callOnBehalf: tool('called') }, 'session-fic1');
    registered.failGet = true;
    expect(await tools.callOnBehalf.execute?.({}, runCtx(CALLER_WORDS))).toBe('called');
  });

  it('a malformed run context leaves the tool result untouched', async () => {
    const tools = await withCoverageShadow({ callOnBehalf: tool('called') }, 'session-fic1');
    const hostile = { ctx: { session: { history: { items: [null, 7, { role: 'user' }] } } } };
    expect(await tools.callOnBehalf.execute?.({}, hostile)).toBe('called');
  });

  it('a tool set that cannot be wrapped comes back as it was', async () => {
    const tools = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('hostile');
        },
      }
    ) as Record<string, Tool>;
    expect(await withCoverageShadow(tools, 'session-fic1')).toBe(tools);
  });

  it('a tool that throws throws the same error', async () => {
    const boom = new Error('call failed');
    const failing = {
      description: 'd',
      execute: vi.fn(async () => Promise.reject(boom)),
    } as unknown as Tool;
    const tools = await withCoverageShadow({ callOnBehalf: failing }, 'session-fic1');
    await expect(tools.callOnBehalf.execute?.({}, runCtx(undefined))).rejects.toBe(boom);
  });

  it('a tool without execute passes through', async () => {
    const plain = { description: 'provider tool' } as unknown as Tool;
    expect((await withCoverageShadow({ x: plain }, 'session-fic1')).x).toBe(plain);
  });
});

describe('wrapping twice', () => {
  it('adds no second layer: one call, one line', async () => {
    const once = await withCoverageShadow({ callOnBehalf: tool() }, 'session-fic1');
    const twice = await withCoverageShadow(once, 'session-fic1');
    await twice.callOnBehalf.execute?.({}, runCtx(undefined));
    expect(callLines()).toHaveLength(1);
  });
});

describe('shadowSelection', () => {
  it('keeps the selection metadata and wraps its tools', async () => {
    const meta = { mode: 'legacy', toolCount: 1 };
    const out = await shadowSelection(
      Promise.resolve({ tools: { callOnBehalf: tool('called') }, meta }),
      'session-fic1'
    );
    expect(out.meta).toBe(meta);
    await out.tools.callOnBehalf.execute?.({}, runCtx(undefined));
    expect(callLines()).toHaveLength(1);
  });

  it('a selection that fails fails the same way', async () => {
    const boom = new Error('no tools');
    await expect(shadowSelection(Promise.reject(boom), 'session-fic1')).rejects.toBe(boom);
  });
});
