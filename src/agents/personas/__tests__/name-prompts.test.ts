import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prompt text must not ask Ferni to say the caller's name. Friends say it at
 * hello and goodbye and in about 1 turn in 75 otherwise (SBCSAE, #1413); a
 * prod call said it in 16 of 24 replies after prompts like "Use their name
 * naturally". name-gate.ts limits what the model says; this keeps the
 * prompts from asking for it again.
 */
const ROOT = join(__dirname, '../../../..');
const SKIP = /(__tests__|\.backups-|\/tests\/|node_modules)/;
// Other personas' canon is theirs; Ferni and everything shared is checked.
const OTHER_PERSONA = /personas\/bundles\/(?!ferni\/|shared\/)/;
const ASKS_FOR_NAME =
  /\b(?:use|uses|using)\s+(?:their|the user'?s|the caller'?s)\s+name\b|\buse it (?:occasionally|naturally)\b.*name|name.*\buse it (?:occasionally|now and then)\b|\bcall them \$\{name\} now and then\b/i;
const ALLOWED = /\b(?:hello|goodbye|greeting|rarely)\b/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (SKIP.test(p)) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|md|json)$/.test(p) ? [p] : [];
  });
}

describe('prompt text about the caller name', () => {
  it('never asks Ferni to use their name outside hello and goodbye', () => {
    const hits: string[] = [];
    for (const file of files(join(ROOT, 'src'))) {
      if (OTHER_PERSONA.test(file)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const comment = /^\s*(?:\/\/|\*|\/\*)/.test(line);
          if (ASKS_FOR_NAME.test(line) && !ALLOWED.test(line) && !comment) {
            hits.push(`${file.slice(ROOT.length + 1)}:${i + 1}: ${line.trim().slice(0, 90)}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
