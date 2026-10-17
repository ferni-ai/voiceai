/**
 * ALWAYS_ON_INFO_TOOLS=on: every persona starts with getNews, getWeather,
 * getWeatherForecast and searchWeb, and the initial cap keeps them.
 *
 * A handed-to persona starts with the Tool Gateway's Tier 0 (agent-setup.ts
 * loadToolsFromGateway). On a prod call (2026-10-17) that had no news or weather
 * tool: Peter asked for a city instead of checking the weather, and Peter and
 * Nayan said "I don't have a tool to pull up current news" to "check the news".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capToolsToLimit, getMaxTools } from '../../../config/tool-config.js';
import { getToolGateway, resetToolGateway } from '../../../tools/gateway/tool-gateway.js';
import { ALWAYS_ON_INFO_TOOLS, withAlwaysOnInfoTools } from '../always-on-info-tools.js';
import { resolveInitialToolLimit } from '../initial-tools.js';

const INFO_TOOLS = ['getNews', 'getWeather', 'getWeatherForecast', 'searchWeb'];
const peterCtx = {
  userId: 'test-user',
  sessionId: 'session-1',
  agentId: 'peter-john',
  agentDisplayName: 'Peter',
};

/** The handoff path's tools, then the same cap agent-setup applies. */
async function handedToPeterTools(): Promise<string[]> {
  resetToolGateway();
  const gateway = getToolGateway();
  await gateway.warmup();
  const loaded = gateway.getSessionTools() as Record<string, unknown>;
  const tools = await withAlwaysOnInfoTools(loaded, peterCtx);
  return Object.keys(capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools())));
}

describe("a handed-to persona's first-turn tools", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetToolGateway();
  });

  it('have no news or weather tool by default (the 2026-10-17 call)', async () => {
    const tools = await handedToPeterTools();
    for (const name of INFO_TOOLS) expect(tools).not.toContain(name);
    expect(tools).toContain('getCurrentContext'); // what Peter fell back on
  }, 60_000);

  it('ALWAYS_ON_INFO_TOOLS=on has all four, and only those from information', async () => {
    vi.stubEnv('ALWAYS_ON_INFO_TOOLS', 'on');
    expect(ALWAYS_ON_INFO_TOOLS).toEqual(INFO_TOOLS);
    const tools = await handedToPeterTools();
    expect(tools).toEqual(expect.arrayContaining(INFO_TOOLS));
    expect(tools).not.toContain('getSports');
    expect(tools).not.toContain('getCommuteTime');
  }, 60_000);

  it('the cap keeps them when a persona has far more tools than the limit', async () => {
    vi.stubEnv('ALWAYS_ON_INFO_TOOLS', 'on');
    const many = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`domainTool${i}`, { description: 'x' }])
    );
    const tools = await withAlwaysOnInfoTools(many, peterCtx);
    const capped = Object.keys(capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools())));
    expect(capped).toEqual(expect.arrayContaining(INFO_TOOLS));
  }, 60_000);
});
