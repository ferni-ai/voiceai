/**
 * Run programs without a shell.
 *
 *   runArgv(argv`gcloud logging read ${filter} --limit=${limit}`)
 *
 * `argv` splits the literal text on whitespace and keeps every interpolated
 * value inside a single argument, whatever it contains (spaces, `;`, quotes,
 * `$(...)`). No shell ever sees the result, so user input can't become a
 * command. A value next to literal text joins that argument (`--limit=${n}`).
 */

import { spawnSync } from 'child_process';

export function argv(strings: TemplateStringsArray, ...values: unknown[]): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  strings.forEach((literal, i) => {
    literal.split(/\s+/).forEach((part, j) => {
      if (j > 0 && cur !== null) {
        out.push(cur);
        cur = null;
      }
      if (part) cur = (cur ?? '') + part;
    });
    if (i < values.length) cur = (cur ?? '') + String(values[i]);
  });
  if (cur !== null) out.push(cur);
  return out;
}

/** Runs `[cmd, ...args]` with inherited stdio. `quiet` drops stderr (was `2>/dev/null`). */
export function runArgv([cmd, ...args]: string[], quiet = false) {
  return spawnSync(cmd, args, { stdio: ['inherit', 'inherit', quiet ? 'ignore' : 'inherit'] });
}

/** Runs `[cmd, ...args]` and returns trimmed stdout, or '' on failure. */
export function captureArgv([cmd, ...args]: string[], cwd?: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim() : '';
}
