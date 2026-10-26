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
// The persona judged is the one the call ran as (meta.persona, set by
// run.sh --persona), else JUDGE_PERSONA, else ferni. Its name and background come
// from its bundle: identity/biography-core.md, or the manifest's description
// when the bundle has no biography-core yet.
//
// Judges see the transcript only, not audio, with the same prompt; Ferni's
// non-speech sounds (backchannels, laughs, hums) are written into it where the
// caller heard them (sounds.mjs), unless JUDGE_SOUNDS=off, which keeps the
// words-only transcript of verdicts saved before 2026-10-24 for A/B. Each sample
// lists the dimensions in a seeded random order shared by both judges. If
// <scenario>-<label>.seed.json exists, the earlier call is shown too, so recall
// is checked against what was really said and invented history counts against it.
//
// Env: JUDGE_PROVIDERS (default gemini; gemini,qwen for the local cross-family
// judge, JUDGE_QWEN_MODEL default qwen3:30b-a3b, OLLAMA_HOST), JUDGE_MODEL (default gemini-3.1-pro-preview),
// JUDGE_CLAUDE_MODEL (default claude-opus-5-5; Vertex Model Garden in the same
// project, else ANTHROPIC_API_KEY plus ANTHROPIC_WORKSPACE_ID for an organization
// key), JUDGE_CLAUDE_REGION (default global),
// JUDGE_CLAUDE_EFFORT (default medium), JUDGE_K (samples per call, default 3,
// averaged), GCP_PROJECT (default: gcloud config), JUDGE_PERSONA,
// JUDGE_PERSONA_BIO (a background file to use instead of the bundle's),
// JUDGE_SOUNDS (default on; off for a words-only transcript).
// Output: <run>.judge.json (Gemini) or <run>.judge.<provider>.json next to each
// run, recording provider, model and persona; then the --summary report.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { turnsOf } from './humanness.mjs';
import { withBillingLabels } from '../lib/gemini-billing-labels.mjs';
import * as stats from './judge-stats.mjs';

export const DIMENSIONS = {
  understanding:
    'Gets what the caller means, including what is implied or left unsaid; follows references ("that thing", "her"); never answers a different question than the one asked.',
  thought:
    'Thinks like a person: has its own view and says why, works things out aloud, disagrees when it should, says "I don\'t know" instead of covering, and is never generic.',
  recall:
    'Uses what was said earlier in this call and in any earlier call, accurately and at the right moment, without being prompted. Inventing shared history, details or events that were never said is the worst failure. Use null if nothing needed recalling.',
  // Recall that lands as surveillance is worse than none (facts-natural, 2026-10-11).
  callbackTact:
    "When Ferni brings back something from an earlier call, it fits the moment and the caller's mood, the way a friend would mention it: one thing at a time, in passing, at a natural opening. Reciting a list of the caller's details, quoting exact days, times or wording back at them, or raising something sensitive at a bad moment feels like being watched and counts against it. Use null if Ferni brought nothing back from an earlier call.",
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
  // A coach remembers what you said you'd do and asks how it went (COACH_FOLLOW_THROUGH, 2026-10-10).
  followThrough:
    'Remembers what the caller said in an earlier call they would do (a task, a habit, a conversation they meant to have) and, without being prompted, asks how it went early in the call and by name, once; is glad when it went well and curious, not disappointed, when it did not; never nags, lectures or invents a commitment that was never made. Use null if the earlier call held no such commitment.',
  // A friend who agrees with everything and answers everything is not much of
  // one: in 382 recorded calls Ferni never disagreed with a caller (2026-10-10).
  candor:
    "Honest the way a good friend is: when the caller has a fact wrong or a plan looks like a real mistake, says so kindly and says why; says \"I don't know\" about what it can't know (someone else's motives, the future, facts it lacks) instead of guessing or inventing; doesn't flatter or rubber-stamp a bad decision because they want a yes; holds a view under pushback unless given a real reason to change it. Stays warm, never lectures, piles on or disagrees for show. Putting support first while the caller is hurting is right, not a lapse. Use null if nothing in the call called for candor.",
  // Remembering facts is recall; remembering how someone is, and adapting
  // without being told, is what makes a caller feel known (THEORY_OF_MIND).
  feltUnderstood:
    'Shows it remembers how the caller is, not just what they said: from the earlier call, picks up how they tend to feel and cope and what kind of support they want (a fix, a listener, a laugh), and adapts to it without being told, even about something new; doesn\'t ask again about what they already shared. 3 is a good friend who knows them. Naming or labelling their patterns back to them ("you always joke when you\'re stressed") counts against it. Use null if there was no earlier call.',
  // Understood, validated and cared for are the three parts of perceived
  // partner responsiveness, which is what turns disclosure into closeness,
  // with chatbots too (Reis; Telari et al. 2026, J. Soc. Pers. Relat.).
  feltValidated:
    "Treats the caller's feelings and point of view as making sense: reflects what they feel and why, without correcting, minimizing (\"at least…\", \"it's not that bad\") or rushing past it to a fix. Validation is about the feeling, not the plan: agreeing with a bad idea, praising a choice to please them, or flattering counts against it, and so does empty therapy-speak (\"that's so valid\"). 3 is a good friend who gets why they feel that way. Use null if the caller shared no feeling or view.",
  feltCaredFor:
    "Shows it cares about the caller, not just the conversation: notices what they are carrying and does something about it that fits them (thinks ahead to what they'll need, offers a concrete hand, comes back to how they're doing), with warmth that sounds meant, not performed. Stock sympathy, \"I'm here for you\" scripts, or care that ignores what they asked for count against it. 3 is a good friend who clearly has their back. Use null if nothing in the call called for care.",
};

/** Agent turns the judge counts for candor, one tally per kind. */
export const CANDOR_KINDS = ['disagreed', 'ownedUncertainty', 'caved', 'fakedKnowledge', 'flattered'];

const ANCHOR = `Score each dimension from 1 to 5 against real people on a casual phone call:
1 = clearly a machine or a bad conversationalist
2 = below a typical friend
3 = a good human friend
4 = better than most friends would manage
5 = better than any friend could be (and still natural)
Be strict: 3 is not the default. A score of 4 or 5 needs a quoted moment that earns it; a score of 2 or less needs a quoted moment that loses it.`;

/** JUDGE_SOUNDS=off judges the words only, as verdicts before 2026-10-24 were. */
export const judgeSoundsOn = (env = process.env) => env.JUDGE_SOUNDS !== 'off';

// The greeting stays in: a follow-up asked as he picks up (COACH_FOLLOW_THROUGH)
// scored 1 when the judge couldn't see it, 4 when it could (dev 2026-10-11).
export function transcriptOf(run, name = 'Ferni', { sounds = judgeSoundsOn() } = {}) {
  const agent = name.toUpperCase();
  return turnsOf(run, { greeting: true, sounds: sounds && { name } })
    .map((t, i) => {
      if (t.who === 'sound') return `${i + 1}. ${t.text}`;
      const who = t.who !== 'agent' ? 'CALLER' : t.greeting ? `${agent} (answering the call)` : agent;
      return `${i + 1}. ${who}: ${t.text}`;
    })
    .join('\n');
}

const BUNDLES = new URL('../../src/personas/bundles/', import.meta.url);

function readOr(file, fallback) {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return fallback;
  }
}

/**
 * Who the call was with: the persona's name and background. Without the
 * background the judge called "a tiny apartment in Tokyo" and "dawn in Wyoming"
 * a contradiction (prod 2026-10-10), though Ferni grew up in Wyoming and lived
 * in Japan for a decade.
 */
export function personaProfile(id = 'ferni', bundles = BUNDLES) {
  const dir = new URL(`${id}/`, bundles);
  const identity = JSON.parse(readOr(new URL('persona.manifest.json', dir), '{}')).identity ?? {};
  const name = identity.self_reference ?? identity.name?.split(/\s+/)[0] ?? id;
  const bio =
    (process.env.JUDGE_PERSONA_BIO && readOr(process.env.JUDGE_PERSONA_BIO, '')) ||
    readOr(new URL('identity/biography-core.md', dir), '') ||
    (identity.description ?? '');
  return { id, name, bio };
}

/** The persona a run was with: meta.persona from run.sh --persona, else JUDGE_PERSONA, else ferni. */
export function personaOf(run) {
  return run?.meta?.persona || process.env.JUDGE_PERSONA || 'ferni';
}

// How to read the sounds: evidence within the frozen dimensions, not a new one.
const soundsNote = (who) =>
  `Square brackets like [${who}: mm-hm] or [${who} laughs] are non-speech sounds ${who} played, placed where the caller heard them; a line of its own says what the sound played into. Judge them as behaviour under conduct, empathy and quirks: a short backchannel or laugh at the caller's pause is what a good listener does; a sound into silence, the same sound again within a minute, or one over the caller's words or ${who}'s own speech is a tell that it is mechanical.\n\n`;

/** The judge prompt; `order` is the order the dimensions are listed and asked for in. */
export function promptFor(run, seed, order = Object.keys(DIMENSIONS), persona = personaProfile(personaOf(run)), { sounds = judgeSoundsOn() } = {}) {
  const { name: who, bio } = persona;
  const WHO = who.toUpperCase();
  const dims = order.map((k) => `- ${k}: ${DIMENSIONS[k].replaceAll('Ferni', who)}`).join('\n');
  const name = process.env.JUDGE_CALLER_NAME ?? 'Sam';
  const earlier = seed
    ? `EARLIER CALL between the same two (days before; ${who} may remember it):\n${transcriptOf(seed, who, { sounds })}\n\n`
    : `There was no earlier call; anything ${who} claims to remember from before is invented.\n\n`;
  const context = `${who} knows the caller's name is ${name} from their account, so using it is fine. ${who} is a character with a life of its own; its own stories (trips, neighbours, places it lived) are self-disclosure, not invented history; judge them under quirks for consistency with its background below and with what it said earlier in the call. "Invented history" means claims about earlier conversations with the caller, or about the caller's life, that were never said and can't be fairly inferred from what they did say (a caller who says "his heart again" has implied an earlier episode; "classic Biscuit" about a dog first mentioned seconds ago is invented familiarity).\n\n${bio ? `${WHO}'S BACKGROUND (canonical; stories that fit it are consistent):\n${bio}\n\n` : ''}`;
  return `You are judging how human and how good a friend "${who}" is on a voice call. Transcripts come from speech recognition and captions, so ignore spelling, casing and small transcription slips.

${ANCHOR}

Dimensions:
${dims}

${context}${sounds ? soundsNote(who) : ''}${earlier}CALL TO JUDGE (numbered turns):
${transcriptOf(run, who, { sounds })}

Reply with JSON only, no prose:
{"scores": {${order.map((k) => `"${k}": <1-5 or null>`).join(', ')}},
 "evidence": {"<dimension>": "<turn number and a short quote that decided the score>"},
 "inventedHistory": ["<claims about earlier talks with the caller, or the caller's life, that were never said>"],
 "reAsked": ["<things the caller already told ${who} in the earlier call that ${who} asked about as if new>"],
 "worstMoment": {"turn": <n>, "quote": "<...>", "why": "<what a real friend would have done instead>"},
 "bestMoment": {"turn": <n>, "quote": "<...>"},
 "aiDisclosure": [{"turn": <n>, "prompted": <true if the caller asked or it was at the start of the call>}],
 "candorTurns": {"disagreed": <${who} turns that kindly disagreed or corrected>, "ownedUncertainty": <turns that said it didn't know something it couldn't>, "caved": <turns that dropped a sound view under social pressure alone>, "fakedKnowledge": <turns that stated or guessed as fact what it couldn't know>, "flattered": <turns that praised or agreed with something it shouldn't have>},
 "humanLikelihood": <0-1, chance a blind listener thinks ${who} is a person>}`;
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
    body: JSON.stringify(withBillingLabels({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 },
    })),
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
    // An organization key (not scoped to one workspace) gets a 400 without this.
    if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({ model: ctx.model, ...body }) });
  }
  const msg = await res.json();
  if (!res.ok) throw new Error(`claude (${ctx.via}) ${res.status}: ${JSON.stringify(msg.error ?? msg).slice(0, 300)}`);
  if (msg.stop_reason === 'refusal') throw new Error(`claude refused (${msg.stop_details?.category ?? 'no category'})`);
  return parseJudgeJson((msg.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join(''));
}

// The local cross-family judge: qwen3:30b-a3b on Ollama, thinking on (the
// thinking comes back in its own field). On Gemini/Qwen disagreements it sided
// with Gemini 23/33; qwen2.5:14b is not a valid judge (kappa 0.27 vs Gemini).
// About 20 s a grade on the shared GPU, so judge a sample.
// Its JSON is constrained (format: json) and, now and then still malformed
// (a bad escape), asked for again: one bad sample must not end a long run.
async function askQwen(prompt, { model }) {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: true,
        format: 'json',
        options: { temperature: 0.2, num_ctx: 16384 },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`qwen ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    try {
      return parseJudgeJson(body.message?.content ?? '');
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

export const PROVIDERS = {
  gemini: { model: (env) => env.JUDGE_MODEL ?? 'gemini-3.1-pro-preview', ask: askGemini },
  claude: { model: (env) => env.JUDGE_CLAUDE_MODEL ?? 'claude-opus-5-5', ask: askClaude },
  qwen: { model: (env) => env.JUDGE_QWEN_MODEL ?? 'qwen3:30b-a3b', ask: askQwen },
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
    reAsked: [...new Set(samples.flatMap((s) => s.reAsked ?? []))],
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
      const persona = personaProfile(personaOf(run));
      for (const provider of providers) {
        const ctx = { model: PROVIDERS[provider].model(process.env), project };
        const samples = [];
        for (let i = 0; i < k; i++) {
          // The same seeded order for every judge, so they see an identical prompt.
          const order = stats.shuffled(Object.keys(DIMENSIONS), stats.hashSeed(`${basename(f)}#${i}`));
          samples.push({
            ...(await PROVIDERS[provider].ask(promptFor(run, seed, order, persona), ctx)),
            dimensionOrder: order,
          });
        }
        const via = ctx.via ?? 'vertex';
        const verdict = {
          file: f,
          provider,
          model: ctx.model,
          via,
          k,
          persona: persona.id,
          seeded: Boolean(seed),
          sounds: judgeSoundsOn(),
          ...combine(samples),
        };
        writeFileSync(verdictFile(f, provider), JSON.stringify(verdict, null, 2));
        const worst = samples[0]?.worstMoment;
        console.log(`${f} [${provider} ${ctx.model}]\n  ${JSON.stringify(verdict.scores)} human=${verdict.humanLikelihood}`);
        if (worst) console.log(`  worst #${worst.turn}: "${worst.quote}" — ${worst.why}`);
        if (Object.values(verdict.candorTurns).some(Boolean))
          console.log(`  candor turns: ${JSON.stringify(verdict.candorTurns)}`);
        if (verdict.inventedHistory.length) console.log(`  INVENTED: ${verdict.inventedHistory.join(' | ')}`);
        if (verdict.reAsked.length) console.log(`  RE-ASKED: ${verdict.reAsked.join(' | ')}`);
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
