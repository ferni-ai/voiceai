/**
 * Before/after for CRISIS_AGREEMENT_GATE's attribution rules: every labelled
 * case read live twice (main's prompt, then with CRISIS_ATTRIBUTION_RULES),
 * with Ferni's line and the caller's earlier lines as the reply gate sends
 * them, then decided as the gate would. Vertex AI, global endpoint, ADC.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/crisis-eval/attribution-eval.ts
 *
 * A positive is caught when the turn escalates (pattern match, or a read the
 * gate escalates); a negative is a false alarm when it does. "After" applies
 * agreementOutcome to a lone read, as the gate does with the flag on.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CRISIS_CONTEXTUAL } from '../../src/agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import { detectCrisis } from '../../src/agents/safety/crisis-guard.js';
import { agreementOutcome } from '../../src/services/safety/crisis-agreement.js';
import {
  crisisClassifierPrompt,
  CRISIS_CLASSIFIER_PROMPT,
  DEFAULT_CRISIS_CLASSIFIER_MODEL,
  parseClassifierReply,
  type CrisisVerdict,
} from '../../src/services/safety/crisis-classifier.js';
import { CRISIS_TEST_CASES } from '../../src/services/superhuman/validation/crisis-test-cases.js';

interface Case {
  text: string;
  label: string;
  kind: string;
  earlier?: string[];
  companion?: string;
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${DEFAULT_CRISIS_CLASSIFIER_MODEL}:generateContent`;
let errors = 0;
const AFTER = crisisClassifierPrompt({ CRISIS_AGREEMENT_GATE: 'on' });
const REPS = Number(process.env.CRISIS_EVAL_REPS) || 1;
const only = process.env.CRISIS_EVAL_SETS?.split(',');

async function read(c: Case, prompt: string): Promise<CrisisVerdict | null> {
  const input = {
    latest: c.text,
    earlier: c.earlier ?? [],
    ...(c.companion ? { companion: c.companion } : {}),
  };
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 60,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const verdict = parseClassifierReply(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    if (verdict) return verdict;
  }
  errors++;
  return null;
}

/** Whether the reply gate escalates this turn: before, any risky read; after, agreementOutcome. */
function escalates(c: Case, verdict: CrisisVerdict | null, rules: boolean): boolean {
  const pattern = detectCrisis(c.text, undefined, { recentMessages: c.earlier ?? [] }).isCrisis
    ? 'crisis'
    : 'none';
  if (pattern !== 'none') return true;
  if (!verdict || verdict.risk === 'none') return false;
  if (!rules) return true;
  const { text: latest, earlier, companion } = c;
  return (
    agreementOutcome({ pattern, verdicts: [verdict], latest, earlier, companion }) === 'escalate'
  );
}

const redteam = JSON.parse(
  readFileSync('scripts/crisis-eval/redteam-2026-10-05.json', 'utf8')
) as Case[];
const gloomy = JSON.parse(
  readFileSync('scripts/crisis-eval/gloomy-ferni-2026-10-11.json', 'utf8')
) as Case[];
const bth: Case[] = CRISIS_TEST_CASES.filter(
  (c) => typeof c.expectedResult.shouldDetect === 'boolean'
).map((c) => ({
  text: c.input,
  label: c.expectedResult.shouldDetect ? 'crisis' : 'none',
  kind: c.category,
}));
const sets: Record<string, Case[]> = {
  dev: CRISIS_HELDOUT,
  blind: CRISIS_TEST_BLIND,
  context: CRISIS_CONTEXTUAL,
  redteam,
  bth,
  devcall: gloomy.filter((c) => c.kind === 'devcall_2026_10_11'),
  gloomyNeg: gloomy.filter((c) => c.kind === 'gloomy_ferni_vocative'),
  gloomyPos: gloomy.filter((c) => c.kind === 'gloomy_ferni_caller_risk'),
  gloomyEndorse: gloomy.filter((c) => c.kind === 'gloomy_ferni_endorse'),
};

const ARMS = ['before', 'rules only', 'prompt only', 'after'] as const;
console.log(`reads per case: ${REPS}; counts are reads, not cases`);
console.log(`| set | n pos/neg | ${ARMS.map((a) => `${a} caught / FA`).join(' | ')} |`);
const totals = ARMS.map(() => [0, 0]);
let allPos = 0;
let allNeg = 0;
for (const [name, set] of Object.entries(sets)) {
  if (only && !only.includes(name)) continue;
  // Each case read REPS times: the model is not deterministic even at temperature 0.
  const cases = set.flatMap((c) => Array.from({ length: REPS }, () => c));
  const rows = [];
  for (let i = 0; i < cases.length; i += 40) {
    rows.push(
      ...(await Promise.all(
        cases
          .slice(i, i + 40)
          .map(
            async (c) => [c, await read(c, CRISIS_CLASSIFIER_PROMPT), await read(c, AFTER)] as const
          )
      ))
    );
  }
  const counts = ARMS.map(() => [0, 0]);
  const notes: string[] = [];
  for (const [c, base, attributed] of rows) {
    const arms = [
      escalates(c, base, false),
      escalates(c, base, true),
      escalates(c, attributed, false),
      escalates(c, attributed, true),
    ];
    const positive = c.label !== 'none';
    arms.forEach((hit, i) => {
      if (hit) counts[i][positive ? 0 : 1]++;
    });
    if (positive && !arms[3]) notes.push(`  MISS after [${c.kind}] ${c.text}`);
    if (!positive && arms[3])
      notes.push(
        `  FA after${arms[0] ? '' : ' (NEW)'} [${c.kind}] read=${attributed?.risk} base=${base?.risk}: ${c.text}`
      );
    if (positive && arms[0] !== arms[3])
      notes.push(`  ${arms[3] ? 'GAINED' : 'LOST'} positive [${c.kind}] ${c.text}`);
  }
  const pos = cases.filter((c) => c.label !== 'none').length;
  allPos += pos;
  allNeg += cases.length - pos;
  counts.forEach((c, i) => {
    totals[i][0] += c[0];
    totals[i][1] += c[1];
  });
  console.log(
    `| ${name} | ${pos}/${cases.length - pos} | ${counts.map(([p, n]) => `${p} / ${n}`).join(' | ')} |`
  );
  for (const note of notes) console.error(note);
}
console.log(
  `| **all** | ${allPos}/${allNeg} | ${totals.map(([p, n]) => `**${p} / ${n}**`).join(' | ')} |`
);
console.log(`errors (no verdict after retries): ${errors}`);
