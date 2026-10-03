/**
 * Does a stable tool list make the first token faster (Vertex prefix cache)?
 * Sends the same user turn with (a) the same tool set every time and (b) a
 * different tool set every time, streaming, and reports time to first chunk
 * and the cached-token count Vertex reports.
 *
 * usage: npx tsx scripts/tool-retrieval/cache-probe.ts [reps] [tools]
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { llm } from '@livekit/agents';
import { autoRegisterAllDomains, initializeToolRegistry } from '../../src/tools/registry/loader.js';
import { toolRegistry } from '../../src/tools/registry/index.js';
import type { ToolContext, ToolDomain } from '../../src/tools/registry/types.js';
import { ALL_TOOL_DOMAINS } from '../../src/tools/registry/types.js';
import { loadSystemPrompt } from '../../src/agents/personas/prompt-loader.js';

const reps = Number(process.argv[2] || 8);
const size = Number(process.argv[3] || 60);
const pluginDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents-plugin-google'));
const { toFunctionDeclarations } = (await import(pathToFileURL(join(pluginDist, 'utils.js')).href)) as {
  toFunctionDeclarations: (ctx: llm.ToolContext) => object[];
};
await autoRegisterAllDomains();
await initializeToolRegistry({ lazyLoading: false });
const ctx = { userId: 'p', agentId: 'ferni', agentDisplayName: 'Ferni', services: { has: () => true, get: () => undefined } } as unknown as ToolContext;
const all = Object.entries(toolRegistry.buildToolSet({ domains: [...ALL_TOOL_DOMAINS] as ToolDomain[] }, ctx).tools) as Array<[string, llm.FunctionTool]>;
process.env.PROMPT_MODE ??= 'character';
const system = await loadSystemPrompt('ferni');
const genai = new GoogleGenAI({ vertexai: true, project: 'johnb-2025', location: 'global' });
const setOf = (offset: number) => new llm.ToolContext(Object.fromEntries(all.slice(offset, offset + size)));

async function ttft(tools: llm.ToolContext, text: string) {
  const started = Date.now();
  let first = 0;
  let cached = 0;
  let prompt = 0;
  const stream = await genai.models.generateContentStream({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations: toFunctionDeclarations(tools) as never }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
  for await (const chunk of stream) {
    if (!first) first = Date.now() - started;
    cached = chunk.usageMetadata?.cachedContentTokenCount ?? cached;
    prompt = chunk.usageMetadata?.promptTokenCount ?? prompt;
  }
  return { first, cached, prompt };
}

const lines = ['Tell me something good about today.', 'I had a long day at work.', 'What should I cook tonight?', "I'm thinking about calling my mom."];
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const result: Record<string, { ttft: number[]; cached: number[]; prompt: number[] }> = { stable: { ttft: [], cached: [], prompt: [] }, changing: { ttft: [], cached: [], prompt: [] } };
const stable = setOf(0);
for (let i = 0; i < reps; i++) {
  // Interleave so network drift hits both arms alike.
  const a = await ttft(stable, lines[i % lines.length]);
  const b = await ttft(setOf(60 + i * size), lines[i % lines.length]);
  for (const [k, r] of [['stable', a], ['changing', b]] as const) {
    result[k].ttft.push(r.first); result[k].cached.push(r.cached); result[k].prompt.push(r.prompt);
  }
}
for (const [k, r] of Object.entries(result)) {
  console.log(k, JSON.stringify({ ttftP50: med(r.ttft), ttft: r.ttft, cachedP50: med(r.cached), promptP50: med(r.prompt) }));
}
process.exit(0);
