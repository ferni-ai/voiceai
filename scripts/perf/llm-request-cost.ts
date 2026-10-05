/**
 * What does one cascade LLM request cost before it leaves the process?
 *
 * Builds the request the Cartesia cascade sends for a representative turn,
 * through the production code: the persona prompt builders the multi-agent
 * setup uses (loadModelBaseInstructions + loadSystemPrompt +
 * composeAgentInstructions), the initial tool set it gives a new agent
 * (handoff tools + essential domains, essential-only policy, capped by
 * resolveInitialToolLimit), and the LLM CartesiaCascadeProvider.createLLMModel
 * returns (HedgedLLM over two Gemini LLMs). Only the network is replaced: the
 * Gemini SDK's streaming call is stubbed to capture the request and answer
 * with one text chunk.
 *
 * Reports, per request: estimated tokens (system prompt / tool schemas /
 * history), tools sent, tool schemas converted to Gemini declarations, CPU
 * for that conversion (median of 50), CPU from chat() to the captured request
 * (median of 50), and how many requests a turn makes when the primary is fast
 * and when it is slow enough to hedge.
 *
 * Token estimate: chars / 4, the estimator prompt-loader.ts uses (the repo has
 * no tokenizer for Gemini). Tool schemas are measured as the JSON of the
 * function declarations actually sent.
 *
 * usage: npx tsx scripts/perf/llm-request-cost.ts [--prompt-mode full|character] [--json]
 *        [--dump <file>]   (writes the captured request)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm } from '@livekit/agents';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (flag('--prompt-mode')) process.env.PROMPT_MODE = flag('--prompt-mode');
const asJson = args.includes('--json');
process.env.GOOGLE_CLOUD_PROJECT ??= 'llm-request-cost-harness';
initializeLogger({ pretty: false, level: 'error' });
const HEDGE_MS = 40;
const RUNS = 50;

// --- Network stub: the Gemini SDK the plugin itself resolves ----------------
const pluginEntry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
const genaiCjs = createRequire(pluginEntry).resolve('@google/genai');
const genai = (await import(pathToFileURL(join(dirname(genaiCjs), 'index.mjs')).href)) as {
  Models: { prototype: Record<string, unknown> };
};
interface CapturedRequest {
  model: string;
  contents: unknown[];
  config: { systemInstruction?: { parts: Array<{ text: string }> }; tools?: unknown[] };
}
const captured: CapturedRequest[] = [];
let firstChunkDelayMs = 0;
genai.Models.prototype.generateContentStreamInternal = async function (params: CapturedRequest) {
  captured.push(params);
  const delay = firstChunkDelayMs;
  return (async function* () {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    yield {
      candidates: [
        { content: { role: 'model', parts: [{ text: 'Sounds good.' }] }, finishReason: 'STOP' },
      ],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 2, totalTokenCount: 2 },
    };
  })();
};

// --- Production builders ----------------------------------------------------
const { loadModelBaseInstructions, loadSystemPrompt } =
  await import('../../src/agents/personas/prompt-loader.js');
const { composeAgentInstructions } =
  await import('../../src/agents/multi-agent/agent-instructions.js');
const { timeContext } = await import('../../src/agents/shared/time-context.js');
const { CartesiaCascadeProvider } =
  await import('../../src/agents/model-provider/cartesia-cascade.js');
const { buildHandoffTools } = await import('../../src/tools/handoff/handoff-factory.js');
const { loadEssentialDomains } = await import('../../src/tools/dynamic-loader/index.js');
const { filterInitialSpawnTools, resolveInitialToolLimit, getInitialToolPolicyFromEnv } =
  await import('../../src/agents/multi-agent/initial-tools.js');
const { capToolsToLimit, getMaxTools } = await import('../../src/config/tool-config.js');

const provider = new CartesiaCascadeProvider();
const [base, persona] = await Promise.all([loadModelBaseInstructions(), loadSystemPrompt('ferni')]);
const instructions = composeAgentInstructions(
  persona,
  base + timeContext(new Date('2026-10-04T15:12:00Z'), 'America/Denver'),
  provider.getPromptModules()
);

/** The initial agent's tools, as agent-setup's loadEssentialToolsFallback + cap build them. */
async function initialTools(): Promise<{
  all: Record<string, unknown>;
  sent: Record<string, unknown>;
}> {
  const handoff = (await buildHandoffTools({ currentAgentId: 'ferni', subscriptionTier: 'free' }))
    .tools;
  const essential = await loadEssentialDomains('llm-request-cost', undefined);
  const all = { ...handoff, ...essential };
  const named = Object.entries(all).map(([name, tool]) => ({ name, tool }));
  const filtered = filterInitialSpawnTools(
    named,
    new Set(Object.keys(essential)),
    new Set(Object.keys(handoff)),
    getInitialToolPolicyFromEnv()
  );
  const record = Object.fromEntries(filtered.map(({ name, tool }) => [name, tool]));
  const limit = resolveInitialToolLimit(getMaxTools());
  const sent = Object.keys(record).length > limit ? capToolsToLimit(record, limit) : record;
  return { all: record, sent };
}

/** A mid-call chat context: the agent's instructions plus eight exchanges. */
function chatContext(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: instructions });
  const turns: Array<[string, string]> = [
    ["hey ferni, it's been a long week", "Oh no, a long one? What's been wearing you down?"],
    [
      'work mostly, my manager keeps moving deadlines',
      'That kind of shifting ground is exhausting. Which deadline is hanging over you now?',
    ],
    [
      'the quarterly report, due friday',
      "Friday's close. Do you want to map out what's left, or just vent for a minute?",
    ],
    ['honestly just vent', "I'm here. Go ahead, I'm listening."],
    [
      'i feel like nothing i do is enough for them',
      "That sounds really discouraging, especially when you're working this hard.",
    ],
    [
      'yeah. anyway can you remind me to call my sister tomorrow',
      "Sure, I'll remind you tomorrow. Anything you want to tell her?",
    ],
    ['just that i miss her', "That's sweet. She'll be glad to hear it."],
    ['what time is it in denver right now', "It's a little after nine in the morning there."],
  ];
  for (const [user, assistant] of turns) {
    ctx.addMessage({ role: 'user', content: user });
    ctx.addMessage({ role: 'assistant', content: assistant });
  }
  ctx.addMessage({ role: 'user', content: 'can you play something calm while i work' });
  return ctx;
}

const pluginUtils = (await import(pathToFileURL(join(dirname(pluginEntry), 'utils.js')).href)) as {
  toFunctionDeclarations: (ctx: llm.ToolContext) => unknown[];
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const tokens = (chars: number) => Math.round(chars / 4);

async function runTurn(model: llm.LLM, toolCtx: llm.ToolContext, delayMs: number) {
  firstChunkDelayMs = delayMs;
  const before = captured.length;
  const stream = model.chat({
    chatCtx: chatContext(),
    toolCtx,
    connOptions: DEFAULT_API_CONNECT_OPTIONS,
  });
  for await (const _chunk of stream) {
    // drain
  }
  return captured.slice(before);
}

const declarationArraysSeen = new WeakSet<object>();
/** Declarations converted for this request: 0 when the array was sent before (reused). */
function conversionsIn(req: CapturedRequest): number {
  const decls = (req.config.tools?.[0] as { functionDeclarations?: unknown[] } | undefined)
    ?.functionDeclarations;
  if (!decls) return 0;
  if (declarationArraysSeen.has(decls)) return 0;
  declarationArraysSeen.add(decls);
  return decls.length;
}

function breakdown(req: CapturedRequest) {
  const system = (req.config.systemInstruction?.parts ?? []).map((p) => p.text).join('');
  const toolsJson = JSON.stringify(req.config.tools ?? []);
  const history = JSON.stringify(req.contents);
  const decls = (req.config.tools?.[0] as { functionDeclarations?: unknown[] } | undefined)
    ?.functionDeclarations;
  return {
    systemTokens: tokens(system.length),
    toolSchemaTokens: tokens(toolsJson.length),
    historyTokens: tokens(history.length),
    totalTokens: tokens(system.length + toolsJson.length + history.length),
    toolsSent: decls?.length ?? 0,
  };
}

const { all, sent } = await initialTools();
const toolCtx = new llm.ToolContext(sent as never);
const fullCtx = new llm.ToolContext(all as never);
process.env.CASCADE_LLM_HEDGE_MS = String(HEDGE_MS);
const model = (await provider.createLLMModel({ temperature: 0.8 } as never)) as llm.LLM;

// Warm up module/JIT paths before timing.
for (let i = 0; i < 5; i++) await runTurn(model, toolCtx, 0);

const fast = await runTurn(model, toolCtx, 0);
const slow = await runTurn(model, toolCtx, HEDGE_MS * 5);
const convertMs: number[] = [];
const convertFullMs: number[] = [];
const requestMs: number[] = [];
const conversionsPerRequest: number[] = [];
for (let i = 0; i < RUNS; i++) {
  let t = performance.now();
  pluginUtils.toFunctionDeclarations(toolCtx);
  convertMs.push(performance.now() - t);
  t = performance.now();
  pluginUtils.toFunctionDeclarations(fullCtx);
  convertFullMs.push(performance.now() - t);
  firstChunkDelayMs = 0;
  const before = captured.length;
  const chatCtx = chatContext();
  t = performance.now();
  const stream = model.chat({ chatCtx, toolCtx, connOptions: DEFAULT_API_CONNECT_OPTIONS });
  while (captured.length === before) await new Promise((r) => setImmediate(r));
  requestMs.push(performance.now() - t);
  for await (const _chunk of stream) {
    // drain
  }
  conversionsPerRequest.push(conversionsIn(captured[captured.length - 1]));
}

const report = {
  promptMode: process.env.PROMPT_MODE ?? 'full (default)',
  model: fast[0]?.model,
  request: breakdown(fast[0]),
  tools: {
    sentPerRequest: Object.keys(sent).length,
    initialSetBeforeCap: Object.keys(all).length,
    cap: resolveInitialToolLimit(getMaxTools()),
    fullSetSchemaTokens: tokens(JSON.stringify(pluginUtils.toFunctionDeclarations(fullCtx)).length),
    largest: (pluginUtils.toFunctionDeclarations(toolCtx) as Array<{ name: string }>)
      .map((d) => ({ name: d.name, tokens: tokens(JSON.stringify(d).length) }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5),
  },
  conversion: {
    declarationsConvertedPerRequestMedian: median(conversionsPerRequest),
    convertMsMedian: Number(median(convertMs).toFixed(3)),
    convertFullSetMsMedian: Number(median(convertFullMs).toFixed(3)),
    chatToRequestMsMedian: Number(median(requestMs).toFixed(3)),
  },
  hedge: {
    hedgeAfterMs: HEDGE_MS,
    fastPrimaryRequests: fast.length,
    slowPrimaryRequests: slow.length,
    slowRequestsModels: slow.map((r) => r.model),
    slowRequestsSameSystemPrompt:
      slow.length === 2 &&
      JSON.stringify(slow[0].config.systemInstruction) ===
        JSON.stringify(slow[1].config.systemInstruction),
    slowRequestsToolCounts: slow.map((r) => breakdown(r).toolsSent),
    slowDeclarationsConverted: slow.map((r) => conversionsIn(r)),
  },
};

if (flag('--dump')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(String(flag('--dump')), JSON.stringify(fast[0], null, 1));
}
if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  const r = report;
  process.stdout.write(
    [
      `prompt mode ${r.promptMode}, model ${r.model}`,
      `tokens/request (chars/4): system ${r.request.systemTokens}, tool schemas ${r.request.toolSchemaTokens}, history ${r.request.historyTokens}, total ${r.request.totalTokens}`,
      `tools sent ${r.tools.sentPerRequest} (initial set ${r.tools.initialSetBeforeCap} before cap ${r.tools.cap}; uncapped schemas ${r.tools.fullSetSchemaTokens} tokens)`,
      `largest declarations: ${r.tools.largest.map((d) => `${d.name} ${d.tokens}`).join(', ')}`,
      `declarations converted per request (median of ${RUNS}): ${r.conversion.declarationsConvertedPerRequestMedian}`,
      `toFunctionDeclarations CPU median: ${r.conversion.convertMsMedian} ms (sent set), ${r.conversion.convertFullSetMsMedian} ms (uncapped set)`,
      `chat() -> request captured, median: ${r.conversion.chatToRequestMsMedian} ms`,
      `hedge after ${r.hedge.hedgeAfterMs} ms: fast primary -> ${r.hedge.fastPrimaryRequests} request(s); slow primary -> ${r.hedge.slowPrimaryRequests} (${r.hedge.slowRequestsModels.join(', ')}), same system prompt ${r.hedge.slowRequestsSameSystemPrompt}, tools ${r.hedge.slowRequestsToolCounts.join('/')}, declarations converted ${r.hedge.slowDeclarationsConverted.join('/')}`,
    ].join('\n') + '\n'
  );
}
process.exit(0);
