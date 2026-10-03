/**
 * Tool-choice accuracy: does the production model call the right tool when it
 * gets the tool set a live turn would send?
 *
 * For each spoken test request (out/generated-test.json, never indexed), build
 * the live turn's tool set (core + per-turn retrieval, src/tools/retrieval),
 * send it to the production model with Ferni's character prompt, and record
 * the tool it calls. When it calls findTools, run the lookup and the model's
 * second step, as the live agent would. Recall numbers (RESULTS.md) say
 * whether the right tool was *sent*; this says whether it was *called*.
 *
 * usage: npx tsx scripts/tool-retrieval/eval-choice.ts <n> [seed] [label]
 * Writes scripts/tool-retrieval/out/choice-<label>.json and prints a summary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleGenAI, ThinkingLevel, type Content } from '@google/genai';
import { llm } from '@livekit/agents';
import { autoRegisterAllDomains, initializeToolRegistry } from '../../src/tools/registry/loader.js';
import { toolRegistry } from '../../src/tools/registry/index.js';
import type { ToolContext, ToolDomain } from '../../src/tools/registry/types.js';
import { ALL_TOOL_DOMAINS } from '../../src/tools/registry/types.js';
import {
  createVertexEmbedder,
  getSharedToolIndex,
  loadIntentManual,
} from '../../src/tools/retrieval/dense-index.js';
import { TurnToolRetrieval } from '../../src/tools/retrieval/turn-tool-retrieval.js';
import { createFindToolsTool, FIND_TOOLS } from '../../src/tools/retrieval/find-tools-tool.js';
import { loadSystemPrompt } from '../../src/agents/personas/prompt-loader.js';

const [nArg, seedArg, label = 'live'] = process.argv.slice(2);
const n = Number(nArg || 100);
const seed = Number(seedArg || 1);
const MODEL = process.env.CASCADE_LLM_MODEL || 'gemini-3.5-flash';
const CONCURRENCY = 6;
const MAX_STEPS = 3;
/** Look-up tools the model often calls before acting, with a plausible answer. */
const LOOKUPS: Record<string, string> = {
  getCurrentContext: 'It is Wednesday, September 30, 2026, 3:12 pm in Denver, Colorado. Weather: 64F, clear.',
  recallFromMemory: 'No stored memories match that.',
  [FIND_TOOLS]: '',
};

// The plugin's own conversion, so declarations match what a live call sends.
const pluginDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents-plugin-google'));
const { toFunctionDeclarations } = (await import(pathToFileURL(join(pluginDist, 'utils.js')).href)) as {
  toFunctionDeclarations: (ctx: llm.ToolContext) => object[];
};

// Every tool, as the whole-catalog session loads them. Nothing here executes a
// tool except findTools, which only searches the index.
await autoRegisterAllDomains();
await initializeToolRegistry({ lazyLoading: false });
const ctx = {
  userId: 'eval',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => true, get: () => undefined },
} as unknown as ToolContext;
const built = toolRegistry.buildToolSet({ domains: [...ALL_TOOL_DOMAINS] as ToolDomain[] }, ctx);
const catalog = new llm.ToolContext({
  ...(built.tools as Record<string, llm.FunctionTool>),
  [FIND_TOOLS]: createFindToolsTool() as unknown as llm.FunctionTool,
});

process.env.PROMPT_MODE ??= 'character';
const system = await loadSystemPrompt('ferni');
const embedder = createVertexEmbedder();
const index = await getSharedToolIndex(embedder);
const manual = loadIntentManual();
const genai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
  location: 'global',
});

// Deterministic sample.
const all = JSON.parse(
  readFileSync('scripts/tool-retrieval/out/generated-test.json', 'utf8')
) as Array<{ query: string; tool: string }>;
let s = seed;
const rand = (): number => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = [...all].sort(() => rand() - 0.5).slice(0, n);

interface Row {
  query: string;
  label: string;
  first: string | null;
  final: string | null;
  usedFind: boolean;
  sent: number;
  labelSent: boolean;
  promptTokens: number;
  ms: number;
  /** A different tool than the label that does the user's job about as well (judged). */
  sufficient?: boolean;
  error?: string;
}

const describe = (name: string): string =>
  (catalog.functionTools[name]?.description ?? '').slice(0, 220);

/** Same strict judge as judge-misses.ts, for the one tool the model called. */
async function judge(query: string, gold: string, got: string): Promise<boolean> {
  const prompt = `A user said to a voice assistant: "${query}"
The intended tool was ${gold}: ${describe(gold)}
The assistant called ${got}: ${describe(got)}
Would ${got} serve this user's request about as well as the intended tool? Be strict: a loosely related tool does not count. Answer JSON {"verdict":"yes"|"no"}`;
  const r = await genai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return (JSON.parse(r.text ?? '{}') as { verdict?: string }).verdict === 'yes';
}

async function ask(contents: Content[], tools: llm.ToolContext) {
  return genai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations: toFunctionDeclarations(tools) as never }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });
}

async function run(item: { query: string; tool: string }): Promise<Row> {
  const retrieval = new TurnToolRetrieval({
    sessionId: 'eval',
    embedder,
    index: async () => index,
    domainOf: (tool) => manual.tools[tool]?.domain,
  });
  const started = Date.now();
  const row: Row = {
    query: item.query,
    label: item.tool,
    first: null,
    final: null,
    usedFind: false,
    sent: 0,
    labelSent: false,
    promptTokens: 0,
    ms: 0,
  };
  try {
    const pick = await retrieval.pick(item.query);
    const sent = pick ? retrieval.select(catalog, pick) : retrieval.withoutPick(catalog);
    row.sent = Object.keys(sent.functionTools).length;
    row.labelSent = item.tool in sent.functionTools;
    const contents: Content[] = [{ role: 'user', parts: [{ text: item.query }] }];
    // Follow the model's steps like the agent does: lookups (context, memory,
    // findTools) get a plausible answer and the model goes on; the first
    // action it takes is its choice. Up to MAX_STEPS model calls.
    let tools = sent;
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await ask(contents, tools);
      if (step === 0) row.promptTokens = r.usageMetadata?.promptTokenCount ?? 0;
      const call = r.functionCalls?.[0];
      if (step === 0) row.first = call?.name ?? null;
      row.final = call?.name ?? null;
      if (!call?.name || !(call.name in LOOKUPS)) break;
      let output = LOOKUPS[call.name];
      if (call.name === FIND_TOOLS) {
        row.usedFind = true;
        const need = String((call.args as { need?: string })?.need ?? item.query);
        const found = await retrieval.find(need);
        output = found.length
          ? `These tools are now available; call the one that fits: ${found.map((f) => f.name).join('; ')}`
          : "No tool matches that. Tell the user plainly that you can't do it yet.";
        tools = pick ? retrieval.select(catalog, pick) : retrieval.withoutPick(catalog);
      }
      contents.push(
        { role: 'model', parts: [{ functionCall: call }] },
        { role: 'user', parts: [{ functionResponse: { name: call.name, response: { output } } }] }
      );
    }
    if (row.final && row.final !== item.tool && row.final !== FIND_TOOLS) {
      row.sufficient = await judge(item.query, item.tool, row.final);
    }
  } catch (error) {
    row.error = String(error).slice(0, 200);
  }
  row.ms = Date.now() - started;
  return row;
}

const rows: Row[] = [];
for (let i = 0; i < sample.length; i += CONCURRENCY) {
  rows.push(...(await Promise.all(sample.slice(i, i + CONCURRENCY).map(run))));
  process.stderr.write(`\r${rows.length}/${sample.length}`);
}
process.stderr.write('\n');
writeFileSync(`scripts/tool-retrieval/out/choice-${label}.json`, JSON.stringify(rows, null, 1));

const ok = rows.filter((r) => !r.error);
const pct = (k: number): string => `${((100 * k) / Math.max(1, ok.length)).toFixed(1)}%`;
const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
console.log(
  JSON.stringify(
    {
      label,
      model: MODEL,
      n: ok.length,
      errors: rows.length - ok.length,
      labelSent: pct(ok.filter((r) => r.labelSent).length),
      calledLabel: pct(ok.filter((r) => r.final === r.label).length),
      calledLabelOrEquivalent: pct(ok.filter((r) => r.final === r.label || r.sufficient).length),
      calledOther: pct(ok.filter((r) => r.final && r.final !== r.label).length),
      noCall: pct(ok.filter((r) => !r.final).length),
      usedFind: pct(ok.filter((r) => r.usedFind).length),
      findRescued: ok.filter((r) => r.usedFind && r.final === r.label).length,
      toolsSentMedian: med(ok.map((r) => r.sent)),
      promptTokensMedian: med(ok.map((r) => r.promptTokens)),
    },
    null,
    1
  )
);
process.exit(0);
