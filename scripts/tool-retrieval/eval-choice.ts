/**
 * Tool-choice accuracy: does the production model call the right tool when it
 * gets the tool set a live turn would send?
 *
 * For each spoken test request (fixtures/choice-test-v1.json, never indexed), build
 * the live turn's tool set (core + per-turn retrieval, src/tools/retrieval),
 * send it to the production model with Ferni's character prompt, and record
 * the tool it calls. When it calls findTools, run the lookup and the model's
 * second step, as the live agent would. Recall numbers (RESULTS.md) say
 * whether the right tool was *sent*; this says whether it was *called*.
 *
 * TOOL_SET picks the request's tools: retrieval (default, the above); today
 * (what a live call sends now: the first agent's 64 essentials, then the
 * post-greeting update to 88, both through the production cap code); core
 * (TOOL_CORE_STATIC: the static core, findTools searching the whole catalog
 * and appending what it finds, as the pinner does). EVAL_LABELS=head keeps
 * only requests for the 20 tools prod and dev calls used (2026-10-04..11).
 *
 * usage: [TOOL_SET=today|core] npx tsx scripts/tool-retrieval/eval-choice.ts <n> [seed] [label]
 * Writes scripts/tool-retrieval/out/choice-<label>.json and prints a summary.
 * Score 2+ seeds (the same seeds for both builds) with choice-score.mjs: pooled rate, floor,
 * paired diff. Its --out file, saved as <night>/tool-choice.json, is the nightly scorecard's
 * tool-choice capability.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
import { cascadeThinking } from '../../src/agents/model-provider/cartesia-cascade.js';
import { capToolsToLimit, getEssentialTools } from '../../src/config/tool-config.js';
import { DEFAULT_ESSENTIAL_DOMAINS } from '../../src/tools/dynamic-loader/index.js';
import { updateAgentTools } from '../../src/agents/shared/tool-updater.js';
import { staticCoreCallTools } from '../../src/agents/shared/static-core-tools.js';
import { loadTestSet } from './test-set.mjs';

const [nArg, seedArg, label = 'live'] = process.argv.slice(2);
const n = Number(nArg || 100);
const seed = Number(seedArg || 1);
const MODEL = process.env.CASCADE_LLM_MODEL || 'gemini-3.5-flash';
const TOOL_SETS = ['retrieval', 'today', 'core'] as const;
const TOOL_SET = (process.env.TOOL_SET || 'retrieval') as (typeof TOOL_SETS)[number];
if (!TOOL_SETS.includes(TOOL_SET))
  throw new Error(`TOOL_SET must be one of ${TOOL_SETS.join(', ')}`);
const CONCURRENCY = 6;
const MAX_STEPS = 3;
/** Look-up tools the model often calls before acting, with a plausible answer. */
const LOOKUPS: Record<string, string> = {
  getCurrentContext:
    'It is Wednesday, September 30, 2026, 3:12 pm in Denver, Colorado. Weather: 64F, clear.',
  recallFromMemory: 'No stored memories match that.',
  [FIND_TOOLS]: '',
};

// The plugin's own conversion, so declarations match what a live call sends.
const pluginDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents-plugin-google'));
const { toFunctionDeclarations } = (await import(
  pathToFileURL(join(pluginDist, 'utils.js')).href
)) as {
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
} as unknown as Record<string, llm.AnonFunctionTool>);

// The tool set a live turn sends without retrieval (TOOL_SET today|core): the
// same for every request, built with the production code.
const asTools = (r: Record<string, unknown>) =>
  r as unknown as Record<string, llm.AnonFunctionTool>;
async function fixedSet(): Promise<llm.ToolContext | null> {
  if (TOOL_SET === 'retrieval') return null;
  const essentialDomains = DEFAULT_ESSENTIAL_DOMAINS as ToolDomain[];
  if (TOOL_SET === 'core') {
    const core = await staticCoreCallTools(built.tools, 'eval', undefined, {
      id: 'ferni',
      name: 'Ferni',
    });
    return new llm.ToolContext(asTools(core));
  }
  // today: the first agent's capped essentials, then the post-greeting update.
  const essentials = toolRegistry.buildToolSet({ domains: essentialDomains }, ctx).tools;
  const loaderNow = toolRegistry.buildToolSet(
    { domains: essentialDomains, optional: [...getEssentialTools()] },
    ctx
  ).tools;
  let current: Record<string, unknown> = capToolsToLimit(essentials, 64);
  const agent = {
    get toolCtx() {
      return { functionTools: current };
    },
    async updateTools(tools: Record<string, unknown>) {
      current = tools;
    },
  };
  await updateAgentTools(agent as never, loaderNow);
  return new llm.ToolContext(asTools(current));
}
const fixed = await fixedSet();
/** The tools prod and dev calls used, 2026-10-04..11 (tool-surface.md). */
const HEAD = new Set([
  'quickTimer',
  'getFunFact',
  'setTimer',
  'playMusic',
  'setReminder',
  'tellJoke',
  'rememberAboutUser',
  'getWeatherForecast',
  'prepareForDifficultConversation',
  'askForTeammate',
  'handoffToPeter',
  'getWeather',
  'callOnBehalf',
  'handoffToMaya',
  'musicControl',
  'quickWeather',
  'searchWeb',
  'getTodaySignificance',
  'connectToHumanExpert',
  'addRelationship',
]);

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

// The frozen, reviewed test set (test-set.mjs): the same 2,375 rows as the out/generated-test.json
// behind the September runs, in the same order, so seeds draw the same requests.
// Deterministic sample.
const all = (loadTestSet() as Array<{ query: string; tool: string }>).filter(
  (item) => process.env.EVAL_LABELS !== 'head' || HEAD.has(item.tool)
);
let s = seed;
const rand = (): number => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
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
  /** findTools: its lookup, and the model step after it (the extra step's cost). */
  findMs?: number;
  afterFindMs?: number;
  /** A different tool than the label that does the user's job about as well (judged). */
  sufficient?: boolean;
  /** The judge failed, so sufficient is false: an unjudged miss still counts as a miss. */
  judgeError?: boolean;
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
    model: process.env.CHOICE_JUDGE_MODEL || 'gemini-3.5-flash',
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
      // The agent's own setting: a 2.x model rejects MINIMAL, so every 2.x row errored.
      thinkingConfig: cascadeThinking(MODEL) as never,
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
    const pick = fixed ? null : await retrieval.pick(item.query);
    const sent = fixed ?? (pick ? retrieval.select(catalog, pick) : retrieval.withoutPick(catalog));
    row.sent = Object.keys(sent.functionTools).length;
    row.labelSent = item.tool in sent.functionTools;
    const contents: Content[] = [{ role: 'user', parts: [{ text: item.query }] }];
    // Follow the model's steps like the agent does: lookups (context, memory,
    // findTools) get a plausible answer and the model goes on; the first
    // action it takes is its choice. Up to MAX_STEPS model calls.
    let tools = sent;
    let findDone = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      const stepStarted = Date.now();
      const r = await ask(contents, tools);
      if (findDone && row.afterFindMs === undefined) row.afterFindMs = Date.now() - stepStarted;
      if (step === 0) row.promptTokens = r.usageMetadata?.promptTokenCount ?? 0;
      const call = r.functionCalls?.[0];
      if (step === 0) row.first = call?.name ?? null;
      row.final = call?.name ?? null;
      if (!call?.name || !(call.name in LOOKUPS)) break;
      let output = LOOKUPS[call.name];
      if (call.name === FIND_TOOLS) {
        row.usedFind = true;
        const need = String((call.args as { need?: string })?.need ?? item.query);
        const findStarted = Date.now();
        if (TOOL_SET === 'core') {
          // The pinner: what it finds is appended to the call's set.
          const found = (await retrieval.find(need, 5, { anyTool: true })).filter(
            (f) => f.name in catalog.functionTools
          );
          const added = found.filter((f) => !(f.name in tools.functionTools));
          tools = new llm.ToolContext([
            ...Object.values(tools.functionTools),
            ...added.map((f) => catalog.functionTools[f.name]),
          ]);
          output = found.length
            ? `These tools are now available; call the one that fits: ${found.map((f) => f.name).join('; ')}`
            : "No tool matches that. Tell the user plainly that you can't do it yet.";
        } else {
          const found = await retrieval.find(need);
          output = found.length
            ? `These tools are now available; call the one that fits: ${found.map((f) => f.name).join('; ')}`
            : "No tool matches that. Tell the user plainly that you can't do it yet.";
          tools =
            fixed ?? (pick ? retrieval.select(catalog, pick) : retrieval.withoutPick(catalog));
        }
        row.findMs = Date.now() - findStarted;
        findDone = step + 1;
      }
      contents.push(
        // The model's own turn: gemini-3.5 rejects a function call without its thought signature.
        r.candidates?.[0]?.content ?? { role: 'model', parts: [{ functionCall: call }] },
        { role: 'user', parts: [{ functionResponse: { name: call.name, response: { output } } }] }
      );
    }
    if (row.final && row.final !== item.tool && row.final !== FIND_TOOLS) {
      // The choice is already known to be a miss; a judge failure (429, bad JSON) must not turn it
      // into an errored row, which choice-score drops: only misses would vanish and the rate rise.
      row.sufficient = await judge(item.query, item.tool, row.final).catch(() => {
        row.judgeError = true;
        return false;
      });
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
mkdirSync('scripts/tool-retrieval/out', { recursive: true });
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
      // Misses the judge couldn't rule on, scored as misses: a broken judge shows here.
      judgeErrors: ok.filter((r) => r.judgeError).length,
      labelSent: pct(ok.filter((r) => r.labelSent).length),
      calledLabel: pct(ok.filter((r) => r.final === r.label).length),
      calledLabelOrEquivalent: pct(ok.filter((r) => r.final === r.label || r.sufficient).length),
      calledOther: pct(ok.filter((r) => r.final && r.final !== r.label).length),
      noCall: pct(ok.filter((r) => !r.final).length),
      usedFind: pct(ok.filter((r) => r.usedFind).length),
      findRescued: ok.filter((r) => r.usedFind && r.final === r.label).length,
      toolsSentMedian: med(ok.map((r) => r.sent)),
      promptTokensMedian: med(ok.map((r) => r.promptTokens)),
      toolSet: TOOL_SET,
      findMsMedian: med(ok.flatMap((r) => (r.findMs === undefined ? [] : [r.findMs]))),
      afterFindStepMsMedian: med(
        ok.flatMap((r) => (r.afterFindMs === undefined ? [] : [r.afterFindMs]))
      ),
    },
    null,
    1
  )
);
process.exit(0);
