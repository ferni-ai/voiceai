#!/usr/bin/env node
// Ask-when-unclear eval, step 2: score generate.ts output per group, per arm.
//
// usage: GOOGLE_CLOUD_PROJECT=<p> node scripts/voice-eval/ask-when-unclear/score.mjs \
//          [--qwen-every 3] [--cache judged.jsonl] [--out results.json] out-off.json out-repair.json out-ask.json
//
// Three readings of every reply:
//   code    regexes: did he ask a short clarifying question (garbled/ambiguous),
//           did he ask one he didn't need (clear), did he take the corrected
//           fact without the wrong one or a grovel (repair)
//   gemini  JUDGE_MODEL (default flash; pro for Pro) on every reply
//   qwen    local qwen3:30b-a3b (ollama) on sample 0 of each case, a
//           cross-family check on the Gemini judge (the GPU is shared:
//           --qwen-every N judges only every Nth case; 0 turns it off)
// --cache keeps every verdict as it lands (judge, reply, case): a rerun, or a
// later qwen-only pass, judges only what it hasn't seen.
// Pass rates are per case (mean over samples), with a 95% bootstrap CI over
// cases; each arm after the first also gets its paired difference from the
// first arm, with a CI. Group "clear" is the control: he must not ask there.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { judgeModel } from '../../lib/judge-model.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'qwen-every': { type: 'string', default: '1' },
    cache: { type: 'string' },
    out: { type: 'string' },
  },
});
const here = dirname(fileURLToPath(import.meta.url));
const cases = new Map(
  readFileSync(join(here, 'fixtures', 'cases.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .map((c) => [c.id, c])
);

/** A check-in: "did you say", "do you mean", "X, right?", "A or B?", "sorry, what?". */
const CLARIFY =
  /\b(?:did you (?:just )?(?:say|mean)|do you mean|you mean\b|meaning\b|which (?:one|of|song|thing|show)|who do you mean|what do you mean|sorry,? (?:what|who|did|you|say)|come again|say that again|didn'?t (?:quite )?(?:catch|get) (?:that|it)|missed that|lost you|cut out|wait,? (?:what|who|did))|, right\?|\bor (?:the|your|is it|was it|did)\b[^?]{0,60}\?/i;
const GROVEL = /\b(?:i apologi[sz]e|my apologies|so sorry|i'?m really sorry|sorry, sorry)\b/i;

export function codeCheck(c, reply) {
  const words = reply.split(/\s+/).filter(Boolean).length;
  const asked = reply.includes('?') && CLARIFY.test(reply);
  if (c.group === 'clear') return { asked, pass: !asked };
  if (c.group === 'repair') {
    const fixed = new RegExp(`\\b(?:${c.fix})`, 'i').test(reply);
    // The wrong fact may be named only to set it aside ("not Thursday").
    const wrong = reply.replace(new RegExp(`\\bnot ${c.wrong}`, 'gi'), '');
    const repeated = new RegExp(`\\b${c.wrong}`, 'i').test(wrong);
    return { asked, pass: fixed && !repeated && !GROVEL.test(reply) && words <= 45 };
  }
  // Garbled and ambiguous: one short check-in. "either" cases may also just answer.
  const shortAsk = asked && words <= 30 && (reply.match(/\?/g) ?? []).length <= 2;
  return { asked, pass: c.expect === 'either' ? true : shortAsk };
}

const RUBRIC = {
  garbled: (c) =>
    `The caller's words came through phone speech-to-text and may be misheard. What they most likely meant: ${c.likely}. PASS if Ferni either checks what they said in one short, natural question (best: offering his guess, like "Sorry, did you say X?"), or clearly answers the likely meaning without inventing anything. FAIL if he answers the garbled words literally as though they made sense, makes up a meaning, changes the subject, or asks a long or multi-part clarification.`,
  ambiguous: (c) =>
    `The caller's request is ambiguous: ${c.likely}. PASS if Ferni checks in one short question before acting (best: guessing the likely one, like "Your mom, right?", or offering the two options). FAIL if he picks one and acts or says he will without checking, ignores the ambiguity, or asks several questions.`,
  clear: () =>
    `The caller's turn is clear. PASS if Ferni responds to it naturally without a clarification he doesn't need; an ordinary follow-up question about the topic is fine. FAIL if he asks them to repeat, asks who or what they meant, or checks something that was already clear.`,
  repair: (c) =>
    `Ferni had it wrong (${c.wrong}) and the caller is correcting him (${c.fix.split('|')[0]}). PASS if he takes the correction in stride: uses the corrected fact, owns it in a few words at most, and carries on. FAIL if he repeats the wrong fact, ignores or argues with the correction, apologizes at length, or makes a big deal of it.`,
};

function judgePrompt(c, reply) {
  const call = c.history.map(([who, text]) => `${who === 'ferni' ? 'Ferni' : 'Caller'}: ${text}`);
  return [
    'You are rating one reply from Ferni, an AI friend on a phone call. Judge only the rule below.',
    '',
    'Call so far:',
    ...call,
    `Caller (as speech-to-text heard it): ${c.said}`,
    `Ferni's reply: ${reply}`,
    '',
    `Rule: ${RUBRIC[c.group](c)}`,
    '',
    'Also say whether the reply asks the caller to clarify or confirm what they said or meant.',
    'Answer with JSON only: {"pass": true|false, "asked": true|false, "reason": "<one short sentence>"}',
  ].join('\n');
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
const JUDGE_MODEL = judgeModel();
let token = '';
const parse = (text) => {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m?.[0] ?? '');
    return typeof j.pass === 'boolean'
      ? { pass: j.pass, asked: Boolean(j.asked), reason: j.reason }
      : null;
  } catch {
    return null;
  }
};

async function askGemini(prompt) {
  token ||= execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
    .toString()
    .trim();
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${JUDGE_MODEL}:generateContent`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }).catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      const verdict = parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''));
      if (verdict) return verdict;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}

async function askQwen(prompt) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen3:30b-a3b',
      stream: false,
      think: false,
      format: 'json',
      options: { temperature: 0 },
      messages: [{ role: 'user', content: prompt }],
    }),
  }).catch(() => null);
  return res?.ok ? parse((await res.json()).message?.content) : null;
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) await fn(it);
    })
  );
}

/** Mean and 95% bootstrap CI over cases of per-case values. */
function ci(perCase, iters = 4000) {
  const xs = [...perCase.values()];
  if (xs.length === 0) return { mean: null, lo: null, hi: null, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const means = Array.from({ length: iters }, () => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)];
    return s / xs.length;
  }).sort((a, b) => a - b);
  return {
    mean,
    lo: means[Math.floor(iters * 0.025)],
    hi: means[Math.floor(iters * 0.975)],
    n: xs.length,
  };
}

const perCase = (rows, key, group) => {
  const by = new Map();
  for (const r of rows.filter((x) => x.group === group && x[key] != null)) {
    const v = by.get(r.id) ?? [];
    v.push(r[key] ? 1 : 0);
    by.set(r.id, v);
  }
  return new Map([...by].map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]));
};

const qwenEvery = Number(values['qwen-every']);
const cache = new Map(
  values.cache && existsSync(values.cache)
    ? readFileSync(values.cache, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .map((e) => [e.key, e.verdict])
    : []
);
/** A judge's verdict on this reply to this case, from the cache or asked now. */
async function judged(judge, ask, r) {
  const key = `${judge}|${r.id}|${r.reply}`;
  if (cache.has(key)) return cache.get(key);
  const verdict = await ask(judgePrompt(cases.get(r.id), r.reply));
  if (verdict && values.cache)
    appendFileSync(values.cache, `${JSON.stringify({ key, verdict })}\n`);
  return verdict;
}
const arms = [];
for (const file of positionals) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const rows = run.replies.map((r) => ({ ...r, ...codeCheckRow(r) }));
  await pool(rows, 8, async (r) => {
    const v = await judged('gemini', askGemini, r);
    r.gemini = v?.pass ?? null;
    r.geminiAsked = v?.asked ?? null;
    r.geminiReason = v?.reason ?? null;
  });
  const ids = [...cases.keys()];
  const qwenRows = rows.filter(
    (r) => qwenEvery > 0 && r.sample === 0 && ids.indexOf(r.id) % qwenEvery === 0
  );
  await pool(qwenRows, 1, async (r) => {
    const v = await judged('qwen', askQwen, r);
    r.qwen = v?.pass ?? null;
  });
  arms.push({ arm: run.arm, rows });
  console.error(`${run.arm}: ${rows.length} replies judged, qwen on ${qwenRows.length}`);
}

function codeCheckRow(r) {
  const { asked, pass } = codeCheck(cases.get(r.id), r.reply || '');
  return {
    code: pass,
    codeAsked: asked,
    words: (r.reply || '').split(/\s+/).filter(Boolean).length,
  };
}

const pct = (x) => (x === null ? '  -  ' : `${Math.round(x * 100)}%`.padStart(4));
const fmt = (s) => `${pct(s.mean)} [${pct(s.lo)},${pct(s.hi)}]`;
const results = {};
console.log(
  '| group | arm | judge (gemini) | code | asked (code) | qwen (sample) | Δ judge vs first arm |'
);
console.log('|---|---|---|---|---|---|---|');
for (const group of ['garbled', 'ambiguous', 'clear', 'repair']) {
  const base = perCase(arms[0].rows, 'gemini', group);
  for (const { arm, rows } of arms) {
    const g = perCase(rows, 'gemini', group);
    const delta = new Map(
      [...g].filter(([id]) => base.has(id)).map(([id, v]) => [id, v - base.get(id)])
    );
    const s = {
      gemini: ci(g),
      code: ci(perCase(rows, 'code', group)),
      asked: ci(perCase(rows, 'codeAsked', group)),
      qwen: ci(perCase(rows, 'qwen', group)),
      delta: ci(delta),
    };
    results[`${group}/${arm}`] = s;
    const d = arm === arms[0].arm ? '' : `${s.delta.mean >= 0 ? '+' : ''}${fmt(s.delta)}`;
    console.log(
      `| ${group} | ${arm} | ${fmt(s.gemini)} | ${fmt(s.code)} | ${pct(s.asked.mean)} | ${pct(s.qwen.mean)} (n=${s.qwen.n}) | ${d} |`
    );
  }
}
// Judge agreement where both judged the same reply.
const both = arms.flatMap((a) => a.rows).filter((r) => r.qwen != null && r.gemini != null);
const agree = both.filter((r) => r.qwen === r.gemini).length;
console.log(`\ngemini/qwen agreement: ${agree}/${both.length}`);
if (values.out) writeFileSync(values.out, JSON.stringify({ results, arms }, null, 2));
