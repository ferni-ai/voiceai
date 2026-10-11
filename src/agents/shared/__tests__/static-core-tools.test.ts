/**
 * TOOL_CORE_STATIC: the call's tool set is built once and the requests' tool
 * declarations stay the same for the whole call. Tools go through the real
 * updateAgentTools on a real SDK agent, and requests through the real cascade
 * LLM (CartesiaCascadeProvider -> the Google plugin); only the plugin's
 * streaming call is stubbed, as in append-only-tools.test.ts.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { STATIC_CORE_TOOLS } from '../../../config/tool-config.js';
import { CartesiaCascadeProvider } from '../../model-provider/cartesia-cascade.js';
import { buildToolsByName, createToolPinner, staticCoreTools } from '../static-core-tools.js';
import { getAgentToolNames, updateAgentTools } from '../tool-updater.js';

interface CapturedRequest {
  config: { tools?: Array<{ functionDeclarations?: Array<{ name: string }> }> };
}

const pluginEntry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
const genaiEntry = join(dirname(createRequire(pluginEntry).resolve('@google/genai')), 'index.mjs');
const { Models } = (await import(pathToFileURL(genaiEntry).href)) as {
  Models: { prototype: { generateContentStreamInternal: (p: CapturedRequest) => unknown } };
};

let captured: CapturedRequest[] = [];
const saved = { ...process.env };

beforeEach(() => {
  captured = [];
  process.env.GOOGLE_CLOUD_PROJECT ||= 'test-project';
  process.env.CASCADE_LLM_HEDGE_MS = 'off';
  process.env.TOOL_CORE_STATIC = 'on';
  vi.spyOn(Models.prototype, 'generateContentStreamInternal').mockImplementation(
    async (params: CapturedRequest) => {
      captured.push(params);
      return (async function* () {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Sure.' }] }, finishReason: 'STOP' },
          ],
        };
      })();
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

const tool = (name: string) =>
  llm.tool({
    description: `${name}: does what its name says.`,
    parameters: z.object({ query: z.string() }),
    execute: async () => 'ok',
  });
const toolSet = (names: readonly string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));
const topic = (domain: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${domain}Tool${String(i).padStart(2, '0')}`);
const CTX = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' };
const buildAll = async (names: readonly string[]) => toolSet(names);

type Agent = Parameters<typeof updateAgentTools>[0] & voice.Agent<unknown>;
const makeAgent = (tools: Record<string, unknown>) =>
  new voice.Agent({ instructions: 'You are Ferni.', tools: tools as never }) as unknown as Agent;

async function requestTools(agent: Agent): Promise<string> {
  const model = (await new CartesiaCascadeProvider().createLLMModel({
    model: 'ignored',
    instructions: 'x',
  })) as llm.LLM;
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'system', content: 'You are Ferni.' });
  chatCtx.addMessage({ role: 'user', content: 'Hey.' });
  const stream = model.chat({
    chatCtx,
    toolCtx: agent.toolCtx,
    connOptions: DEFAULT_API_CONNECT_OPTIONS,
  });
  for await (const _chunk of stream) {
    // drain
  }
  return JSON.stringify(captured[captured.length - 1].config.tools?.[0]?.functionDeclarations);
}

// The essential-domain set the first agent gets today: some core tools, many others.
const ESSENTIAL_DOMAIN_TOOLS = [
  'handoffToMaya',
  ...topic('memory', 20),
  'playMusic',
  'recallFromMemory',
  'zebraTool',
  'musicControl',
  'askForTeammate',
];

describe('staticCoreTools', () => {
  it('is the core in order, missing ones built by name, then teammates; nothing else', async () => {
    const build = vi.fn(buildAll);
    const core = await staticCoreTools(toolSet(ESSENTIAL_DOMAIN_TOOLS), CTX, build);
    const names = Object.keys(core);
    expect(names).toEqual([...STATIC_CORE_TOOLS, 'handoffToMaya', 'askForTeammate']);
    expect(build.mock.calls[0][0]).toEqual(
      STATIC_CORE_TOOLS.filter((n) => !ESSENTIAL_DOMAIN_TOOLS.includes(n))
    );
    expect(names).not.toContain('zebraTool');
    expect(names.length).toBeLessThan(40);
  });

  it('a failed build leaves out only what it would have added', async () => {
    const core = await staticCoreTools(toolSet(ESSENTIAL_DOMAIN_TOOLS), CTX, async () => {
      throw new Error('registry down');
    });
    expect(Object.keys(core)).toEqual([
      'recallFromMemory',
      'playMusic',
      'musicControl',
      'handoffToMaya',
      'askForTeammate',
    ]);
  });

  it('builds real catalog tools by name from domains the essential set lacks', async () => {
    const built = await buildToolsByName(
      ['quickTimer', 'tellJoke', 'getWeatherForecast', 'noSuchTool'],
      CTX
    );
    expect(Object.keys(built).sort()).toEqual(['getWeatherForecast', 'quickTimer', 'tellJoke']);
  }, 60_000);
});

describe('TOOL_CORE_STATIC on a call', () => {
  it('topic loads change nothing: the request is the same on every turn', async () => {
    const agent = makeAgent(await staticCoreTools(toolSet(ESSENTIAL_DOMAIN_TOOLS), CTX, buildAll));
    const first = await requestTools(agent);
    for (const d of ['calendar', 'alpha', 'weather']) {
      await updateAgentTools(agent, toolSet(topic(d, 12)), { domains: [d] });
      expect(await requestTools(agent)).toBe(first);
    }
    expect(getAgentToolNames(agent)).not.toContain('alphaTool00');
  });

  it('a pinned (findTools) tool is appended: the earlier declarations stay a byte-identical prefix', async () => {
    const agent = makeAgent(await staticCoreTools(toolSet(ESSENTIAL_DOMAIN_TOOLS), CTX, buildAll));
    const before = await requestTools(agent);
    const pin = createToolPinner(() => agent, CTX, buildAll);
    const found = await pin(['aardvarkTool']); // sorts ahead of every core tool by name
    const after = await requestTools(agent);

    expect(found.map((f) => f.name)).toEqual(['aardvarkTool']);
    expect(after.startsWith(before.slice(0, -1))).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
    // Sticky: later topic loads don't push it out.
    await updateAgentTools(agent, toolSet(topic('calendar', 30)));
    expect(getAgentToolNames(agent).at(-1)).toBe('aardvarkTool');
  });

  it("off: today's behaviour, topic loads change the request", async () => {
    delete process.env.TOOL_CORE_STATIC;
    const agent = makeAgent(toolSet(ESSENTIAL_DOMAIN_TOOLS));
    const first = await requestTools(agent);
    await updateAgentTools(agent, toolSet(topic('alpha', 12)));
    expect(await requestTools(agent)).not.toBe(first);
    expect(getAgentToolNames(agent)).toContain('alphaTool00');
  });
});
