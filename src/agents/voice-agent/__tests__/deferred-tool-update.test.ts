/**
 * The mid-session update after a topic loads a domain must offer that domain's
 * tools, not the loader's whole catalog.
 *
 * It passed getCurrentTools(), every loaded tool (~211 once `information`
 * loaded) with the essential domains first, so the 64-tool cap kept those and
 * cut the new domain. A local call (2026-10-08) had getCommuteTime unavailable
 * all call long, and Ferni guessed "about four hours" from St. George to Zion.
 */
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEFAULT_INITIAL_TOOL_LIMIT } from '../../multi-agent/initial-tools.js';
import { getAgentToolNames } from '../../shared/tool-updater.js';
import { updateToolsAfterReplyStarts } from '../deferred-tool-update.js';

type Args = Parameters<typeof updateToolsAfterReplyStarts>;

const makeTool = (label: string) =>
  llm.tool({
    description: `test tool ${label}`,
    parameters: z.object({}),
    execute: async () => label,
  });

const toolRecord = (prefix: string, count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`${prefix}${i}`, makeTool(`${prefix}${i}`)])
  );

const silentLog = { info: () => {}, warn: () => {} } as unknown as Args[4];

describe('updateToolsAfterReplyStarts', () => {
  beforeEach(() => {
    vi.stubEnv('DEFER_TOOL_UPDATES', 'off'); // apply now, so the promise waits for it
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives an agent at the cap the newly loaded domain's tools", async () => {
    const agent = new voice.Agent({ instructions: 'test', tools: toolRecord('startTool', 64) });
    const information = {
      getCommuteTime: makeTool('commute'),
      getDirections: makeTool('directions'),
    };
    // The loader's catalog: essential domains first, the new domain last.
    const loader = {
      getCurrentTools: () => ({ ...toolRecord('essentialDomainTool', 150), ...information }),
      getToolsForDomains: (domains: readonly string[]) =>
        domains.includes('information') ? information : {},
    };

    await updateToolsAfterReplyStarts(
      {} as Args[0],
      agent as unknown as Args[1],
      loader,
      ['information'],
      silentLog
    );

    const names = getAgentToolNames(agent as unknown as Args[1]);
    // Topic headroom adds the domain's tools on top of the 64; none evicted.
    expect(names).toHaveLength(DEFAULT_INITIAL_TOOL_LIMIT + 2);
    expect(names).toContain('getCommuteTime');
    expect(names).toContain('getDirections');
  });
});
