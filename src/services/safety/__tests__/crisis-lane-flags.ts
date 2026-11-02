/**
 * The crisis lane's flags, found by where they are read rather than by what they are called.
 *
 * A flag is in the crisis lane when it is crisis-named (the old prefix rule) or when a crisis
 * module reads it: a source file under the crisis lane's paths (scripts/ci/autonomy-policy.json,
 * `lanes.crisis.paths`, matched the way the autonomy-lanes gate matches them) names it as a
 * string literal (`flagOn('MINOR_ABUSE_DISCLOSURE')`), reads it off an env object
 * (`env.THIRD_PARTY_SELF_HARM`), or is the flag's own definition file. Test files don't count.
 * Comments don't count either: the file is parsed, so a flag a comment mentions (even in
 * backticks) is not a read.
 *
 * Why: the prefix rule left out every crisis flag with another name, such as
 * MINOR_ABUSE_DISCLOSURE and THIRD_PARTY_SELF_HARM, and nothing said so.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

interface Lanes {
  inPaths: (path: string, globs: string[]) => boolean;
  loadPolicy: () => { lanes: { crisis: { paths: string[] } } };
}
// Loaded by path: scripts/ is outside this program's rootDir, and the script imports its
// siblings by their .ts name. Same matcher as the gate, so there is one glob dialect.
const LANES_SCRIPT = join(ROOT, 'scripts/ci/autonomy-lanes.ts');
const { inPaths, loadPolicy } = (await import(LANES_SCRIPT)) as Lanes;

/** The old rule, kept so a crisis-named flag no crisis module reads yet is still checked. */
const CRISIS_NAME = /^(CRISIS_|SAFETY_|EARLY_WARNING_|MINOR_CARE|SMS_CRISIS_)/;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
const FLAG_NAME = /^[A-Z][A-Z0-9_]*$/;
const DEFINITION = /^src\/config\/flags\/([A-Z][A-Z0-9_]*)\.ts$/;

/**
 * Manifest entries crisis modules read that are not switches: the test runner's own markers.
 * The never-lower test unsets every crisis flag it doesn't set, and unsetting these would
 * change the environment the readers run in, not a crisis read.
 */
export const RUNNER_MARKERS: Readonly<Record<string, string>> = {
  CI: 'set by the CI runner; crisis modules read it to stay offline in tests',
  VITEST: 'set by vitest; crisis modules read it to stay offline in tests',
};

const MANIFEST = new Set(Object.keys(FLAG_MANIFEST));

/** `env`, `process.env` or `import.meta.env`: the objects a flag is read off. */
function isEnv(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === 'env';
  return ts.isPropertyAccessExpression(node) && node.name.text === 'env';
}

/**
 * The flag-shaped names a source text reads: a string literal that is exactly the name
 * (`flagOn('X')`, `env['X']`), or a property read off an env object (`process.env.X`,
 * `env?.X`). Parsed, not matched, so comments never count.
 */
export function flagReadsIn(text: string, fileName = 'source.ts'): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (FLAG_NAME.test(node.text)) found.add(node.text);
    } else if (ts.isPropertyAccessExpression(node) && isEnv(node.expression)) {
      if (FLAG_NAME.test(node.name.text)) found.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false));
  return found;
}

/** Every crisis-lane source file, repo-relative, tests left out. */
function laneFiles(): string[] {
  const globs = loadPolicy().lanes.crisis.paths;
  const roots = [...new Set(globs.map((g) => g.replace(/^!/, '').split('/')[0]))];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(rel);
      } else if (SOURCE.test(rel) && !TEST.test(rel) && inPaths(rel, globs)) {
        out.push(rel);
      }
    }
  };
  for (const root of roots) walk(root);
  return out.sort();
}

/** Each manifest flag a crisis-lane source file reads, with the files that read it. */
function laneReads(): Map<string, string[]> {
  const reads = new Map<string, string[]>();
  const add = (flag: string, file: string): void => {
    if (!MANIFEST.has(flag)) return;
    const files = reads.get(flag) ?? [];
    if (!files.includes(file)) files.push(file);
    reads.set(flag, files);
  };
  for (const file of laneFiles()) {
    const defined = DEFINITION.exec(file)?.[1];
    if (defined) add(defined, file);
    for (const name of flagReadsIn(readFileSync(join(ROOT, file), 'utf8'), file)) add(name, file);
  }
  return new Map([...reads].sort(([a], [b]) => a.localeCompare(b)));
}

/** Flag -> the crisis-lane files that read it. */
export const LANE_READS: ReadonlyMap<string, readonly string[]> = laneReads();

/** Every registered flag in the crisis lane: crisis-named or read by a crisis module. */
export const CRISIS_FLAGS: readonly string[] = [
  ...new Set([...[...MANIFEST].filter((name) => CRISIS_NAME.test(name)), ...LANE_READS.keys()]),
]
  .filter((name) => !(name in RUNNER_MARKERS))
  .sort();
