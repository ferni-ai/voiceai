/**
 * CASCADE_APPEND_ONLY_TOOLS: a mid-call domain load must leave the request's
 * earlier tool declarations as they were, so Gemini can still serve them from
 * its prompt cache. Tools go through the real updateAgentTools on a real SDK
 * agent, and requests through the real cascade LLM (CartesiaCascadeProvider ->
 * the Google plugin); only the plugin's streaming call is stubbed.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  APPEND_ONLY_EVICT_BLOCK,
  APPEND_ONLY_TOOL_CAP,
  getEssentialTools,
} from '../../../config/tool-config.js';
import { CartesiaCascadeProvider } from '../../model-provider/cartesia-cascade.js';
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
  process.env.CASCADE_APPEND_ONLY_TOOLS = 'on';
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
const toolSet = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));
const topic = (domain: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${domain}Tool${String(i).padStart(2, '0')}`);

// The prod shape: ~60 essential tools at the greeting, then topic domains.
const ESSENTIAL = getEssentialTools().slice(0, 60);
type Agent = Parameters<typeof updateAgentTools>[0] & voice.Agent<unknown>;
const makeAgent = (names: string[]) =>
  new voice.Agent({ instructions: 'You are Ferni.', tools: toolSet(names) }) as unknown as Agent;

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

/** The earlier request's declarations, minus the closing bracket: what must stay a prefix. */
const opening = (json: string) => json.slice(0, -1);

describe('CASCADE_APPEND_ONLY_TOOLS', () => {
  it('a domain load appends: the earlier declarations stay a byte-identical prefix', async () => {
    const agent = makeAgent(ESSENTIAL);
    await updateAgentTools(agent, toolSet(topic('calendar', 20))); // post-greeting expansion
    const before = await requestTools(agent);
    await updateAgentTools(agent, toolSet(topic('alpha', 10))); // sorts ahead of everything
    const after = await requestTools(agent);

    expect(after.startsWith(opening(before))).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
    expect(getAgentToolNames(agent)).toHaveLength(ESSENTIAL.length + 30);
  });

  it('holds the cap by evicting the oldest topic tools as one block, never essential ones', async () => {
    const agent = makeAgent(ESSENTIAL);
    const domains = ['bills', 'chess', 'diet', 'email', 'films', 'golf', 'hikes', 'ink'];
    const counts: number[] = [];
    for (const d of domains) {
      await updateAgentTools(agent, toolSet(topic(d, 12)));
      counts.push(getAgentToolNames(agent).length);
    }

    const names = getAgentToolNames(agent);
    expect(Math.max(...counts)).toBeLessThanOrEqual(APPEND_ONLY_TOOL_CAP);
    for (const e of ESSENTIAL) expect(names).toContain(e);
    // Loads append until the cap; the one that crosses it drops the call to
    // CAP - BLOCK, so the next loads append again.
    const drops = counts.slice(1).filter((c, i) => c < counts[i]);
    expect(drops).toEqual([APPEND_ONLY_TOOL_CAP - APPEND_ONLY_EVICT_BLOCK]);
    // The oldest topic domain went first; the newest load is all there.
    expect(names).not.toContain('billsTool00');
    for (const t of topic('ink', 12)) expect(names).toContain(t);
  });

  it('off: a load reorders the declarations from the front (the default, unchanged)', async () => {
    delete process.env.CASCADE_APPEND_ONLY_TOOLS;
    const agent = makeAgent(ESSENTIAL);
    await updateAgentTools(agent, toolSet(topic('calendar', 20)));
    const before = await requestTools(agent);
    await updateAgentTools(agent, toolSet(topic('alpha', 10)));
    const after = await requestTools(agent);

    expect(after.startsWith(opening(before))).toBe(false);
  });
});
