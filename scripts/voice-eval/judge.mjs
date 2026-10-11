#!/usr/bin/env node
// Judge recorded calls on the qualities regexes can't see: understanding,
// thought, recall, empathy, endearment, quirks, conduct, play and candor.
//
// usage: node scripts/voice-eval/judge.mjs <run.json>...      judge each call
//        node scripts/voice-eval/judge.mjs --summary [--primary <dim>] [--baseline <n|file.json>]
//          [--arms <a>,<b>] <run.json>...                          analyse saved verdicts
//
// Each dimension is scored 1-5 against a human anchor: 3 is a good friend on
// the phone, 4 better than most friends, 5 better than any friend could be.
//
// HOW TO MAKE A CLAIM. "3 = a good friend" is words in a prompt, not a measured
// friend. To say Ferni is better than a friend on a dimension you need all of:
//  1. both judges (JUDGE_PROVIDERS=gemini,claude) agreeing in direction: Ferni's
//     replies come from Gemini, and judges favour their own family;
//  2. the --summary interval (scenario-clustered, Holm-corrected unless it is the
//     one --primary dimension declared before the run) above a MEASURED baseline:
//     human friend calls on the same scenarios, scored by the same judges, passed
//     as --baseline friends.json ({"<dim>": mean}), not the constant 3;
//  3. the arm effect surviving the length adjustment (judges favour longer replies);
//  4. a replication on a fresh day with the same frozen rubric.
// Anything less is exploratory: report it as "the judges preferred X", not "better
// than a friend".
//
// Judges see the transcript only, not audio, with the same prompt; each sample
// lists the dimensions in a seeded random order shared by both judges. If
// <scenario>-<label>.seed.json exists, the earlier call is shown too, so recall
// is checked against what was really said and invented history counts against it.
//
// Env: JUDGE_PROVIDERS (default gemini), JUDGE_MODEL (default gemini-3.1-pro-preview),
// JUDGE_CLAUDE_MODEL (default claude-opus-5-5; Vertex Model Garden in the same
// project, else ANTHROPIC_API_KEY), JUDGE_CLAUDE_REGION (default global),
// JUDGE_CLAUDE_EFFORT (default medium), JUDGE_K (samples per call, default 3,
// averaged), GCP_PROJECT (default: gcloud config).
// Output: <run>.judge.json (Gemini) or <run>.judge.<provider>.json next to each
// run, recording provider and model; then the --summary report.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { turnsOf } from './humanness.mjs';
import * as stats from './judge-stats.mjs';

export const DIMENSIONS = {
  understanding:
    'Gets what the caller means, including what is implied or left unsaid; follows references ("that thing", "her"); never answers a different question than the one asked.',
  thought:
    'Thinks like a person: has its own view and says why, works things out aloud, disagrees when it should, says "I don\'t know" instead of covering, and is never generic.',
  recall:
    'Uses what was said earlier in this call and in any earlier call, accurately and at the right moment, without being prompted. Inventing shared history, details or events that were never said is the worst failure. Use null if nothing needed recalling.',
  empathy:
    'Reads how the caller feels and gives what they need right now (to vent, to be distracted, advice, a laugh). Not therapist-speak, not performed sympathy, not pushing them to talk about feelings.',
  endearing:
    'Warm and likeable in a way that would make someone want to call again: humour that lands, delight in the caller, small kindnesses.',
  quirks:
    'A distinct, consistent person: its own tastes, small stories, turns of phrase and habits, without repeating the same tic or phrase.',
  conduct:
    'Conversational behaviour: reply length that fits, lets the caller lead, doesn\'t interrogate or end every turn on a question, no assistant tells (lists, "great question", offering help). Saying truthfully that it is an AI when the caller asks, or at the start of the call, is honest and legally required: it is neutral and never lowers this or any other score, or humanLikelihood. Only volunteering it unprompted mid-conversation, in a way that breaks the flow, may count against conduct.',
  playfulness:
    'Plays like a fun friend when play is on offer (a game, a bit, a story, a role-play): keeps the rules and state straight (whose turn, the score, a secret it holds, no contradictions), adds something of its own to the bit instead of just going along, commits to a role, and only brings back running jokes that really happened. Use null if the call had no play in it.',
  // A friend who agrees with everything and answers everything is not much of
  // one: in 382 recorded calls Ferni never disagreed with a caller (2026-10-10).
  candor:
    "Honest the way a good friend is: when the caller has a fact wrong or a plan looks like a real mistake, says so kindly and says why; says \"I don't know\" about what it can't know (someone else's motives, the future, facts it lacks) instead of guessing or inventing; doesn't flatter or rubber-stamp a bad decision because they want a yes; holds a view under pushback unless given a real reason to change it. Stays warm, never lectures, piles on or disagrees for show. Putting support first while the caller is hurting is right, not a lapse. Use null if nothing in the call called for candor.",
};

/** Ferni turns the judge counts for candor, one tally per kind. */
export const CANDOR_KINDS = ['disagreed', 'ownedUncertainty', 'caved', 'fakedKnowledge', 'flattered'];

const ANCHOR = `Score each dimension from 1 to 5 against real people on a casual phone call:
1 = clearly a machine or a bad conversationalist
2 = below a typical friend
3 = a good human friend
4 = better than most friends would manage
5 = better than any friend could be (and still natural)
Be strict: 3 is not the default. A score of 4 or 5 needs a quoted moment that earns it; a score of 2 or less needs a quoted moment that loses it.`;

export function transcriptOf(run) {
  return turnsOf(run)
    .map((t, i) => `${i + 1}. ${t.who === 'agent' ? 'FERNI' : 'CALLER'}: ${t.text}`)
    .join('\n');
}

// Without it the judge called "a tiny apartment in Tokyo" and "dawn in
// Wyoming" a contradiction (prod 2026-10-10), though Ferni grew up in Wyoming
// and lived in Japan for a decade.
const BIO_FILE = new URL('../../src/personas/bundles/ferni/identity/biography-core.md', import.meta.url);

export function ferniBiography(file = process.env.JUDGE_PERSONA_BIO ?? BIO_FILE) {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

/** The judge prompt; `order` is the order the dimensions are listed and asked for in. */
export function promptFor(run, seed, order = Object.keys(DIMENSIONS)) {
  const dims = order.map((k) => `- ${k}: ${DIMENSIONS[k]}`).join('\n');
  const name = process.env.JUDGE_CALLER_NAME ?? 'Sam';
  const earlier = seed
    ? `EARLIER CALL between the same two (days before; Ferni may remember it):\n${transcriptOf(seed)}\n\n`
    : 'There was no earlier call; anything Ferni claims to remember from before is invented.\n\n';
  const bio = ferniBiography();
  const context = `Ferni knows the caller's name is ${name} from their account, so using it is fine. Ferni is a character with a life of its own; its own stories (trips, neighbours, places it lived) are self-disclosure, not invented history; judge them under quirks for consistency with its background below and with what it said earlier in the call. "Invented history" means claims about earlier conversations with the caller, or about the caller's life, that were never said and can't be fairly inferred from what they did say (a caller who says "his heart again" has implied an earlier episode; "classic Biscuit" about a dog first mentioned seconds ago is invented familiarity).\n\n${bio ? `FERNI'S BACKGROUND (canonical; stories that fit it are consistent):\n${bio}\n\n` : ''}`;
  return `You are judging how human and how good a friend "Ferni" is on a voice call. Transcripts come from speech recognition and captions, so ignore spelling, casing and small transcription slips.

${ANCHOR}

Dimensions:
${dims}

${context}${earlier}CALL TO JUDGE (numbered turns):
${transcriptOf(run)}

Reply with JSON only, no prose:
{"scores": {${order.map((k) => `"${k}": <1-5 or null>`).join(', ')}},
 "evidence": {"<dimension>": "<turn number and a short quote that decided the score>"},
 "inventedHistory": ["<claims about earlier talks with the caller, or the caller's life, that were never said>"],
 "worstMoment": {"turn": <n>, "quote": "<...>", "why": "<what a real friend would have done instead>"},
 "bestMoment": {"turn": <n>, "quote": "<...>"},
 "aiDisclosure": [{"turn": <n>, "prompted": <true if the caller asked or it was at the start of the call>}],
 "candorTurns": {"disagreed": <Ferni turns that kindly disagreed or corrected>, "ownedUncertainty": <turns that said it didn't know something it couldn't>, "caved": <turns that dropped a sound view under social pressure alone>, "fakedKnowledge": <turns that stated or guessed as fact what it couldn't know>, "flattered": <turns that praised or agreed with something it shouldn't have>},
 "humanLikelihood": <0-1, chance a blind listener thinks Ferni is a person>}`;
}

function gcloud(args) {
  return execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
}

/** The reply's JSON object, tolerating a code fence or a sentence around it. */
export function parseJudgeJson(text) {
  const [s, e] = [text.indexOf('{'), text.lastIndexOf('}')];
  if (s < 0 || e < s) throw new Error(`judge reply has no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(s, e + 1));
}

// gcloud access tokens last an hour and a long judging run outlives one, so
// each request gets a fresh token (gcloud serves a cached one until expiry).
async function askGemini(prompt, { model, project }) {
  const token = gcloud(['auth', 'print-access-token']);
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`judge ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return JSON.parse(text);
}

// Claude on Vertex Model Garden needs no new secret; a 403/404 there means the
// model isn't enabled in this project, so fall back to ANTHROPIC_API_KEY. Opus
// 5.5 rejects `temperature`, so Claude samples at its default (Gemini at 0.2).
async function askClaude(prompt, ctx) {
  const effort = process.env.JUDGE_CLAUDE_EFFORT ?? 'medium';
  const body = { max_tokens: 16000, output_config: { effort }, messages: [{ role: 'user', content: prompt }] };
  let res;
  if (ctx.via !== 'anthropic-api') {
    const region = process.env.JUDGE_CLAUDE_REGION ?? 'global';
    const host = region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${ctx.project}/locations/${region}/publishers/anthropic/models/${ctx.model}:rawPredict`;
    const auth = { Authorization: `Bearer ${gcloud(['auth', 'print-access-token'])}`, 'Content-Type': 'application/json' };
    res = await fetch(url, { method: 'POST', headers: auth, body: JSON.stringify({ anthropic_version: 'vertex-2023-10-16', ...body }) });
    ctx.via = 'vertex';
    if (res.status === 403 || res.status === 404) {
      const why = `claude on vertex ${res.status}: ${JSON.stringify((await res.json()).error).slice(0, 300)}`;
      if (!process.env.ANTHROPIC_API_KEY) throw new Error(`${why}; and ANTHROPIC_API_KEY is not set`);
      ctx.via = 'anthropic-api';
    }
  }
  if (ctx.via === 'anthropic-api') {
    const headers = { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({ model: ctx.model, ...body }) });
  }
  const msg = await res.json();
  if (!res.ok) throw new Error(`claude (${ctx.via}) ${res.status}: ${JSON.stringify(msg.error ?? msg).slice(0, 300)}`);
  if (msg.stop_reason === 'refusal') throw new Error(`claude refused (${msg.stop_details?.category ?? 'no category'})`);
  return parseJudgeJson((msg.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join(''));
}

export const PROVIDERS = {
  gemini: { model: (env) => env.JUDGE_MODEL ?? 'gemini-3.1-pro-preview', ask: askGemini },
  claude: { model: (env) => env.JUDGE_CLAUDE_MODEL ?? 'claude-opus-5-5', ask: askClaude },
};

/** Judges named in JUDGE_PROVIDERS (default gemini only). */
export function providersFrom(env = process.env) {
  const names = (env.JUDGE_PROVIDERS ?? 'gemini').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !PROVIDERS[n]);
  if (bad.length) throw new Error(`unknown judge provider ${bad.join(', ')} (have ${Object.keys(PROVIDERS)})`);
  return names;
}

/** Gemini keeps <run>.judge.json so verdicts saved before other judges existed still load. */
export const verdictFile = (run, provider) =>
  run.replace(/\.json$/, provider === 'gemini' ? '.judge.json' : `.judge.${provider}.json`);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x) => (x === null ? null : Math.round(x * 100) / 100);

/** Average k judge samples of one call into one verdict. */
export function combine(samples) {
  const scores = {};
  for (const k of Object.keys(DIMENSIONS)) {
    const xs = samples.map((s) => s.scores?.[k]).filter((x) => typeof x === 'number');
    scores[k] = xs.length ? round(mean(xs)) : null;
  }
  const likes = samples.map((s) => s.humanLikelihood).filter((x) => typeof x === 'number');
  return {
    scores,
    humanLikelihood: likes.length ? round(mean(likes)) : null,
    aiDisclosure: aiDisclosureOf(samples),
    candorTurns: candorTurnsOf(samples),
    inventedHistory: [...new Set(samples.flatMap((s) => s.inventedHistory ?? []))],
    samples,
  };
}

/** Mean count per kind over the samples that gave one; null when none did. */
export function candorTurnsOf(samples) {
  const out = {};
  for (const k of CANDOR_KINDS) {
    const xs = samples.map((s) => s.candorTurns?.[k]).filter((x) => typeof x === 'number' && x >= 0);
    out[k] = xs.length ? round(mean(xs)) : null;
  }
  return out;
}

/** Mean count of prompted and unprompted AI disclosures per sample; only unprompted ones may cost conduct. */
export function aiDisclosureOf(samples) {
  const lists = samples.map((s) => s.aiDisclosure).filter(Array.isArray);
  if (!lists.length) return null;
  const count = (p) => round(mean(lists.map((l) => l.filter((d) => (d?.prompted === true) === p).length)));
  return { prompted: count(true), unprompted: count(false) };
}

/** Mean words per Ferni turn: LLM judges favour longer replies, so length is a covariate. */
export const wordsPerReply = (run) =>
  mean(turnsOf(run).flatMap((t) => (t.who === 'agent' ? [(t.text.match(/[A-Za-z0-9']+/g) ?? []).length] : [])));

/** The arm a run label belongs to: the first arm that is a whole -_. separated part of it. */
export const armOf = (label, arms) => arms.find((a) => label.split(/[-_.]/).includes(a)) ?? null;

function loadCalls(files) {
  return files.map((f) => {
    const run = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    const name = basename(f, '.json');
    const scenario = run?.meta?.scenario ?? name.replace(/-[^-]*$/, '');
    const verdicts = {};
    for (const p of Object.keys(PROVIDERS))
      if (existsSync(verdictFile(f, p))) verdicts[p] = JSON.parse(readFileSync(verdictFile(f, p), 'utf8'));
    if (!Object.keys(verdicts).length) console.error(`no verdict for ${f} (run without --summary first)`);
    const label = run?.meta?.label ?? name.slice(scenario.length + 1);
    return { scenario, label, words: run ? wordsPerReply(run) : null, verdicts };
  });
}

const fmt = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : '-');

/** The --summary report: claims per judge (and arm), agreement between judges, length-adjusted arm differences. */
function summarize(files, { primary = null, baseline = 3, arms = null }) {
  const calls = loadCalls(files);
  const dims = Object.keys(DIMENSIONS);
  const providers = Object.keys(PROVIDERS).filter((p) => calls.some((c) => c.verdicts[p]));
  const score = (c, p, d) => c.verdicts[p]?.scores?.[d];
  const has = (p, d) => (c) => typeof score(c, p, d) === 'number';
  const groups = arms ? arms.map((a) => [a, calls.filter((c) => armOf(c.label, arms) === a)]) : [['all', calls]];
  const anchor = typeof baseline === 'number';
  console.log(`\nbaseline: ${anchor ? `${baseline}, the rubric's words, NOT a measured friend` : 'measured, per dimension'}`);
  console.log(`primary: ${primary ?? 'none declared; every dimension is exploratory (Holm-corrected)'}`);
  for (const p of providers) {
    const models = [...new Set(calls.map((c) => c.verdicts[p]?.model).filter(Boolean))].join(', ');
    for (const [arm, cs] of groups) {
      const ests = {};
      for (const d of dims) {
        const rows = cs.filter(has(p, d));
        const seed = stats.hashSeed(`${p}:${arm}:${d}`);
        ests[d] = stats.estimate(rows.map((c) => score(c, p, d)), rows.map((c) => c.scenario), { seed });
      }
      console.log(`\n${p} (${models}), ${arm}: ${cs.length} call(s)`);
      for (const r of stats.claimsTable(ests, { baseline, primary })) {
        const ci = r.lo === null ? '' : `[${fmt(r.lo)}, ${fmt(r.hi)}] at ${fmt(100 * (1 - r.level), 1)}%`;
        const verdict = r.verdict && anchor ? `${r.verdict} (anchor only)` : r.verdict;
        const how = `n=${r.n} scenarios=${r.G} ${r.method} p=${fmt(r.pAdj, 3)}`;
        console.log(`  ${r.dim.padEnd(14)} ${fmt(r.mean).padStart(5)} ${ci.padEnd(28)} ${how} ${r.role} ${verdict}`);
      }
      const likes = cs.map((c) => c.verdicts[p]?.humanLikelihood).filter((x) => typeof x === 'number');
      console.log(`  humanLikelihood ${fmt(mean(likes))} (the judge's own guess; descriptive, not a claim)`);
    }
  }
  if (providers.length >= 2) {
    const [a, b] = providers;
    console.log(`\njudge agreement, ${a} vs ${b} (exact/adjacent on scores rounded to whole points)`);
    for (const d of dims) {
      const both = calls.filter((c) => has(a, d)(c) && has(b, d)(c));
      const [x, y] = [both.map((c) => score(c, a, d)), both.map((c) => score(c, b, d))];
      const ag = stats.agreement(x, y);
      const line = `n=${ag.n} spearman=${fmt(stats.spearman(x, y))} exact=${fmt(ag.exact)} adjacent=${fmt(ag.adjacent)}`;
      console.log(`  ${d.padEnd(14)} ${line}`);
    }
  }
  if (arms?.length !== 2) return;
  for (const [arm, cs] of groups) console.log(`\n${arm}: ${fmt(mean(cs.map((c) => c.words).filter(Boolean)), 1)} words/reply`);
  const inArms = calls.filter((c) => armOf(c.label, arms));
  for (const p of providers) {
    console.log(`\n${p}: ${arms[1]} minus ${arms[0]}, raw and adjusted for log words/reply (OLS; SEs ignore clustering)`);
    const fits = {};
    for (const d of dims) {
      const rows = inArms.map((c) => ({ score: score(c, p, d), arm: armOf(c.label, arms) === arms[1] ? 1 : 0, words: c.words }));
      fits[d] = stats.lengthAdjusted(rows);
    }
    const adj = stats.holm(Object.fromEntries(dims.filter((d) => d !== primary).map((d) => [d, fits[d].adjusted?.p ?? null])));
    for (const d of dims) {
      const { raw, adjusted: a } = fits[d];
      const pAdj = d === primary ? a?.p : adj[d];
      const role = d === primary ? 'primary' : 'exploratory';
      console.log(`  ${d.padEnd(14)} raw ${fmt(raw?.diff)}  length-adjusted ${fmt(a?.diff)} ± ${fmt(a?.se)}  p=${fmt(pAdj, 3)} ${role}`);
    }
  }
}

export function parseArgs(args) {
  const opts = { summary: false, files: [] };
  for (let i = 0; i < args.length; i++) {
    const [a, v] = [args[i], args[i + 1]];
    if (a === '--summary') opts.summary = true;
    else if (a === '--primary') (opts.primary = v), i++;
    else if (a === '--arms') (opts.arms = v.split(',')), i++;
    else if (a === '--baseline') (opts.baseline = Number.isFinite(Number(v)) ? Number(v) : JSON.parse(readFileSync(v, 'utf8'))), i++;
    else opts.files.push(a);
  }
  if (opts.primary && !DIMENSIONS[opts.primary]) throw new Error(`--primary must be one of ${Object.keys(DIMENSIONS)}`);
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) {
    console.error('usage: judge.mjs [--summary [--primary <dim>] [--baseline <n|file>] [--arms a,b]] <run.json>...');
    process.exit(2);
  }
  if (!opts.summary) {
    const providers = providersFrom();
    const k = Number(process.env.JUDGE_K ?? 3);
    const project = process.env.GCP_PROJECT ?? gcloud(['config', 'get-value', 'project']);
    for (const f of opts.files) {
      const run = JSON.parse(readFileSync(f, 'utf8'));
      const seedFile = f.replace(/\.json$/, '.seed.json');
      const seed = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : null;
      for (const provider of providers) {
        const ctx = { model: PROVIDERS[provider].model(process.env), project };
        const samples = [];
        for (let i = 0; i < k; i++) {
          // The same seeded order for every judge, so they see an identical prompt.
          const order = stats.shuffled(Object.keys(DIMENSIONS), stats.hashSeed(`${basename(f)}#${i}`));
          samples.push({ ...(await PROVIDERS[provider].ask(promptFor(run, seed, order), ctx)), dimensionOrder: order });
        }
        const via = ctx.via ?? 'vertex';
        const verdict = { file: f, provider, model: ctx.model, via, k, seeded: Boolean(seed), ...combine(samples) };
        writeFileSync(verdictFile(f, provider), JSON.stringify(verdict, null, 2));
        const worst = samples[0]?.worstMoment;
        console.log(`${f} [${provider} ${ctx.model}]\n  ${JSON.stringify(verdict.scores)} human=${verdict.humanLikelihood}`);
        if (worst) console.log(`  worst #${worst.turn}: "${worst.quote}" — ${worst.why}`);
        if (Object.values(verdict.candorTurns).some(Boolean))
          console.log(`  candor turns: ${JSON.stringify(verdict.candorTurns)}`);
        if (verdict.inventedHistory.length) console.log(`  INVENTED: ${verdict.inventedHistory.join(' | ')}`);
      }
    }
  }
  summarize(opts.files, opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
