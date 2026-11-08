/**
 * The rules of .github/CODEOWNERS and the owners GitHub picks for a path, shared by the
 * tests that check the crisis and evaluator lanes are owned.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { matchesGlob } from '../autonomy-lanes.js';

export const ROOT = join(__dirname, '../../..');
export const OWNER = '@sethdford';

export type Rule = { pattern: string; owners: string[] };
export const rules: Rule[] = readFileSync(join(ROOT, '.github/CODEOWNERS'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [pattern, ...owners] = l.split(/\s+/);
    return { pattern, owners };
  });

/** The owners GitHub picks: the last rule matching the path (CODEOWNERS anchors every rule). */
export function ownersOf(path: string): string[] {
  const match = (p: string) => {
    const glob = p.replace(/^\//, '');
    return glob.endsWith('/') ? path.startsWith(glob) : matchesGlob(path, glob);
  };
  return rules.filter((r) => match(r.pattern)).at(-1)?.owners ?? [];
}
