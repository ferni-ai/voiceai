/**
 * #2379 intent classifier: false fires on ordinary lines said right after a
 * failed search, recall on real presses, and call latency. Manual tool: calls
 * Vertex AI (the classifier's model, gemini-3.5-flash-lite by default).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/internals-intent-eval.ts [--runs 2]
 *
 * Each line goes through the real InternalsIntent (internals-intent.ts) with
 * its prompt, parser and 1.5 s timeout, the model call made with gcloud ADC.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { generate } from '../first-call-eval/vertex.js';
import { InternalsIntent } from '../../src/agents/personas/internals-intent.js';

const MODEL = process.env.TURN_UNDERSTANDING_MODEL ?? 'gemini-3.5-flash-lite';
type Probe = { ask: string; presses: string[] };
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/internals-intent-probes.json', import.meta.url), 'utf8')
) as { negatives: Record<string, string[]>; positives: Record<string, Array<string | Probe>> };

const latencies: number[] = [];
async function classify(now: string, earlier: string[]): Promise<boolean> {
  const intent = new InternalsIntent(async (system, input) => {
    const started = Date.now();
    const out = await generate({
      model: MODEL,
      system,
      contents: [{ role: 'user', parts: [{ text: input }] }],
      temperature: 0,
      maxOutputTokens: 120,
      json: true,
      thinkingLevel: 'MINIMAL',
    });
    latencies.push(Date.now() - started);
    return out;
  });
  await intent.observe(now, earlier);
  return intent.yesFor(now);
}

const pct = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { runs: { type: 'string', default: '2' } } });
  const out: Record<string, string> = {};
  const fired: string[] = [];
  for (let run = 0; run < Number(values.runs); run++) {
    for (const [group, lines] of Object.entries(FIXTURE.negatives)) {
      const yes = await Promise.all(lines.map((l) => classify(l, ['is there a game tonight?'])));
      yes.forEach((y, i) => y && fired.push(`${group}: ${lines[i]}`));
      out[`${group} false fires`] =
        `${Number(out[`${group} false fires`]?.split('/')[0] ?? 0) + yes.filter(Boolean).length}/${lines.length * (run + 1)}`;
    }
    for (const [group, probes] of Object.entries(FIXTURE.positives)) {
      const cases = probes.flatMap((p) =>
        typeof p === 'string'
          ? [{ now: p, earlier: ['is there a game tonight?'] }]
          : p.presses.map((now, i) => ({ now, earlier: [p.ask, ...p.presses.slice(0, i)] }))
      );
      const yes = await Promise.all(cases.map((c) => classify(c.now, c.earlier)));
      out[`${group} recall`] =
        `${Number(out[`${group} recall`]?.split('/')[0] ?? 0) + yes.filter(Boolean).length}/${cases.length * (run + 1)}`;
    }
  }
  console.log(
    JSON.stringify(
      {
        model: MODEL,
        ...out,
        fired,
        latencyMs: {
          n: latencies.length,
          p50: pct(latencies, 50),
          p90: pct(latencies, 90),
          max: Math.max(...latencies),
        },
      },
      null,
      1
    )
  );
}

if (process.argv[1]?.endsWith('internals-intent-eval.ts')) {
  await main();
  process.exit(0);
}
