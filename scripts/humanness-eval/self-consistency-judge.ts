/**
 * Scores self-consistency.ts runs: does Ferni contradict his canon or himself
 * across calls, and does his life move on between them? Manual tool.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/humanness-eval/self-consistency-judge.ts \
 *     <out-dir> --arm <label> [--qwen 8]
 *
 * Three checks per reply. A contradiction checker in code (canon slots: age,
 * hometown, siblings, Japan, wife), deliberately not shared with the code
 * under test. A Gemini judge (JUDGE_MODEL, default flash; pro for Pro)
 * reading the canon, everything he said on earlier calls and this call,
 * NLI-style: a claim contradicts only when both can't be true given the days
 * between (finishing a book he was reading is life moving on, not a
 * contradiction). And with --qwen N, the same prompt to qwen3:30b-a3b on
 * local Ollama for N calls (GPU is shared), with agreement on those.
 * Verdicts are cached next to the runs (<run>.judge-<provider>.json).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { judgeModel } from '../lib/judge-model.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { arm: { type: 'string' }, qwen: { type: 'string', default: '0' } },
});
const dir = positionals[0];
if (!dir || !values.arm) throw new Error('usage: self-consistency-judge.ts <dir> --arm <label>');

interface Turn {
  caller: string;
  ferni: string;
  probe?: string;
}
interface Run {
  caller: string;
  calls: Array<{ day: number; turns: Turn[] }>;
}
interface Verdict {
  n: number;
  about_self: boolean;
  canon: string;
  self: string;
  new_detail: boolean;
}

const bundle = 'src/personas/bundles/ferni/identity';
const read = (f: string): string => readFileSync(`${bundle}/${f}`, 'utf8');
const CANON = [
  read('character.md').split('## How you are')[0],
  read('character-own-life.md').split('\n\n')[1],
  read('biography-core.md'),
].join('\n\n');

/** Canon slots in code: a reply stating one of these differently contradicts the bundle. */
const SLOTS: Array<[string, RegExp]> = [
  [
    'age',
    /\bI(?:'m| am) (?!fifty-seven|57)(?:(?:twenty|thirty|forty|fifty|sixty|seventy)(?:-\w+)?|\d{2})\b(?! (?:minutes|years? (?:in|ago|since)|percent))/i,
  ],
  ['hometown', /\bI grew up (?:back |out )?(?:in|on|outside) (?!wyoming|a\b|the\b|big)(\w+)/i],
  [
    'siblings',
    /\b(?:only child|(?:two|three|four|five|eight|nine) (?:siblings|brothers and sisters))\b/i,
  ],
  ['japan', /\b(?:a (?:couple|few) (?:of )?years|(?:one|two|three|four) years) in Japan\b/i],
  [
    'wife',
    /\b(?:I'm|I am) (?:single|divorced|not married|a widower)\b|\bmy (?:ex-wife|girlfriend|husband)\b/i,
  ],
];
export const slotConflicts = (text: string): string[] =>
  SLOTS.filter(([, re]) => re.test(text)).map(([slot]) => slot);

const PROMPT = (run: Run, k: number): string => {
  const earlier = run.calls
    .slice(0, k)
    .map(
      (c, j) =>
        `Call ${j + 1} (day ${c.day}):\n${c.turns.map((t) => `  Caller: ${t.caller}\n  Ferni: ${t.ferni}`).join('\n')}`
    )
    .join('\n');
  const call = run.calls[k];
  const now = call.turns
    .map((t, i) => `${i + 1}. Caller: ${t.caller}\n   Ferni: ${t.ferni}`)
    .join('\n');
  return `You check whether a character's story hangs together across phone calls with the same friend.

CANON (who Ferni is; anything here is true):
"""
${CANON.trim()}
"""

EARLIER CALLS (what Ferni already told this friend):
${earlier || '(none: this is the first call)'}

THIS CALL (day ${call.day}):
${now}

For each numbered Ferni reply in THIS CALL, judge:
- about_self: he states something about his own life (events, plans, people, pets, things he owns, his past, his age). Questions and reactions to the caller are not.
- canon: if a statement cannot be true together with the CANON (a different age, hometown, number of siblings, time in Japan, not married...), quote his words; else "". Things the canon doesn't mention are fine.
- self: if a statement cannot be true together with something he said earlier (earlier calls or earlier in this call), given the days between, quote both ("now" vs "earlier"); else "". Life moving on is fine: finishing the book he was reading, a plan that changed and he says so. A contradiction is a different version of the same thing (a different book than the one he said, a dog he said he doesn't have, something presented as new or still ahead that he already said was done or decided otherwise), or claiming he told them something he never did.
- new_detail: he mentions something in his life that he hadn't told them before (not a repeat of an earlier detail).

Reply as JSON only: {"replies":[{"n":1,"about_self":false,"canon":"","self":"","new_detail":false}, ...]} with one entry per Ferni reply.`;
};

const parse = (text: string): Verdict[] => {
  const [s, e] = [text.indexOf('{'), text.lastIndexOf('}')];
  return (JSON.parse(text.slice(s, e + 1)) as { replies: Verdict[] }).replies;
};

async function askGemini(prompt: string): Promise<Verdict[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const model = judgeModel();
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  for (let attempt = 0; ; attempt++) {
    const token = execFileSync('gcloud', ['auth', 'print-access-token']).toString().trim();
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
        },
      }),
    });
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    try {
      return parse(text);
    } catch (error) {
      if (attempt >= 3) throw new Error(`gemini judge ${res.status}: ${String(error)}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

/**
 * qwen3:30b-a3b on local Ollama, thinking on, JSON constrained, retried on bad
 * JSON. Through curl: on the shared GPU a request can wait in Ollama's queue
 * past fetch's five-minute limit for response headers.
 */
async function askQwen(prompt: string): Promise<Verdict[]> {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const body = JSON.stringify({
    model: process.env.JUDGE_QWEN_MODEL ?? 'qwen3:30b-a3b',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: true,
    format: 'json',
    options: { temperature: 0.2, num_ctx: 16384 },
  });
  for (let attempt = 0; ; attempt++) {
    const out = await new Promise<string>((resolve, reject) => {
      const curl = execFile(
        'curl',
        [
          '-s',
          '--max-time',
          '3600',
          '-H',
          'Content-Type: application/json',
          '--data-binary',
          '@-',
          `${host}/api/chat`,
        ],
        { maxBuffer: 1 << 24 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      );
      curl.stdin?.end(body);
    });
    try {
      return parse((JSON.parse(out) as { message?: { content?: string } }).message?.content ?? '');
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}

/**
 * One cache object per file, read once: the workers judge several calls of a
 * run at once, and reading the file per call lost verdicts written meanwhile.
 */
const caches = new Map<string, Record<string, Verdict[]>>();
async function judged(file: string, provider: 'gemini' | 'qwen', run: Run, k: number) {
  const cache = file.replace(/\.json$/, `.judge-${provider}.json`);
  let all = caches.get(cache);
  if (!all) {
    all = existsSync(cache)
      ? (JSON.parse(readFileSync(cache, 'utf8')) as Record<string, Verdict[]>)
      : {};
    caches.set(cache, all);
  }
  if (!all[k]) {
    all[k] = await (provider === 'gemini' ? askGemini : askQwen)(PROMPT(run, k));
    writeFileSync(cache, JSON.stringify(all, null, 2));
  }
  return all[k];
}

const files = readdirSync(dir)
  .filter((f) => f.startsWith(`${values.arm}-`) && /^[^.]+\.json$/.test(f))
  .map((f) => `${dir}/${f}`);
const runs = files.map((f) => ({ file: f, run: JSON.parse(readFileSync(f, 'utf8')) as Run }));
const jobs = runs.flatMap(({ file, run }) => run.calls.map((_, k) => ({ file, run, k })));

const tally = { replies: 0, self: 0, canonJ: 0, selfJ: 0, anyJ: 0, slot: 0, lmo: 0, lmoNew: 0 };
const byProbe: Record<string, { n: number; bad: number }> = {};
const examples: string[] = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { file, run, k } = job;
      const verdicts = await judged(file, 'gemini', run, k);
      run.calls[k].turns.forEach((t, i) => {
        const v = verdicts.find((x) => x.n === i + 1);
        tally.replies++;
        const slots = slotConflicts(t.ferni);
        if (slots.length) {
          tally.slot++;
          examples.push(`[slot ${slots}] ${run.caller} c${k + 1}: ${t.ferni}`);
        }
        if (!v?.about_self) return;
        tally.self++;
        const bad = Boolean(v.canon) || (k > 0 || i > 0 ? Boolean(v.self) : false);
        if (v.canon) tally.canonJ++;
        if (v.self) tally.selfJ++;
        if (bad) {
          tally.anyJ++;
          examples.push(
            `[${v.canon ? 'canon' : 'self'}] ${run.caller} c${k + 1} ${t.probe ?? ''}: ${v.canon || v.self}`
          );
        }
        const p = (byProbe[t.probe ?? 'unprompted'] ??= { n: 0, bad: 0 });
        p.n++;
        if (bad) p.bad++;
        if (k > 0 && (t.probe === 'weekend' || t.probe === 'since')) {
          tally.lmo++;
          if (v.new_detail) tally.lmoNew++;
        }
      });
    }
  })
);

// Cross-family check on a sample: the same prompt to qwen, agreement on "any contradiction".
const sample = jobs
  .filter((j) => j.k > 0)
  .filter((_, i, a) => i % Math.max(1, Math.floor(a.length / Number(values.qwen))) === 0)
  .slice(0, Number(values.qwen));
let agree = 0;
let pairs = 0;
let qwenBad = 0;
for (const { file, run, k } of sample) {
  const [g, q] = [await judged(file, 'gemini', run, k), await judged(file, 'qwen', run, k)];
  for (const v of g) {
    const w = q.find((x) => x.n === v.n);
    if (!w || !(v.about_self || w.about_self)) continue;
    const [gb, qb] = [Boolean(v.canon || v.self), Boolean(w.canon || w.self)];
    pairs++;
    if (gb === qb) agree++;
    if (qb) qwenBad++;
  }
}

const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
console.log(
  JSON.stringify(
    {
      arm: values.arm,
      runs: runs.length,
      replies: tally.replies,
      selfClaimReplies: tally.self,
      contradictionRate: pct(tally.anyJ, tally.self),
      canonContradictions: tally.canonJ,
      selfContradictions: tally.selfJ,
      slotCheckerHits: tally.slot,
      lifeMovesOn: `${tally.lmoNew}/${tally.lmo} weekend/since replies with something new`,
      byProbe: Object.fromEntries(Object.entries(byProbe).map(([p, v]) => [p, `${v.bad}/${v.n}`])),
      qwen: pairs
        ? { calls: sample.length, pairs, agreement: pct(agree, pairs), qwenContradictions: qwenBad }
        : undefined,
    },
    null,
    2
  )
);
console.log(examples.join('\n'));
