/**
 * LIVE end-to-end speech harness: scripted LLM replies through the REAL
 * production TTS chain, against live Cartesia, measured and judged.
 *
 * Chain (same calls tts-wrapper.ts makes on the gateway path):
 *   streamed text → createGatewayTTSNode (continuation-tts → Speech Director →
 *   CartesiaReplyStream on the provider's shared socket) → applyPostTTSEnhancement
 *   (post-TTS transform, then Stage 2 reply audio) → frames we record.
 *
 * Nothing in src/ is modified. Two test seams, both in this process only:
 *   - the Cartesia provider's socket is swapped for one built on a tapped
 *     WebSocket, so every request sent to Cartesia (exact transcript, model,
 *     voice) and every error event is recorded;
 *   - `@ferni/audio`'s renderNonverbal / NativeTempoStretcher are counted, so
 *     a Stage 2 opening or tempo that actually ran is visible.
 *
 * Configurations per scenario: BASELINE (every Director lever and Stage 2 gate
 * off) and FULL (SPEECH_DIRECTOR=live, every lever live, every Stage 2 gate
 * live). Lever and gate names come from the code (director/gate.ts leverModes,
 * reply-audio-plan.ts getStage2Gates, plus a scan of src/ for SPEECH_DIRECTOR_* /
 * SPEECH_STAGE2_* env names), so new levers are picked up without editing this
 * file. Requested levers the code doesn't have are reported as "lever absent".
 *
 * Each reply's WAV is transcribed with Cartesia ink-whisper (batch /stt) and
 * scored; see RULES below for pass/fail. Exit 0 only if every rule passes.
 *
 * usage:
 *   npx tsx scripts/audio-eval/speech-e2e.ts [--out <dir>] [--only id,id]
 *     [--repeats N] [--voice-id <uuid>] [--model <model>] [--env-file <path>]
 *     [--max-calls N] [--verbose]
 *
 *   CARTESIA_API_KEY comes from the environment, else from --env-file, else
 *   from the main checkout's .env (only that one key is read; never printed).
 *   --voice-id / --model default to VOICE_IDS.FERNI / CARTESIA_MODEL from
 *   src/config/voice-ids.ts.
 *
 * @module scripts/audio-eval/speech-e2e
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import {
  analyzeEnergy,
  annotations,
  chunkLikeLlm,
  encodeWav,
  leadingEnergyMs,
  seededRng,
  spokenStageDirections,
  wer,
  windowDb,
  type EnergyAnalysis,
} from './speech-e2e-lib.js';
import {
  judge,
  renderMarkdown,
  renderTable,
  RULE_TEXT,
  RULES,
  type ConfigName,
  type ReplyResult,
  type ReportMeta,
} from './speech-e2e-report.js';
import { SCENARIOS, type Scenario, type TranscriptWord } from './speech-e2e-scenarios.js';
import {
  captureStructuredStderr,
  CartesiaTap,
  discoverLevers,
  hookStage2Native,
  transcribeInkWhisper,
  leverEnv,
  type ReplyTrace,
  type TappableSocket,
} from './speech-e2e-seams.js';

/** Levers the task asks for; absent ones are reported, not failed. */
const REQUESTED_LEVERS = [
  'phrasing',
  'pauses',
  'normalize',
  'emotion',
  'pacing',
  'nonverbal',
  'laughter',
];
const REQUESTED_STAGE2 = ['nonverbal', 'tempo'];

const THINK_MS = 300; // LLM time-to-first-token: the socket prewarm overlaps it, as in prod
const SPEECH_DB = -40; // a 20 ms output frame at/above this is speech for TTFS
const SAMPLE_RATE = 24000;
const REPLY_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const flag = (name: string): boolean => argv.includes(`--${name}`);

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const verbose = flag('verbose');
const repeats = Math.max(1, Number(arg('repeats') ?? 1));
const only = arg('only')?.split(',').filter(Boolean);
const maxCalls = Number(arg('max-calls') ?? 60);

function git(...args: string[]): string {
  try {
    return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function loadApiKey(): string {
  if (process.env.CARTESIA_API_KEY) return process.env.CARTESIA_API_KEY;
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const candidates = [arg('env-file'), common && join(dirname(common), '.env'), join(REPO, '.env')];
  for (const file of candidates) {
    if (!file || !existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('CARTESIA_API_KEY='));
    const key = line
      ?.slice('CARTESIA_API_KEY='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) return key;
  }
  throw new Error('CARTESIA_API_KEY not set and not found in --env-file / .env');
}

// ---------------------------------------------------------------- env before src imports

const apiKey = loadApiKey();
process.env.CARTESIA_API_KEY = apiKey;
if (arg('model')) process.env.CARTESIA_MODEL = arg('model');
process.env.LOG_LEVEL = 'debug'; // captured below, not printed
for (const k of Object.keys(process.env)) {
  if (/^SPEECH_(DIRECTOR|STAGE2)/.test(k)) delete process.env[k];
}

// ---------------------------------------------------------------- seams (before src imports)

const logs = captureStructuredStderr(verbose);
const stage2Native = await hookStage2Native();

// ---------------------------------------------------------------- production modules

const voiceIds = await import('../../src/config/voice-ids.js');
const gateway = await import('../../src/speech/tts-gateway/gateway-tts-node.js');
const providers = await import('../../src/speech/tts-gateway/providers/index.js');
const { CartesiaSocket } =
  await import('../../src/speech/tts-gateway/providers/cartesia-socket.js');
const postTts = await import('../../src/agents/shared/performance/post-tts-transform.js');
const replyStage = await import('../../src/agents/shared/performance/reply-audio-stage.js');
const directorGate = await import('../../src/speech/tts-gateway/director/gate.js');
const audioPlan = await import('../../src/speech/reply-audio-plan.js');

type SocketLike = import('../../src/speech/tts-gateway/providers/cartesia-socket.js').SocketLike;

const voiceId = arg('voice-id') ?? voiceIds.VOICE_IDS.FERNI;
const voiceSource = arg('voice-id') ? '--voice-id' : 'VOICE_IDS.FERNI';

// Swap the provider's shared socket for one on a tapped WebSocket.
const tap = new CartesiaTap();
const provider = providers.getTTSProvider();
if (provider !== providers.getCartesiaProvider()) {
  throw new Error(
    `TTS provider is "${provider.name}", not the Cartesia singleton (TTS_PROVIDER set?)`
  );
}
{
  const seam = provider as unknown as { socket: { url?: () => string; openTimeoutMs?: number } };
  const { url, openTimeoutMs } = seam.socket ?? {};
  if (typeof url !== 'function' || typeof openTimeoutMs !== 'number') {
    throw new Error('test seam changed: CartesiaTTSProvider.socket has no url()/openTimeoutMs');
  }
  (seam as { socket: unknown }).socket = new CartesiaSocket(url, openTimeoutMs, (u) =>
    tap.wrap(new WebSocket(u) as unknown as SocketLike & TappableSocket)
  );
}
if (!provider.openReplyStream || process.env.TTS_REPLY_CONTINUATIONS === 'false') {
  throw new Error('continuation path is off (no openReplyStream or TTS_REPLY_CONTINUATIONS=false)');
}

const levers = discoverLevers({
  leverModes: directorGate.leverModes,
  getStage2Gates: audioPlan.getStage2Gates,
  repo: REPO,
  requestedLevers: REQUESTED_LEVERS,
  requestedStage2: REQUESTED_STAGE2,
});
const CONFIGS: Record<ConfigName, Record<string, string>> = {
  BASELINE: Object.fromEntries([
    ['SPEECH_DIRECTOR', 'off'],
    ...levers.envNames.map((n) => [n, 'off']),
  ]),
  FULL: Object.fromEntries([
    ['SPEECH_DIRECTOR', 'live'],
    ...levers.envNames.map((n) => [n, 'live']),
  ]),
};

// ---------------------------------------------------------------- one reply

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const hash = (s: string): number =>
  [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

function applyEnv(env: Record<string, string>): void {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

let ttsCalls = 0;
let sttCalls = 0;

async function runReply(
  s: Scenario,
  config: ConfigName,
  repeat: number,
  outDir: string
): Promise<ReplyResult> {
  applyEnv(CONFIGS[config]);
  const t: ReplyTrace = { sends: [], errors: [], firstWireChunkAt: null, logs: [] };
  tap.trace = t;
  logs.setSink(t.logs);
  const sessionId = `speech-e2e-${s.id}-${config}-${repeat}-${Date.now().toString(36)}`;
  const turn = 1;
  const stage2Before = { ...stage2Native };
  ttsCalls++;

  const node = gateway.createGatewayTTSNode({
    voiceId,
    sessionId,
    personaId: 'ferni',
    // turnContext carries the user's words for the Director's nonverbal
    // decisions; Stage 2's plan is keyed by the reply id the node generates
    // itself and tags onto the returned stream (review H2), not by turn.
    turnContext: { turnNumber: turn, userRequest: s.userText } as never,
    sampleRate: SAMPLE_RATE,
    frameDurationMs: 20,
    enableCache: true,
  });
  const chunks = chunkLikeLlm(s.reply, seededRng(hash(s.id) + repeat));
  let t0 = 0;
  const textStream = new ReadableStream<string>({
    start(controller) {
      void (async () => {
        await sleep(THINK_MS);
        for (const c of chunks) {
          if (!t0) t0 = performance.now();
          controller.enqueue(c.text);
          await sleep(c.gapMs);
        }
        controller.close();
      })();
    },
  });

  const samples: Int16Array[] = [];
  let ttfaAt: number | null = null;
  let ttfsAt: number | null = null;
  let leadSamples = 0;
  try {
    const audio = await node(textStream as never);
    if (!audio) throw new Error('gateway TTS node returned null');
    // Pass the reply id the gateway node tagged `audio` with, the same way
    // tts-wrapper does (review H2) — Stage 2 refuses a plan with no id.
    const replyId = gateway.getReplyAudioId(audio);
    const out = await postTts.applyPostTTSEnhancement(
      audio,
      { ...postTts.PostTTSPresets.betterThanHuman, sessionId, personaId: 'ferni' },
      replyId
    );
    const reader = out.getReader();
    const deadline = Date.now() + REPLY_TIMEOUT_MS;
    for (;;) {
      const next = await Promise.race([
        reader.read(),
        sleep(Math.max(0, deadline - Date.now())).then(() => 'timeout' as const),
      ]);
      if (next === 'timeout') {
        t.errors.push(`reply timed out after ${REPLY_TIMEOUT_MS} ms`);
        await reader.cancel().catch(() => undefined);
        break;
      }
      if (next.done) break;
      const frame = next.value;
      const at = performance.now();
      const pcm = new Int16Array(
        frame.data.buffer,
        frame.data.byteOffset,
        frame.data.byteLength / 2
      ).slice();
      if (frame.sampleRate !== SAMPLE_RATE || frame.channels !== 1) {
        t.errors.push(`unexpected frame format ${frame.sampleRate} Hz x${frame.channels}`);
      }
      const lead = replyStage.isReplyAudioLeadFrame(frame);
      if (lead) leadSamples += pcm.length;
      ttfaAt ??= at;
      if (ttfsAt === null && !lead && windowDb(pcm, 0, pcm.length) >= SPEECH_DB) ttfsAt = at;
      samples.push(pcm);
    }
  } catch (error) {
    t.errors.push(`pipeline: ${String(error)}`);
  } finally {
    tap.trace = null;
    logs.setSink(null);
  }
  // Errors the chain swallowed and logged (e.g. "Continuous reply TTS failed").
  for (const l of t.logs) {
    if (l.level >= 40 && /TTS failed|stalled|Cartesia/i.test(`${l.msg} ${l.err ?? ''}`)) {
      t.errors.push(`logged: ${l.msg} ${String(l.err ?? l.error ?? '')}`.trim());
    }
  }

  const total = samples.reduce((n, p) => n + p.length, 0);
  const pcm = new Int16Array(total);
  let off = 0;
  for (const p of samples) {
    pcm.set(p, off);
    off += p.length;
  }
  if (total === 0) t.errors.push('no audio');
  const wavName = `${s.id}.${config}${repeats > 1 ? `.r${repeat}` : ''}.wav`;
  const wav = encodeWav(pcm, SAMPLE_RATE);
  writeFileSync(join(outDir, wavName), wav);

  const energy: EnergyAnalysis = analyzeEnergy(pcm, SAMPLE_RATE, {
    minSilenceMs: RULES.reportSilenceMs,
  });
  let transcript = '';
  let words: TranscriptWord[] = [];
  let sttError: string | undefined;
  if (total > 0) {
    try {
      sttCalls++;
      ({ text: transcript, words } = await transcribeInkWhisper(wav, apiKey));
    } catch (error) {
      sttError = String(error);
    }
  }
  const firstWordMs = words.length ? Math.round(words[0].start * 1000) : null;
  const flags: string[] = [];
  for (const check of s.checks ?? []) {
    if (transcript && !check.ok(transcript, words)) flags.push(check.name);
  }
  const pushes = t.sends.filter((x) => !x.cancel && x.transcript).map((x) => x.transcript!);
  for (const check of s.pushedChecks ?? []) {
    if (!check.ok(pushes.join(''))) flags.push(check.name);
  }
  const plan = t.logs.find((l) => l.msg === 'Speech director plan');
  // `opening` is the director's Stage 2 decision for this reply. `breaths`/`sighs` count every
  // planned event, including mid-reply ones Stage 2 does not render yet (needs word timings).
  const opening = typeof plan?.opening === 'string' ? plan.opening : undefined;
  const rendered = stage2Native.renderNonverbal - stage2Before.renderNonverbal;
  if (config === 'FULL' && s.expectOpening && opening !== s.expectOpening) {
    flags.push(`expected an opening ${s.expectOpening}, director planned ${opening ?? 'none'}; Stage 2 rendered none`);
  }
  const lateSkip = t.logs.some((l) => l.msg === 'Stage 2 opening arrived after speech started; skipped');
  if (config === 'FULL' && opening && rendered === 0) {
    flags.push(
      lateSkip
        ? `opening ${opening} decided after speech started; skipped by design`
        : `director planned an opening ${opening}, Stage 2 rendered none`
    );
  }
  const midReplyPlanned = Math.max(
    0,
    Number(plan?.breaths ?? 0) + Number(plan?.sighs ?? 0) - (opening ? 1 : 0)
  );
  if (config === 'FULL' && midReplyPlanned > 0) {
    flags.push(`${midReplyPlanned} mid-reply breath/sigh planned, not rendered (known gap)`);
  }
  const first = t.sends.find((x) => x.model);
  return {
    scenario: s.id,
    config,
    repeat,
    sessionId,
    pushedText: pushes.join(''),
    pushes,
    wireModel: first?.model,
    wireVoice: first?.voice,
    errors: t.errors,
    ttfaMs: ttfaAt !== null && t0 ? Math.round(ttfaAt - t0) : null,
    ttfsMs: ttfsAt !== null && t0 ? Math.round(ttfsAt - t0) : null,
    wireTtfbMs: t.firstWireChunkAt !== null && t0 ? Math.round(t.firstWireChunkAt - t0) : null,
    durationMs: energy.durationMs,
    stage2LeadMs: Math.round((leadSamples / SAMPLE_RATE) * 1000),
    stage2: {
      renderNonverbal: stage2Native.renderNonverbal - stage2Before.renderNonverbal,
      tempoStretchers: stage2Native.tempoStretchers - stage2Before.tempoStretchers,
    },
    leadingEnergyMs: firstWordMs !== null ? leadingEnergyMs(energy, firstWordMs) : null,
    firstWordMs,
    words,
    silences: energy.internalSilences,
    longestSilenceMs: energy.longestInternalSilenceMs,
    transcript,
    sttError,
    wer: transcript ? wer(s.spoken, transcript) : null,
    stageWords: spokenStageDirections(transcript),
    soundAnnotations: annotations(transcript),
    flags,
    plan: plan
      ? Object.fromEntries(
          Object.entries(plan).filter(
            ([k]) => !['level', 'time', 'pid', 'hostname', 'msg', 'module'].includes(k)
          )
        )
      : undefined,
    warnings: t.logs
      .filter((l) => l.level >= 40)
      .map((l) => `${l.module ?? ''}: ${l.msg ?? ''}`)
      .slice(0, 10),
    wav: wavName,
  };
}

// ---------------------------------------------------------------- run

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(resolve(arg('out') ?? join(tmpdir(), 'speech-e2e')), runId);
mkdirSync(outDir, { recursive: true });
const scenarios = SCENARIOS.filter((s) => !only || only.includes(s.id));
const plannedCalls = scenarios.length * 2 * repeats;
if (plannedCalls > maxCalls) {
  throw new Error(
    `${plannedCalls} TTS + ${plannedCalls} STT calls planned; over --max-calls ${maxCalls}`
  );
}

// Open the shared socket once, as a running agent has it open between turns.
await (provider as unknown as { socket: { connect(): Promise<unknown> } }).socket.connect();

const results: ReplyResult[] = [];
for (let r = 0; r < repeats; r++) {
  for (const [i, s] of scenarios.entries()) {
    // Alternate which config goes first so network drift doesn't favor one.
    const order: ConfigName[] = (i + r) % 2 === 0 ? ['BASELINE', 'FULL'] : ['FULL', 'BASELINE'];
    for (const config of order) {
      const res = await runReply(s, config, r, outDir);
      results.push(res);
      if (verbose)
        console.log(`${s.id} ${config}: ttfs=${res.ttfsMs} wer=${res.wer?.wer.toFixed(3)}`);
    }
  }
}
applyEnv(CONFIGS.BASELINE);

// ---------------------------------------------------------------- judge + report

const verdict = judge(results, tap.orphanErrors);
const { planProducers, absentLevers, absentDirectorLevers } = levers;
const planProducerNote = planProducers.length
  ? `setReplyAudioPlan has a caller (${planProducers.join(', ')}): FULL can engage Stage 2`
  : 'setReplyAudioPlan has NO caller in src/: Stage 2 gates are live but no plan ever exists, so Stage 2 cannot change audio';
const meta: ReportMeta = {
  runId,
  commit: `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain', '--untracked-files=no') ? '+dirty' : ''}`,
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  voiceId,
  voiceSource,
  codeFerniVoiceId: voiceIds.VOICE_IDS.FERNI,
  wireModels: [...new Set(results.map((r) => r.wireModel ?? ''))].filter(Boolean),
  levers: levers.levers,
  fullEnv: CONFIGS.FULL,
  stage2Note: `${planProducerNote}. Native instrumentation ${
    stage2Native.hooked
      ? 'hooked'
      : `NOT hooked${stage2Native.note ? `: ${stage2Native.note}` : ''}`
  }`,
  calls: { tts: ttsCalls, stt: sttCalls },
  thinkMs: THINK_MS,
  speechDb: SPEECH_DB,
};
const extra = {
  outDir,
  codeModel: voiceIds.CARTESIA_MODEL,
  wireVoices: [...new Set(results.map((r) => r.wireVoice ?? ''))].filter(Boolean),
  absentLevers,
  absentDirectorLevers,
  stage2: { gates: levers.stage2Gates, planProducers, nativeHooked: stage2Native.hooked },
  ttsContexts: tap.contexts.size,
  rules: RULE_TEXT,
};
writeFileSync(
  join(outDir, 'report.json'),
  JSON.stringify({ meta: { ...meta, ...extra }, ...verdict, results }, null, 2)
);
writeFileSync(join(outDir, 'report.md'), renderMarkdown(meta, verdict, results, scenarios));

console.log(renderTable(results));
console.log('');
for (const r of verdict.rules) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.rule}: ${r.detail}`);
console.log(
  `levers absent: ${absentLevers.join(', ') || 'none'}; director levers absent: ${absentDirectorLevers.map(leverEnv).join(', ') || 'none'}; stage 2 plan producer: ${planProducers.length ? planProducers.join(', ') : 'none'}`
);
console.log(
  `voice ${voiceId} (${voiceSource}), model ${meta.wireModels.join(',')}; ${ttsCalls} TTS / ${sttCalls} STT calls`
);
console.log(`report: ${join(outDir, 'report.md')}`);
console.log(verdict.pass ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(verdict.pass ? 0 : 1);
