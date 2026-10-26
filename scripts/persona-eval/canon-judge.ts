/**
 * Does a persona play its script, or write a new one? Scores every life claim
 * a persona makes against its bible, and when and why it talks about itself.
 * Manual tool: calls Vertex AI (Gemini judge, JUDGE_MODEL, default
 * flash; pro for Pro).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/canon-judge.ts \
 *     <run-dir> [<run-dir> ...] [--persona ferni] [--out summary.json]
 *
 * Reads first-call simulator runs ({lines:[{who,text}]}), self-consistency runs
 * ({calls:[{turns:[{caller,ferni}]}]}) and voice-eval runs ({turns:[{role,text}]}).
 * The bible is the persona's identity files plus content/behaviors/backstory-dynamic.json.
 *
 * Each claim he makes about his own life is one of:
 *   canon        stated in the bible, or a plain restatement of it
 *   texture      a small present-day detail (this morning's coffee, the weather
 *                out his window, a song stuck in his head) that adds no history
 *   elaboration  a new specific inside a chapter the bible has (a named Wyoming
 *                creek, what his wife cooked); not in the script, but no new chapter
 *   invented     a new chapter: a person, job, event, place he lived, child, pet,
 *                illness or possession the bible doesn't have
 *   contradiction cannot be true together with the bible
 * Heavy beats (a death, grief, depression, being fired, his dad, a failed
 * relationship) are tagged with what invited them: asked, resonant (the caller
 * just shared something in that territory), or unprompted.
 * Verdicts are cached next to each run (<run>.canon.json).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { generate } from '../first-call-eval/vertex.js';
import { judgeModel } from '../lib/judge-model.mjs';

export type Kind = 'canon' | 'texture' | 'elaboration' | 'invented' | 'contradiction';
export interface Claim {
  reply: number;
  quote: string;
  kind: Kind;
  heavy: boolean;
  invited: 'asked' | 'resonant' | 'unprompted';
}
export interface Verdict {
  claims: Claim[];
  self_words: number[];
}
export interface Call {
  file: string;
  index: number;
  turns: Array<{ caller: string; persona: string }>;
}

const MARKUP = /<[^>]+>|\[[a-z ]+\]/gi;
const clean = (t: string): string => t.replace(MARKUP, ' ').replace(/\s+/g, ' ').trim();
export const words = (t: string): number => clean(t).split(' ').filter(Boolean).length;

/** Every call in a run file, as caller/persona turn pairs (an opening greeting has caller ''). */
export function callsIn(file: string, json: unknown): Call[] {
  const j = json as Record<string, unknown>;
  const pairs = (lines: Array<{ who: string; text: string }>): Call['turns'] => {
    const out: Call['turns'] = [];
    let caller = '';
    for (const l of lines) {
      if (l.who === 'user') caller = caller ? `${caller} ${l.text}` : l.text;
      else {
        out.push({ caller, persona: clean(l.text) });
        caller = '';
      }
    }
    return out;
  };
  if (Array.isArray(j.lines)) return [{ file, index: 0, turns: pairs(j.lines as never) }];
  if (Array.isArray(j.calls))
    return (j.calls as Array<{ turns: Array<{ caller: string; ferni: string }> }>).map((c, i) => ({
      file,
      index: i,
      turns: c.turns.map((t) => ({ caller: t.caller, persona: clean(t.ferni) })),
    }));
  if (Array.isArray(j.turns))
    return [
      {
        file,
        index: 0,
        turns: pairs(
          (j.turns as Array<{ role: string; text: string }>).map((t) => ({
            who: t.role === 'user' ? 'user' : 'agent',
            text: t.text,
          }))
        ),
      },
    ];
  return [];
}

/** A persona's bible: its identity files and dynamic backstory. `repo` is the checkout root. */
export function bible(persona: string, repo = '.'): string {
  const root = join(repo, 'src/personas/bundles', persona);
  const parts: string[] = [];
  for (const f of [
    'identity/character.md',
    'identity/character-own-life.md',
    'identity/biography-core.md',
    'identity/biography.md',
    'content/behaviors/backstory-dynamic.json',
  ]) {
    const p = join(root, f);
    if (existsSync(p)) parts.push(`## ${f}\n${readFileSync(p, 'utf8')}`);
  }
  return parts.join('\n\n');
}

export function prompt(canon: string, earlier: Call[], call: Call): string {
  const told = earlier
    .map((c, k) => `Call ${k + 1}:\n${c.turns.map((t) => `  ${t.persona}`).join('\n')}`)
    .join('\n');
  const now = call.turns
    .map((t, i) => `${t.caller ? `Caller: ${t.caller}\n` : ''}${i + 1}. Persona: ${t.persona}`)
    .join('\n');
  return `You check whether a character in a phone call sticks to his written backstory (his bible) or makes up a new one.

BIBLE (everything here is true about him):
"""
${canon}
"""

WHAT HE SAID ON EARLIER CALLS WITH THIS CALLER:
${told || '(none: first call)'}

THIS CALL (numbered persona replies):
${now}

List every claim he makes about his OWN life in THIS CALL (his past, people, family, work, places, possessions, pets, health, habits, his day). Questions to the caller and reactions to them are not claims. For each claim:
- reply: the reply number
- quote: his words, short
- kind:
  "canon": the bible states it, or it is a plain restatement of something it states
  "texture": a small present-day detail of his day or a habit (coffee this morning, the rain outside, humming, can't find his glasses) that adds no life history and fits the bible
  "elaboration": a new specific detail inside something the bible already has (a particular Wyoming memory, a dish his wife made, a trail he walked in Japan), that the bible doesn't state but doesn't conflict with
  "invented": a new piece of life history the bible doesn't have: a job, a person, a family member, children, a pet, an event, a place he lived, an illness, a possession of note
  "contradiction": cannot be true together with the bible (different age, hometown, siblings, time in Japan, marital status, or a different version of a bible event)
  If he mentions something he told this caller on an earlier call, judge it against the bible like any other claim.
- heavy: true when it touches a heavy chapter (a death or grief, depression, being fired, his dad, a failed relationship or divorce, guilt about a loss)
- invited: "asked" if the caller had just asked about him, "resonant" if the caller had just shared something in the same territory (a loss, low mood, losing a job, a hard parent), else "unprompted"
Also give self_words: for each numbered reply, about how many of its words are about his own life (0 if none).

Reply as JSON only: {"claims":[{"reply":1,"quote":"","kind":"canon","heavy":false,"invited":"unprompted"}],"self_words":[0, ...]}`;
}

export function parseVerdict(text: string, replies: number): Verdict {
  const [s, e] = [text.indexOf('{'), text.lastIndexOf('}')];
  const v = JSON.parse(text.slice(s, e + 1)) as Verdict;
  const sw = Array.isArray(v.self_words) ? v.self_words.map(Number) : [];
  return {
    claims: (v.claims ?? []).filter((c) => c && c.kind),
    self_words: Array.from({ length: replies }, (_, i) => sw[i] || 0),
  };
}

async function judge(canon: string, earlier: Call[], call: Call): Promise<Verdict> {
  const model = judgeModel();
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt));
    const text = await generate({
      model,
      system: 'You are a careful script supervisor. Reply with JSON only.',
      contents: [{ role: 'user', parts: [{ text: prompt(canon, earlier, call) }] }],
      temperature: 0,
      // Thinking counts against this; 8k truncated the JSON on long calls.
      maxOutputTokens: 32768,
      json: true,
    });
    try {
      return parseVerdict(text, call.turns.length);
    } catch {
      /* retry */
    }
  }
  throw new Error(`judge failed on ${call.file}#${call.index}`);
}

export interface Summary {
  calls: number;
  replies: number;
  claims: Record<Kind, number>;
  callsWith: { invented: number; contradiction: number; inventedOrContradiction: number };
  firstCall: { calls: number; inventedOrContradiction: number };
  repeatCalls: { calls: number; inventedOrContradiction: number };
  selfReplyShare: number;
  selfWordShare: number;
  heavy: { total: number; asked: number; resonant: number; unprompted: number; firstCall: number };
  firstHeavyReply: number[];
}

export function summarize(items: Array<{ call: Call; v: Verdict }>): Summary {
  const kinds: Record<Kind, number> = {
    canon: 0,
    texture: 0,
    elaboration: 0,
    invented: 0,
    contradiction: 0,
  };
  const s: Summary = {
    calls: items.length,
    replies: 0,
    claims: kinds,
    callsWith: { invented: 0, contradiction: 0, inventedOrContradiction: 0 },
    firstCall: { calls: 0, inventedOrContradiction: 0 },
    repeatCalls: { calls: 0, inventedOrContradiction: 0 },
    selfReplyShare: 0,
    selfWordShare: 0,
    heavy: { total: 0, asked: 0, resonant: 0, unprompted: 0, firstCall: 0 },
    firstHeavyReply: [],
  };
  let selfReplies = 0;
  let selfWords = 0;
  let allWords = 0;
  for (const { call, v } of items) {
    s.replies += call.turns.length;
    for (const c of v.claims) if (c.kind in kinds) kinds[c.kind]++;
    const inv = v.claims.some((c) => c.kind === 'invented');
    const con = v.claims.some((c) => c.kind === 'contradiction');
    if (inv) s.callsWith.invented++;
    if (con) s.callsWith.contradiction++;
    const bucket = call.index === 0 ? s.firstCall : s.repeatCalls;
    bucket.calls++;
    if (inv || con) {
      s.callsWith.inventedOrContradiction++;
      bucket.inventedOrContradiction++;
    }
    call.turns.forEach((t, i) => {
      allWords += words(t.persona);
      selfWords += Math.min(v.self_words[i] ?? 0, words(t.persona));
      if ((v.self_words[i] ?? 0) > 0) selfReplies++;
    });
    const heavy = v.claims.filter((c) => c.heavy);
    const seen = new Set<number>();
    for (const c of heavy) {
      if (seen.has(c.reply)) continue;
      seen.add(c.reply);
      s.heavy.total++;
      s.heavy[c.invited] = (s.heavy[c.invited] ?? 0) + 1;
      if (call.index === 0) s.heavy.firstCall++;
    }
    if (heavy.length) s.firstHeavyReply.push(Math.min(...heavy.map((c) => c.reply)));
  }
  s.selfReplyShare = s.replies ? selfReplies / s.replies : 0;
  s.selfWordShare = allWords ? selfWords / allWords : 0;
  return s;
}

function runFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !/\.(judge|canon|score|seed)\b|judge-/.test(f))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      persona: { type: 'string', default: 'ferni' },
      out: { type: 'string' },
      concurrency: { type: 'string', default: '6' },
    },
  });
  const canon = bible(values.persona ?? 'ferni');
  const jobs: Array<() => Promise<{ call: Call; v: Verdict }>> = [];
  for (const dir of positionals)
    for (const file of runFiles(dir)) {
      const calls = callsIn(file, JSON.parse(readFileSync(file, 'utf8')));
      if (!calls.length) continue;
      const cache = file.replace(/\.json$/, '.canon.json');
      const cached: Verdict[] = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : [];
      const results: Verdict[] = [...cached];
      calls.forEach((call, k) =>
        jobs.push(async () => {
          const v = cached[k] ?? (await judge(canon, calls.slice(0, k), call));
          results[k] = v;
          if (results.filter(Boolean).length === calls.length)
            writeFileSync(cache, JSON.stringify(results, null, 1));
          return { call, v };
        })
      );
    }
  const items: Array<{ call: Call; v: Verdict }> = [];
  const n = Number(values.concurrency);
  for (let i = 0; i < jobs.length; i += n)
    items.push(...(await Promise.all(jobs.slice(i, i + n).map((j) => j()))));
  const summary = summarize(items);
  const examples = items.flatMap(({ call, v }) =>
    v.claims
      .filter((c) => c.kind === 'invented' || c.kind === 'contradiction')
      .map((c) => `${c.kind} ${call.file.split('/').slice(-2).join('/')}#${call.index}: ${c.quote}`)
  );
  console.log(JSON.stringify(summary, null, 1));
  if (values.out) writeFileSync(values.out, JSON.stringify({ summary, examples }, null, 1));
}

if (process.argv[1]?.endsWith('canon-judge.ts')) await main();
