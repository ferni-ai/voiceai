/**
 * Score the crisis classifier prompt on the development and blind sets.
 *
 * Calls Vertex AI (global endpoint) with Application Default Credentials, so it
 * is a manual tool, never part of the test suite.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/crisis-eval/classifier-eval.ts [model] [blind]
 *
 * Prints recall, precision, imminent hits, over-calls and latency per set.
 */

import { execFileSync } from 'node:child_process';
import { CRISIS_HELDOUT } from '../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import {
  CRISIS_CLASSIFIER_PROMPT,
  DEFAULT_CRISIS_CLASSIFIER_MODEL,
  parseClassifierReply,
} from '../../src/services/safety/crisis-classifier.js';

interface LabelledCase {
  text: string;
  label: 'block' | 'crisis' | 'none';
  kind: string;
}

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const model = process.argv[2] ?? DEFAULT_CRISIS_CLASSIFIER_MODEL;
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;

async function classify(text: string): Promise<{ risk: string; ms: number }> {
  const startedAt = Date.now();
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: CRISIS_CLASSIFIER_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ latest: text, earlier: [] }) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 60,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!res) continue;
    if (res.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { risk: parseClassifierReply(reply)?.risk ?? 'error', ms: Date.now() - startedAt };
  }
  return { risk: 'error', ms: Date.now() - startedAt };
}

async function run(name: string, cases: readonly LabelledCase[]): Promise<void> {
  const results: Array<{ c: LabelledCase; risk: string; ms: number }> = [];
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        results.push({ c, ...(await classify(c.text)) });
      }
    })
  );

  let tp = 0;
  let fn = 0;
  let fp = 0;
  let imminentHits = 0;
  let overCalls = 0;
  let errors = 0;
  const lines: string[] = [];
  for (const { c, risk } of results) {
    if (risk === 'error') errors++;
    const flagged = risk === 'imminent' || risk === 'crisis';
    if (c.label === 'none') {
      if (flagged) {
        fp++;
        lines.push(`FP   [${c.kind}] ${risk}: ${c.text}`);
      }
    } else if (flagged) {
      tp++;
    } else {
      fn++;
      lines.push(`MISS [${c.label}/${c.kind}] ${c.text}`);
    }
    if (c.label === 'block' && risk === 'imminent') imminentHits++;
    if (c.label === 'crisis' && risk === 'imminent') {
      overCalls++;
      lines.push(`OVER [${c.kind}] ${c.text}`);
    }
  }
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const blockTotal = cases.filter((c) => c.label === 'block').length;
  const noneTotal = cases.filter((c) => c.label === 'none').length;
  console.log(
    `${name} ${model}: n=${cases.length} recall ${((tp / (tp + fn)) * 100).toFixed(1)}% ` +
      `precision ${((tp / (tp + fp)) * 100).toFixed(1)}% FP ${fp}/${noneTotal} ` +
      `imminent ${imminentHits}/${blockTotal} over-imminent ${overCalls} errors ${errors} ` +
      `p50 ${ms[Math.floor(ms.length / 2)]}ms p95 ${ms[Math.floor(ms.length * 0.95)]}ms`
  );
  for (const line of lines) console.log(`  ${line}`);
}

if (process.argv[3] !== 'blind') await run('dev', CRISIS_HELDOUT);
await run('blind', CRISIS_TEST_BLIND);
