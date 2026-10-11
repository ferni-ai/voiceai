/**
 * Run a snippet the way production runs the agent: plain Node ESM, where a
 * bare `require` is a ReferenceError. Vitest's module runner hides that, so a
 * test of code that reaches for `require` must run outside it to mean anything.
 *
 * The script prints its answer with `report(value)`; this returns the last
 * reported value. Firestore is pointed at a closed port so nothing can write.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const MARKER = '@@PLAIN_ESM@@';

export function runPlainEsm(script: string, env: Record<string, string> = {}): unknown {
  const prelude = `const report = (v) => console.log(${JSON.stringify(MARKER)} + JSON.stringify(v));\n`;
  const out = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', `${prelude}${script}\nprocess.exit(0);`],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const line = out
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(MARKER));
  if (!line) throw new Error(`plain ESM script reported nothing:\n${out}`);
  return JSON.parse(line.slice(MARKER.length));
}
