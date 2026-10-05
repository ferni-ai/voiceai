/**
 * Tool schemas convert to Gemini declarations once per tool set, not once per
 * request. The plugin used to convert all 64 cascade tools on every request,
 * retry and hedge (docs/perf/llm-request-cost.md).
 *
 * Requests go through the real cascade LLM (CartesiaCascadeProvider ->
 * HedgedLLM -> the Google plugin); only the plugin's Gemini streaming call is
 * stubbed, to capture each request.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CartesiaCascadeProvider } from '../cartesia-cascade.js';
import {
  DeclarationCache,
  loadPluginConverter,
  type DeclarationConverter,
} from '../gemini-declarations.js';

interface CapturedRequest {
  model: string;
  config: { tools?: Array<{ functionDeclarations?: unknown[] }> };
}

// The @google/genai copy the plugin itself imports (the repo has two versions).
const pluginEntry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
const genaiEntry = join(dirname(createRequire(pluginEntry).resolve('@google/genai')), 'index.mjs');
const { Models } = (await import(pathToFileURL(genaiEntry).href)) as {
  Models: { prototype: { generateContentStreamInternal: (p: CapturedRequest) => unknown } };
};

const convert = (await loadPluginConverter()) as DeclarationConverter;

let captured: CapturedRequest[] = [];
let slowModel: string | undefined;

beforeEach(() => {
  captured = [];
  slowModel = undefined;
  vi.spyOn(Models.prototype, 'generateContentStreamInternal').mockImplementation(
    async (params: CapturedRequest) => {
      captured.push(params);
      const delay = params.model === slowModel ? 400 : 0;
      return (async function* () {
        if (delay) {
          await new Promise((r) => {
            setTimeout(r, delay);
          });
        }
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
  delete process.env.CASCADE_LLM_HEDGE_MS;
});

const tool = (
  description: string,
  parameters: z.ZodObject<z.ZodRawShape> = z.object({ when: z.string() })
) => llm.tool({ description, parameters, execute: async () => 'ok' });

function toolRecord(prefix: string): Record<string, ReturnType<typeof tool>> {
  return {
    [`${prefix}SetReminder`]: tool('Remind the user at a time.'),
    [`${prefix}PlayMusic`]: tool(
      'Play music.',
      z.object({ query: z.string(), shuffle: z.boolean() })
    ),
  };
}

async function cascadeLLM(): Promise<llm.LLM> {
  process.env.GOOGLE_CLOUD_PROJECT ||= 'test-project';
  return (await new CartesiaCascadeProvider().createLLMModel({
    model: 'ignored',
    instructions: 'x',
  })) as llm.LLM;
}

async function ask(model: llm.LLM, toolCtx?: llm.ToolContext): Promise<void> {
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'system', content: 'You are Ferni.' });
  chatCtx.addMessage({ role: 'user', content: 'remind me at five' });
  for await (const _chunk of model.chat({
    chatCtx,
    toolCtx,
    connOptions: DEFAULT_API_CONNECT_OPTIONS,
  })) {
    // drain
  }
}

const declarationsOf = (req: CapturedRequest) => req.config.tools?.[0]?.functionDeclarations;

describe('cascade requests reuse converted tool schemas', () => {
  it('sends the same declarations for an unchanged tool set, as the plugin would convert them', async () => {
    const model = await cascadeLLM();
    const tools = toolRecord('same');
    // The agent may hand over a fresh ToolContext each turn; the tools inside are the same.
    await ask(model, new llm.ToolContext(tools));
    await ask(model, new llm.ToolContext(tools));

    expect(captured).toHaveLength(2);
    expect(declarationsOf(captured[1])).toBe(declarationsOf(captured[0]));
    expect(captured[0].config.tools).toEqual([
      { functionDeclarations: convert(new llm.ToolContext(tools)) },
    ]);
  });

  it('converts again when the tool set changes', async () => {
    const model = await cascadeLLM();
    const tools = toolRecord('changed');
    await ask(model, new llm.ToolContext(tools));
    const grown = { ...tools, changedEndCall: tool('End the call.') };
    await ask(model, new llm.ToolContext(grown));

    expect(declarationsOf(captured[1])).not.toBe(declarationsOf(captured[0]));
    expect(captured[1].config.tools).toEqual([
      { functionDeclarations: convert(new llm.ToolContext(grown)) },
    ]);
  });

  it("lets a hedge backup reuse the primary's declarations", async () => {
    process.env.CASCADE_LLM_HEDGE_MS = '20';
    slowModel = 'gemini-3.5-flash';
    const model = await cascadeLLM();
    await ask(model, new llm.ToolContext(toolRecord('hedge')));

    expect(captured.map((r) => r.model)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(declarationsOf(captured[1])).toBe(declarationsOf(captured[0]));
  });

  it('sends no tools when the turn has none', async () => {
    await ask(await cascadeLLM());
    expect(captured[0].config.tools).toBeUndefined();
  });
});

describe('DeclarationCache', () => {
  const counting = () => vi.fn(convert);

  it('converts a tool set once and reconverts when a description or schema changes', () => {
    const spy = counting();
    const cache = new DeclarationCache(spy);
    const tools = toolRecord('unit');
    cache.declarationsFor(new llm.ToolContext(tools));
    cache.declarationsFor(new llm.ToolContext(tools));
    expect(spy).toHaveBeenCalledTimes(1);

    cache.declarationsFor(
      new llm.ToolContext({ ...tools, unitSetReminder: tool('Remind later.') })
    );
    cache.declarationsFor(
      new llm.ToolContext({
        ...tools,
        unitPlayMusic: tool('Play music.', z.object({ q: z.string() })),
      })
    );
    expect(spy).toHaveBeenCalledTimes(3);
    expect(cache.conversions).toBe(3);
  });

  it('stays bounded and drops the least recently used set', () => {
    const spy = counting();
    const cache = new DeclarationCache(spy, 2);
    const a = new llm.ToolContext(toolRecord('a'));
    const b = new llm.ToolContext(toolRecord('b'));
    const c = new llm.ToolContext(toolRecord('c'));
    cache.declarationsFor(a);
    cache.declarationsFor(b);
    cache.declarationsFor(a); // a is now the most recent
    cache.declarationsFor(c); // evicts b
    expect(cache.size).toBe(2);
    expect(spy).toHaveBeenCalledTimes(3);

    cache.declarationsFor(a);
    expect(spy).toHaveBeenCalledTimes(3);
    cache.declarationsFor(b);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(cache.size).toBe(2);
  });
});
