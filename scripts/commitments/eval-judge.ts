/**
 * Offline eval for the after-call commitment judge (COMMITMENT_SINGLE_WRITER):
 * the production prompt and parser (commitment-judge.ts) and the production
 * keep rule (judged-commitments.ts) over labelled lines, with the real model.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/commitments/eval-judge.ts [--provider=claude|default]
 *     [--only=real,junk,...] [--concurrency=6]
 *
 * claude (default): Claude directly, as CLAUDE_LLM_TASKS=memory routes it
 * (CLAUDE_LLM_MODEL, CLAUDE_LLM_EFFORT as in prod), so a failed call is
 * counted, never answered by Gemini (an organization key also needs
 * ANTHROPIC_WORKSPACE_ID). default: callLLM without a task, the Gemini path
 * (Vertex with ADC, GOOGLE_CLOUD_PROJECT). Each case is one call transcript:
 *
 * - real, junk, unresolved, ambiguous: one caller line after a neutral Ferni
 *   question. heldoutReal/heldoutJunk are the same, written after the prompt
 *   was fixed (the prompt's own examples are in no set). A real line must be stored (else a false reject); a junk line
 *   must not (else a false accept); an unresolved one ("call her tomorrow",
 *   no one named) must not either; ambiguous ones are reported, not scored.
 * - context: a short call whose stored statement must name the person or
 *   thing the pronoun meant and keep a run-on's meaning (pronoun accuracy);
 *   tails: a plan, then a goodbye. Items stored beyond those expected are
 *   false accepts.
 *
 * Targets (#1896's failures): false reject <= 2%, false accept <= 5%,
 * pronoun accuracy >= 90%.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeCallCommitments } from '../../src/intelligence/world-model/extraction/commitment-judge.js';
import { claudeText } from '../../src/services/llm/claude-text.js';
import { callLLM } from '../../src/services/llm-utils.js';
import {
  judgedCommitmentDocs,
  MIN_JUDGED_CONFIDENCE,
} from '../../src/services/superhuman/judged-commitments.js';

type Turn = { role: string; content: string };
type Call = { id: string; turns: Turn[]; expect: string[][][] };
const SINGLES = ['real', 'junk', 'heldoutReal', 'heldoutJunk', 'unresolved', 'ambiguous'] as const;
type Cases = Record<(typeof SINGLES)[number], string[]> & { context: Call[]; tails: Call[] };

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, 'fixtures/judge-cases.json'), 'utf8')) as Cases;
const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const provider = arg('provider') ?? 'claude';
const only = arg('only')?.split(',');
const concurrency = Number(arg('concurrency')) || 6;

const STARTED = new Date('2026-10-17T19:00:00Z');
const CALL = { sessionId: 'eval', startedAt: STARTED, timezone: 'America/New_York' };
const CTX = { userId: 'eval', sessionId: 'eval', now: STARTED.getTime() + 1_800_000, timezone: CALL.timezone }; // prettier-ignore
const ASK = { role: 'assistant', content: "So what's the rest of your day look like?" };
let failures = 0;
let fallbacks = 0;

/** The production call options; a null answer is retried, then counted as a transport failure. */
async function llm(prompt: string): Promise<string | null> {
  const opts = { maxTokens: 2000, temperature: 0.1, timeout: 20_000 };
  for (let attempt = 0; attempt < 3; attempt++) {
    const reply = provider === 'claude' ? await claudeText(prompt, opts) : await callLLM(prompt, opts); // prettier-ignore
    if (reply) return reply;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  failures++;
  return null;
}

/** As register.ts: a Claude reply with no JSON is asked again on the Gemini path. */
async function gemini(prompt: string): Promise<string | null> {
  fallbacks++;
  return callLLM(prompt, { maxTokens: 2000, temperature: 0.1, timeout: 20_000 });
}

/** What production would store from this call: the judge's read, then the keep rule. */
async function stored(turns: Turn[]): Promise<string[]> {
  const judged = await judgeCallCommitments(turns, CALL, llm, provider === 'claude' ? gemini : undefined); // prettier-ignore
  return judgedCommitmentDocs(judged, CTX).map((d) => String(d.statement));
}

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const has = (s: string, groups: string[][]): boolean =>
  groups.every((g) => g.some((w) => s.toLowerCase().includes(w)));
const result: Record<string, { wrong: number; n: number; all: string[] }> = {};

for (const set of SINGLES.filter((x) => !only || only.includes(x))) {
  const reads = await pool(cases[set], async (line) => stored([ASK, { role: 'user', content: line }])); // prettier-ignore
  const shouldStore = set === 'real' || set === 'heldoutReal';
  const wrong = reads.filter((r, i) => {
    const bad = set !== 'ambiguous' && r.length > 0 !== shouldStore;
    if (bad || set === 'ambiguous') console.log(`  ${set} ${bad ? 'WRONG ' : ''}"${cases[set][i]}" -> ${JSON.stringify(r)}`); // prettier-ignore
    return bad;
  }).length;
  result[set] = { wrong, n: reads.length, all: reads.flat() };
  console.log(`${set}: ${wrong}/${reads.length} wrong (${pct(wrong, reads.length)})`);
}

for (const set of (['context', 'tails'] as const).filter((x) => !only || only.includes(x))) {
  const reads = await pool(cases[set], async (c) => stored(c.turns));
  let wrong = 0;
  let extra = 0;
  reads.forEach((r, i) => {
    const c = cases[set][i];
    const found = c.expect.filter((g) => r.some((s) => has(s, g))).length;
    if (found < c.expect.length) wrong++;
    extra += Math.max(0, r.length - found);
    console.log(`  ${set} ${found < c.expect.length || r.length > found ? 'WRONG ' : ''}${c.id} -> ${JSON.stringify(r)}`); // prettier-ignore
  });
  result[set] = { wrong, n: reads.length, all: [] };
  console.log(`${set}: ${reads.length - wrong}/${reads.length} calls right, ${extra} extra items stored`); // prettier-ignore
}

const said = [...(result.real?.all ?? []), ...(result.heldoutReal?.all ?? [])];
const firstPerson = said.filter((s) => /^(i|i'll|i'm|ill|imma|gonna|going to)\b/i.test(s));
console.log(`statements in first person: ${firstPerson.length}/${said.length}`);
console.log(`provider ${provider}, threshold ${MIN_JUDGED_CONFIDENCE}, transport failures ${failures}, Gemini fallbacks ${fallbacks}`); // prettier-ignore
const rate = (set: string): string => pct(result[set]?.wrong ?? 0, result[set]?.n ?? 0);
const right = (set: string): string => pct((result[set]?.n ?? 0) - (result[set]?.wrong ?? 0), result[set]?.n ?? 0); // prettier-ignore
console.log(`SUMMARY false reject ${rate('real')} / held-out ${rate('heldoutReal')} (target <= 2%); false accept ${rate('junk')} / held-out ${rate('heldoutJunk')} (target <= 5%); unresolved stored ${rate('unresolved')}; pronoun ${right('context')} (target >= 90%)`); // prettier-ignore
// Logger and store handles keep the process alive otherwise.
process.exit(failures > 0 ? 2 : 0);
