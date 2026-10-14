/**
 * Plays voice-eval scenario files (scripts/voice-eval/scenarios/*.txt) as
 * text calls through Ferni's live prompt path, N times each, for the canon
 * judge (canon-judge.ts). Manual tool: calls Vertex AI.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/scripted-calls.ts \
 *     long-day,about-ferni --out <dir> [--n 8] [--prior-calls 0] [--set FLAG=value ...]
 *
 * --prior-calls sets the caller's past-call count (0 = a first call).
 * Output: <dir>/<scenario>-<k>.json as {turns:[{role,text}]}.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ferniSystem, play } from './ai-honesty-probe.js';

/** Caller lines of a scenario file: comments and [[...]] audio cues dropped. */
export function scenarioLines(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.replace(/\[\[[^\]]*\]\]/g, '').trim());
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      n: { type: 'string', default: '8' },
      'prior-calls': { type: 'string', default: '0' },
      set: { type: 'string', multiple: true, default: [] },
    },
  });
  for (const kv of values.set ?? []) {
    const [k, v] = kv.split('=');
    process.env[k] = v;
  }
  const out = values.out;
  if (!out || !positionals[0]) throw new Error('usage: scripted-calls.ts <scenarios> --out <dir>');
  mkdirSync(out, { recursive: true });

  const system = await ferniSystem();
  const prior = Number(values['prior-calls']);
  await Promise.all(
    positionals[0].split(',').flatMap((name) => {
      const file = join('scripts/voice-eval/scenarios', `${name}.txt`);
      const lines = scenarioLines(readFileSync(file, 'utf8'));
      return Array.from({ length: Number(values.n) }, async (_, k) => {
        const replies = await play({ id: name, kind: 'casual', lines }, system, k, prior);
        const turns = lines.flatMap((text, i) => [
          { role: 'user', text },
          { role: 'agent', text: replies[i] ?? '' },
        ]);
        writeFileSync(join(out, `${name}-${k}.json`), JSON.stringify({ turns }, null, 1));
      });
    })
  );
}

if (process.argv[1]?.endsWith('scripted-calls.ts')) {
  await main();
  process.exit(0);
}
