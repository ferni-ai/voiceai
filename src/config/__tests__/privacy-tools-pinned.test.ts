/**
 * A member's "forget that" (forgetMemory) and "that's wrong" (updateMemory)
 * must always be runnable: no tool cap may drop them, whatever else is loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const PRIVACY = ['forgetMemory', 'updateMemory'];

/** 100 non-essential tools first, then the privacy tools last, so insertion order can't save them. */
function crowdedTools(): Record<string, unknown> {
  const tools: Record<string, unknown> = {};
  for (let i = 0; i < 100; i++) tools[`fillerTool${i}`] = {};
  for (const name of PRIVACY) tools[name] = {};
  return tools;
}

async function loadConfig(sameTurn: string) {
  vi.resetModules();
  vi.stubEnv('TOOLS_SAME_TURN', sameTurn);
  return import('../tool-config.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('privacy tools survive every tool cap', () => {
  it.each(['off', 'on'])(
    'keeps both when capping more tools than the cap (TOOLS_SAME_TURN=%s)',
    async (mode) => {
      const { capToolsToLimit, isEssentialTool } = await loadConfig(mode);
      const capped = Object.keys(capToolsToLimit(crowdedTools(), 10));

      expect(capped.length).toBeLessThanOrEqual(10);
      for (const name of PRIVACY) {
        expect(isEssentialTool(name)).toBe(true);
        expect(capped).toContain(name);
      }
    }
  );

  it('keeps both when capping the real essential domains for the first agent', async () => {
    const { capToolsToLimit } = await loadConfig('off');
    const { loadEssentialDomains } = await import('../../tools/dynamic-loader/index.js');
    const { resolveInitialToolLimit } = await import('../../agents/multi-agent/initial-tools.js');

    const all = await loadEssentialDomains('test-user', undefined);
    for (const name of PRIVACY) expect(Object.keys(all)).toContain(name);

    const capped = Object.keys(capToolsToLimit(all, resolveInitialToolLimit(0)));
    expect(capped.length).toBeLessThan(Object.keys(all).length);
    for (const name of PRIVACY) expect(capped).toContain(name);
  }, 60_000);

  it('are in the TOOL_CORE_STATIC set, so a static-core call keeps them', async () => {
    vi.resetModules();
    const { staticCoreTools } = await import('../../agents/shared/static-core-tools.js');
    const { isStaticCoreTool } = await import('../tool-config.js');
    const have = crowdedTools();
    const core = Object.keys(
      await staticCoreTools(have, { userId: 'u1' } as never, async () => ({}))
    );

    expect(core).not.toContain('fillerTool0');
    for (const name of PRIVACY) {
      expect(isStaticCoreTool(name)).toBe(true);
      expect(core).toContain(name);
    }
  });
});
