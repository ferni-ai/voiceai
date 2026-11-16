/**
 * Where does Ferni's reply wait go? An offline bench for the cascade's reply
 * path, from a committed caller turn to first audio. It replays real turn
 * contexts (each caller turn of recorded dev calls, scripts/voice-eval/out)
 * through the production path: the multi-agent system prompt (PROMPT_MODE=
 * character, as on dev) and initial tools; withTurnReminder + toolsForTurn
 * (turn-request.ts); the LLM CartesiaCascadeProvider.createLLMModel returns
 * (fast lane, hedges) against real Vertex; and the TTS gateway node against
 * real Cartesia, fed the model's text as it streams.
 *
 * Per turn: request build ms, prompt/cached tokens, Vertex TTFT (chat() to
 * first text), first text pushed to Cartesia, first audio, new connections.
 * Times run from chat(); the TTS node starts then too, as LiveKit starts it.
 * Arms run round-robin over the same turns (paired), each with its own HTTP
 * pool, and --gap ms passes between an arm's requests as on a call, so idle
 * sockets close as they would live. Not replayed: turn-context notes, recall,
 * director's notes; absolute numbers run a little short of live.
 *
 * Arms (--arms; the first is the baseline): base = dev today (Node's 4 s
 * keep-alive); warm = Vertex sockets kept 30 s (VERTEX_KEEPALIVE=on); main =
 * every turn on gemini-3.5-flash (fast lane off), for reference.
 *
 * Summary values are [estimate, 95% low, 95% high].
 *
 * Results 2026-10-11 (this Mac, fast-lane turns, paired by turn, 95% bootstrap):
 *   warm vs base (n=40): time to first text -146 ms [-182, -126], first audio
 *     -145 [-186, -118]; base opened a new connection on 39 of 40 turns.
 *   core tools only on the fast lane (~11.1k -> ~7.1k prompt tokens), on warm
 *     sockets (n=40): -26 ms [-61, +18], first audio -6 [-52, +16]. Not a win.
 *   explicit Vertex context cache for system prompt + tools (n=14): -24 ms
 *     [-42, +53]. Not a win: implicit caching already hits ~10.4k of ~11.1k.
 *   Request build (withTurnReminder + toolsForTurn) is under 1 ms; Gemini's
 *   first chunk is 1-9 characters and the next lands ~70 ms later; Cartesia's
 *   first audio follows the first push by ~120 ms.
 *
 * usage: GOOGLE_CLOUD_PROJECT=<p> CARTESIA_API_KEY=<k> npx tsx scripts/perf/reply-latency-bench.ts \
 *          [--arms base,warm] [--n 36] [--gap 9000] [--no-tts] [--out file.json] [eval.json ...]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { TransformStream } from 'node:stream/web';
import { parseArgs } from 'node:util';
import { initializeLogger, llm } from '@livekit/agents';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    arms: { type: 'string', default: 'base,warm' },
    n: { type: 'string', default: '36' },
    gap: { type: 'string', default: '9000' },
    'no-tts': { type: 'boolean', default: false },
    out: { type: 'string' },
    seed: { type: 'string', default: '1' },
  },
});
if (!process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const withTts = !values['no-tts'] && !!process.env.CARTESIA_API_KEY;
const N = Number(values.n);
const GAP_MS = Number(values.gap);
const ARMS = String(values.arms).split(',').filter(Boolean);

// Dev's flags for the reply path (dev-autoswitch + agent secrets, 2026-10-11).
Object.assign(process.env, {
  PROMPT_MODE: 'character',
  CASCADE_FAST_LANE: 'on',
  PROMPT_STABLE_PREFIX: 'on',
  CASCADE_APPEND_ONLY_TOOLS: 'on',
  CASCADE_TRIM_LEAD_SILENCE: 'on',
  TOOL_RETRIEVAL: 'off',
});
initializeLogger({ pretty: false, level: 'error' });

// --- HTTP pools: one per arm, so keep-alive is per arm -----------------------
const genaiDir = createRequire(
  createRequire(import.meta.url).resolve('@livekit/agents-plugin-google')
).resolve('@google/genai');
const undici = createRequire(genaiDir)('undici') as typeof import('undici');
let connections = 0;
const connect = undici.buildConnector({});
const pool = (keepAliveTimeout: number) =>
  new undici.Agent({
    keepAliveTimeout,
    keepAliveMaxTimeout: keepAliveTimeout,
    connect: (o, cb) => (connections++, connect(o, cb)),
  });

// --- Production builders -------------------------------------------------------
const { loadModelBaseInstructions, loadSystemPrompt } =
  await import('../../src/agents/personas/prompt-loader.js');
const { composeAgentInstructions } =
  await import('../../src/agents/multi-agent/agent-instructions.js');
const { timeContext } = await import('../../src/agents/shared/time-context.js');
const { CartesiaCascadeProvider } =
  await import('../../src/agents/model-provider/cartesia-cascade.js');
const { callerTurn, laneReason } = await import('../../src/agents/model-provider/fast-lane.js');
const { buildHandoffTools } = await import('../../src/tools/handoff/handoff-factory.js');
const { loadEssentialDomains } = await import('../../src/tools/dynamic-loader/index.js');
const { filterInitialSpawnTools, getInitialToolPolicyFromEnv } =
  await import('../../src/agents/multi-agent/initial-tools.js');
const { capToolsToLimit } = await import('../../src/config/tool-config.js');
const { withTurnReminder, toolsForTurn } =
  await import('../../src/agents/personas/turn-request.js');
const { createGatewayTTSNode } = await import('../../src/speech/tts-gateway/gateway-tts-node.js');
const { getTTSProvider } = await import('../../src/speech/tts-gateway/providers/index.js');
const { getVoiceIdForPersona } = await import('../../src/config/voice-ids.js');

const provider = new CartesiaCascadeProvider();
const [base, persona] = await Promise.all([loadModelBaseInstructions(), loadSystemPrompt('ferni')]);
const instructions = composeAgentInstructions(
  persona,
  base + timeContext(new Date('2026-10-11T18:30:00Z'), 'America/Denver'),
  provider.getPromptModules()
);

async function initialTools(limit: number): Promise<llm.ToolContext> {
  const handoff = (await buildHandoffTools({ currentAgentId: 'ferni', subscriptionTier: 'free' }))
    .tools;
  const essential = await loadEssentialDomains('reply-latency-bench', undefined);
  const all = { ...handoff, ...essential };
  const filtered = filterInitialSpawnTools(
    Object.entries(all).map(([name, tool]) => ({ name, tool })),
    new Set(Object.keys(essential)),
    new Set(Object.keys(handoff)),
    getInitialToolPolicyFromEnv()
  );
  const record = Object.fromEntries(filtered.map(({ name, tool }) => [name, tool]));
  const sent = Object.keys(record).length > limit ? capToolsToLimit(record, limit) : record;
  return new llm.ToolContext(sent as never);
}
const agentTools = await initialTools(90); // dev offered 83-114, mostly 90 (TURN_RECEIPT)

// --- Turn contexts from recorded dev calls -------------------------------------
type Turn = { who: 'agent' | 'user'; text: string };
type Run = { userSpeech?: number[][]; events?: Array<{ t: number; who: string; text: string }> };

/** Caller partials merged into their final text; agent pieces joined (as replay.ts). */
function turnsOf(run: Run): Turn[] {
  const turns: Turn[] = [];
  for (const e of run.events ?? []) {
    const who = e.who === 'agent' ? 'agent' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.who === who) last.text = who === 'user' ? e.text : `${last.text} ${e.text}`;
    else turns.push({ who, text: e.text });
  }
  return turns;
}

function evalFiles(): string[] {
  if (positionals.length) return positionals;
  const dirs = ['scripts/voice-eval/out', join(homedir(), 'Documents/voiceai-evidence/eval-out')];
  const list = (d: string) => (existsSync(d) ? readdirSync(d).map((f) => join(d, f)) : []);
  return dirs.flatMap(list).filter((f) => f.endsWith('.json') && !f.endsWith('.score.json'));
}

const moments = new Map<string, Turn[]>(); // keyed by the whole history: each once
for (const f of evalFiles()) {
  let turns: Turn[] = [];
  try {
    turns = turnsOf(JSON.parse(readFileSync(f, 'utf8')) as Run);
  } catch {
    // not a recording
  }
  turns.forEach((t, i) => {
    const history = turns.slice(0, i + 1);
    if (t.who === 'user' && t.text.trim()) moments.set(JSON.stringify(history), history);
  });
}
// A deterministic shuffle, so --n picks a mix of calls and turn positions.
let s = Number(values.seed);
const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const picked = [...moments.values()].sort(() => rand() - 0.5).slice(0, N);
if (picked.length < N) console.error(`only ${picked.length} distinct turns found`);

function chatContextFor(history: Turn[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: instructions });
  for (const t of history) {
    ctx.addMessage({ role: t.who === 'agent' ? 'assistant' : 'user', content: t.text });
  }
  return ctx;
}

// --- Arms ------------------------------------------------------------------------
interface Arm {
  name: string;
  keepAliveMs: number;
  env?: Record<string, string>;
}
const ARM_DEFS: Record<string, Arm> = {
  base: { name: 'base', keepAliveMs: 4_000 },
  warm: { name: 'warm', keepAliveMs: 30_000 },
  main: { name: 'main', keepAliveMs: 4_000, env: { CASCADE_FAST_LANE: 'off' } },
};

/** An arm's LLM, built with its env, and its own connection pool. */
async function build(arm: Arm) {
  const saved = { ...process.env };
  Object.assign(process.env, arm.env ?? {});
  try {
    const model = (await provider.createLLMModel({ temperature: 0.8 } as never)) as llm.LLM;
    return { arm, model, pool: pool(arm.keepAliveMs) };
  } finally {
    process.env = saved;
  }
}
type Built = Awaited<ReturnType<typeof build>>;

// --- One turn ----------------------------------------------------------------------
interface Sample {
  arm: string;
  moment: number;
  lane: string;
  buildMs: number;
  toolsSent: number;
  promptTokens: number | null;
  cachedTokens: number | null;
  ttftMs: number | null;
  firstPushMs: number | null;
  firstAudioMs: number | null;
  newConnections: number;
  /** The first text chunks: ms from chat() and characters. */
  chunks: Array<[number, number]>;
  reply: string;
  error?: string;
}

const voiceId = getVoiceIdForPersona('ferni');
const ttsProvider = getTTSProvider();
// Time each reply's first text sent to Cartesia (the first clause ready).
let firstPushAt: number | null = null;
const openReply = ttsProvider.openReplyStream?.bind(ttsProvider);
if (openReply) {
  ttsProvider.openReplyStream = (id: string) => {
    const reply = openReply(id);
    const push = reply.push.bind(reply);
    reply.push = (text: string) => {
      firstPushAt ??= performance.now();
      push(text);
    };
    return reply;
  };
}

async function runTurn(b: Built, moment: number): Promise<Sample> {
  const saved = { ...process.env };
  Object.assign(process.env, b.arm.env ?? {});
  undici.setGlobalDispatcher(b.pool);
  const session = { userData: {} };
  const t0 = performance.now();
  const chatCtx = withTurnReminder(chatContextFor(picked[moment]), session);
  const toolCtx = await toolsForTurn(session, chatCtx, agentTools, { loggedLockedHandoffs: true });
  const lane = b.arm.name === 'main' ? 'main' : laneReason(callerTurn(chatCtx.items as never));
  const buildMs = performance.now() - t0;
  const conn0 = connections;
  firstPushAt = null;

  // The model's text, as LiveKit tees it to the TTS node.
  const text = new TransformStream<string, string>();
  const writer = text.writable.getWriter();
  const write = (t: string) => writer.write(t).catch(() => undefined); // TTS stopped
  const start = performance.now();
  let firstAudioMs: number | null = null;
  const audio = (async () => {
    if (!withTts) return;
    const node = createGatewayTTSNode({ voiceId, personaId: 'ferni', enableCache: false });
    const frames = await node(text.readable as never);
    const reader = frames?.getReader();
    if (!reader) return;
    if (!(await reader.read()).done) firstAudioMs = performance.now() - start;
    await reader.cancel().catch(() => undefined);
  })();

  const out: Sample = {
    arm: b.arm.name,
    moment,
    lane,
    buildMs: Number(buildMs.toFixed(2)),
    toolsSent: Object.keys(toolCtx.functionTools).length,
    promptTokens: null,
    cachedTokens: null,
    ttftMs: null,
    firstPushMs: null,
    firstAudioMs: null,
    newConnections: 0,
    chunks: [],
    reply: '',
  };
  try {
    const connOptions = { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 15_000 };
    for await (const chunk of b.model.chat({ chatCtx, toolCtx, connOptions })) {
      const piece = chunk.delta?.content ?? '';
      const at = Math.round(performance.now() - start);
      if (out.ttftMs === null && (piece.trim() || chunk.delta?.toolCalls?.length)) out.ttftMs = at;
      if (piece) {
        if (out.chunks.length < 4) out.chunks.push([at, piece.length]);
        out.reply += piece;
        void write(piece);
      }
      if (chunk.usage) {
        out.promptTokens = chunk.usage.promptTokens;
        out.cachedTokens = chunk.usage.promptCachedTokens ?? 0;
      }
    }
  } catch (e) {
    out.error = String(e);
  } finally {
    process.env = saved;
  }
  void writer.close().catch(() => undefined);
  await Promise.race([audio, new Promise((r) => setTimeout(r, 8000))]);
  out.firstPushMs = firstPushAt === null ? null : Math.round(firstPushAt - start);
  out.firstAudioMs = firstAudioMs === null ? null : Math.round(firstAudioMs);
  out.newConnections = connections - conn0;
  return out;
}

// --- Stats ---------------------------------------------------------------------------
const quantile = (xs: number[], q: number): number => {
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo);
};
/** A statistic over turns with its 95% bootstrap interval (2000 resamples of the turns). */
function bootstrap(idx: number[], stat: (turns: number[]) => number): [number, number, number] {
  let r = 7;
  const pick = () =>
    idx[Math.floor(((r = (r * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * idx.length)];
  const reps = Array.from({ length: 2000 }, () => stat(idx.map(pick)));
  const round = (x: number) => Math.round(x);
  return [round(stat(idx)), round(quantile(reps, 0.025)), round(quantile(reps, 0.975))];
}

type Metric = 'buildMs' | 'promptTokens' | 'ttftMs' | 'firstPushMs' | 'firstAudioMs';
const METRICS: Metric[] = ['buildMs', 'promptTokens', 'ttftMs', 'firstPushMs', 'firstAudioMs'];

/** Per arm: p50 and p90 per metric; vs the first arm, the median per-turn difference. */
function summarize(samples: Sample[]) {
  const rows = (arm: string) =>
    new Map(samples.filter((x) => x.arm === arm).map((x) => [x.moment, x]));
  const base = rows(ARMS[0]);
  return Object.fromEntries(
    ARMS.map((arm) => {
      const own = rows(arm);
      const res: Record<string, unknown> = {
        n: own.size,
        errors: [...own.values()].filter((x) => x.error).length,
        newConnectionsPerTurn:
          [...own.values()].reduce((a, x) => a + x.newConnections, 0) / own.size,
      };
      for (const m of METRICS) {
        const ok = [...own.keys()].filter((k) => typeof own.get(k)?.[m] === 'number');
        const val = (k: number) => own.get(k)![m] as number;
        res[m] = {
          p50: bootstrap(ok, (ix) => quantile(ix.map(val), 0.5)),
          p90: bootstrap(ok, (ix) => quantile(ix.map(val), 0.9)),
        };
        const paired = ok.filter((k) => typeof base.get(k)?.[m] === 'number');
        const diff = (k: number) => val(k) - (base.get(k)![m] as number);
        if (arm !== ARMS[0] && paired.length)
          res[`${m}VsBase`] = bootstrap(paired, (ix) => quantile(ix.map(diff), 0.5));
      }
      return [arm, res];
    })
  );
}

// --- Run -------------------------------------------------------------------------------
const built: Built[] = [];
for (const a of ARMS) {
  if (!ARM_DEFS[a]) throw new Error(`unknown arm ${a}`);
  built.push(await build(ARM_DEFS[a])); // one at a time: they share process.env
}
// Warm each arm once (auth token, module JIT, Cartesia socket), untimed.
for (const b of built) await runTurn(b, 0);

const samples: Sample[] = [];
for (let m = 0; m < picked.length; m++) {
  const cycleStart = performance.now();
  // Rotate the arm order per turn so no arm always goes first.
  const order = built.map((_, i) => built[(i + m) % built.length]);
  for (const b of order) {
    const x = await runTurn(b, m);
    samples.push(x);
    const { reply: _reply, chunks: _chunks, ...line } = x;
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }
  const wait = GAP_MS - (performance.now() - cycleStart);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const report = { arms: ARMS, n: picked.length, gapMs: GAP_MS, summary: summarize(samples) };
const full = { ...report, tts: withTts, moments: picked, samples };
if (values.out) writeFileSync(String(values.out), JSON.stringify(full, null, 1));
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
process.exit(0);
