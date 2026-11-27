/**
 * TOOL_COVERAGE_SHADOW (#4399): getToolsForAgent hands out the shadowed tool set, on every
 * path that runs without an initialized orchestrator (fast and legacy). Mocked: the tool
 * builders and the domain loader, so each path's output is a fixed, known record.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const ran = vi.hoisted(() => ({ calls: 0 }));
const record = (names: string[]) =>
  Object.fromEntries(
    names.map((n) => [
      n,
      {
        description: n,
        execute: async () => {
          ran.calls += 1;
          return `${n} ran`;
        },
      },
    ])
  );
vi.mock('../../builder.js', () => ({
  buildEssentialTools: vi.fn(async () => record(['playMusic'])),
  buildAgentTools: vi.fn(async () => record(['playMusic'])),
}));
vi.mock('../../handoff/handoff-factory.js', () => ({
  buildHandoffTools: vi.fn(async () => ({ tools: record(['handoffToMaya']) })),
}));
vi.mock('../../registry/loader.js', () => ({
  loadToolDomainsLazy: vi.fn(async () => 0),
  autoRegisterAllDomains: vi.fn(async () => undefined),
}));

async function select(flag: string, path: 'fast' | 'legacy') {
  vi.resetModules();
  vi.stubEnv('TOOL_COVERAGE_SHADOW', flag);
  const { getToolsForAgent } = await import('../voice-agent-integration.js');
  return getToolsForAgent({
    persona: { id: 'ferni', displayName: 'ferni' },
    userId: 'user-fic1',
    sessionId: 'session-fic1',
    fastPath: path === 'fast',
    useLegacy: path === 'legacy',
  });
}

const lines = () => shadowLog.info.mock.calls.filter((c) => c[1] === 'Tool coverage');

afterEach(() => {
  vi.unstubAllEnvs();
  shadowLog.info.mockReset();
  ran.calls = 0;
});

/** A tool each path hands out, and the domain the shadow reads it as (the registry is empty here). */
const PATHS = [
  { path: 'fast', name: 'handoffToMaya', domain: 'handoff', inCore: true },
  { path: 'legacy', name: 'playMusic', domain: 'unregistered', inCore: false },
] as const;

interface Runnable {
  execute: () => Promise<string>;
}

describe.each(PATHS)('getToolsForAgent, $path path', ({ path, name, domain, inCore }) => {
  it('flag on: a call to a handed-out tool is counted, and the tool still runs', async () => {
    const { tools } = await select('on', path);
    expect(await (tools[name] as unknown as Runnable).execute()).toBe(`${name} ran`);
    expect(ran.calls).toBe(1);
    expect(lines()).toHaveLength(1);
    expect(lines()[0][0]).toMatchObject({ sessionId: 'session-fic1', domain, inCore });
  });

  it('flag off: the same call logs nothing', async () => {
    const { tools } = await select('off', path);
    expect(await (tools[name] as unknown as Runnable).execute()).toBe(`${name} ran`);
    expect(ran.calls).toBe(1);
    expect(shadowLog.info).not.toHaveBeenCalled();
  });
});
