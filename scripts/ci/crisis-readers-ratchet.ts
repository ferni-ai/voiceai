#!/usr/bin/env npx tsx
/**
 * Crisis readers ratchet: crisis words and crisis resources live in
 * src/services/safety/ only (docs/plans/2026-11-05-crisis-centralize.md, step S0).
 *
 * A file outside the safety kernel that reads crisis words with its own regex,
 * or hard-codes a crisis resource, is a second copy: it drifts from the kernel,
 * misses what the kernel catches, and can't be fixed in one place. Counted in
 * every non-test file under src/ outside src/services/safety/:
 *
 * - `regex`: a regex literal, or `RegExp(...)` / `new RegExp(...)` on a literal,
 *   whose pattern reads crisis words (suicide, self-harm, overdose, "kill myself",
 *   "want to die", crisis, hotline, lifeline, 988, 911 ...);
 * - `resource`: a string or template literal naming a crisis resource (988, 911,
 *   741741, hotline, lifeline, "crisis line").
 *
 * The sites that existed when this landed are allowlisted per file and kind in
 * crisis-readers-allowlist.generated.json. A file may not gain sites, a file not in
 * the allowlist must have none, and the total can only go down (`--update` lowers it;
 * nothing raises it; CI also fails an allowlist edited above origin/main's).
 *
 * usage:
 *   npx tsx scripts/ci/crisis-readers-ratchet.ts            check (CI)
 *   npx tsx scripts/ci/crisis-readers-ratchet.ts --update   lower the allowlist to today
 *   npx tsx scripts/ci/crisis-readers-ratchet.ts --list     print every remaining site
 *
 * @module scripts/ci/crisis-readers-ratchet
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';
import { TEST_FILE } from '../codemods/firestore-database-sites.js';
import { allowlistAt, raised, total, type Allowlist } from './firestore-database-ratchet.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASELINE = join(
  dirname(fileURLToPath(import.meta.url)),
  'crisis-readers-allowlist.generated.json'
);
const KERNEL = 'src/services/safety/';

export type Kind = 'regex' | 'resource';
export interface Site {
  file: string;
  kind: Kind;
  line: number;
  text: string;
}

/** Crisis words as they read in a pattern once escapes and grouping are gone. */
const CRISIS_WORDS =
  /suicid|self ?-?harm|overdos|kill (?:my|him|her|them|your)sel|want(?:ed|s)? to die|end (?:my|it all|my own) life|better off dead|unalive|crisis|hotline|lifeline|\b(?:988|911)\b/;
/** A crisis resource in a string. */
const RESOURCE = /\b(?:988|911|741741)\b|hotline|lifeline|crisis (?:text )?line/i;

/** A regex source with escapes and grouping turned to spaces: `kill\s+(?:myself|me)` → `kill myself me`. */
export const plainPattern = (source: string): string =>
  source
    .replace(/\\[sbw][+*?]?|\\./g, ' ')
    .replace(/[()?:|[\]^$+*{}.\\,!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const isScanned = (rel: string): boolean =>
  rel.startsWith('src/') &&
  !rel.startsWith(KERNEL) &&
  /\.(ts|tsx|mts)$/.test(rel) &&
  !rel.endsWith('.d.ts') &&
  !TEST_FILE.test(rel);

/** Every crisis regex and resource literal in one file's text. */
export function sitesIn(file: string, text: string): Site[] {
  if (!/suicid|harm|overdos|kill|die|life|crisis|hotline|988|911|741741|dead/i.test(text))
    return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: Site[] = [];
  const add = (node: ts.Node, kind: Kind): void => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    out.push({ file, kind, line: line + 1, text: node.getText(source).slice(0, 100) });
  };
  const regexArg = (node: ts.Node): ts.Node | undefined => {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return undefined;
    const arg = node.arguments?.[0];
    return ts.isIdentifier(node.expression) && node.expression.text === 'RegExp' && arg
      ? arg
      : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isRegularExpressionLiteral(node)) {
      const body = node.text.slice(1, node.text.lastIndexOf('/'));
      if (CRISIS_WORDS.test(plainPattern(body))) add(node, 'regex');
      return;
    }
    const arg = regexArg(node);
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
      if (CRISIS_WORDS.test(plainPattern(arg.text))) add(node, 'regex');
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (RESOURCE.test(node.text)) add(node, 'resource');
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (parts.some((p) => RESOURCE.test(p))) add(node, 'resource');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function walk(root: string, dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(root, path, out);
    else {
      const rel = relative(root, path).split(sep).join('/');
      if (isScanned(rel)) out.push(rel);
    }
  }
}

/** Every site under `root` (the repo, or a fixture tree laid out like it). */
export function measure(root = REPO): Site[] {
  const files: string[] = [];
  walk(root, join(root, 'src'), files);
  return files.sort().flatMap((file) => sitesIn(file, readFileSync(join(root, file), 'utf8')));
}

/** `file#kind` → number of sites. */
export const keyOf = (s: Pick<Site, 'file' | 'kind'>): string => `${s.file}#${s.kind}`;

export function countByKey(sites: Site[]): Allowlist {
  const counts: Allowlist = {};
  for (const s of sites) counts[keyOf(s)] = (counts[keyOf(s)] ?? 0) + 1;
  return counts;
}

/** What got worse than the allowlist. Empty when the change may land. */
export function regressions(allow: Allowlist, sites: Site[]): string[] {
  const out: string[] = [];
  for (const [key, count] of Object.entries(countByKey(sites))) {
    const before = allow[key] ?? 0;
    if (count <= before) continue;
    const where = sites
      .filter((s) => keyOf(s) === key)
      .map((s) => `\n      ${s.file}:${s.line} ${s.text}`)
      .join('');
    out.push(
      `${key}: ${before} → ${count} crisis ${key.endsWith('#regex') ? 'regexes' : 'resource literals'} outside ${KERNEL}.${where}`
    );
  }
  return out;
}

/** The allowlist lowered to today's counts; never raised, never gains a key. */
export function lowered(allow: Allowlist, sites: Site[]): Allowlist {
  const now = countByKey(sites);
  const next: Allowlist = {};
  for (const [key, before] of Object.entries(allow)) {
    const count = Math.min(before, now[key] ?? 0);
    if (count > 0) next[key] = count;
  }
  return next;
}

const FIX =
  'Ask the safety kernel instead: a crisis read (src/services/safety/crisis-guard.ts detectCrisis, ' +
  'or the read already on the turn) and its resources (CRISIS_RESOURCES, EMERGENCY_NUMBER). ' +
  'If nothing there fits, export it from src/services/safety/ and import it.';

function main(): void {
  const args = process.argv.slice(2);
  const sites = measure();
  const allow: Allowlist = existsSync(BASELINE)
    ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Allowlist)
    : {};
  if (args.includes('--list'))
    sites.forEach((s) => console.log(`${s.file}:${s.line} [${s.kind}] ${s.text}`));
  if (args.includes('--init') || args.includes('--update')) {
    // --init only writes the first allowlist; after that --update can only lower it.
    const next =
      args.includes('--init') && !existsSync(BASELINE) ? countByKey(sites) : lowered(allow, sites);
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`Allowlist: ${Object.keys(sorted).length} entries, ${total(sorted)} sites.`);
    return;
  }
  let atMain: ReturnType<typeof allowlistAt>;
  try {
    atMain = allowlistAt(REPO, 'origin/main', relative(REPO, BASELINE).split(sep).join('/'));
  } catch (error) {
    console.error(`❌ Could not read origin/main's allowlist: ${String(error)}`);
    process.exit(1);
  }
  if (atMain === 'no-ref' && process.env.CI) {
    console.error('❌ origin/main is not fetched, so an allowlist raised above main would pass.');
    process.exit(1);
  }
  const onMain = typeof atMain === 'object' ? atMain : undefined;
  const worse = [...regressions(allow, sites), ...(onMain ? raised(onMain, allow) : [])];
  console.log(
    `Crisis readers ratchet: ${sites.length} sites now, allowlist ${total(allow)}` +
      (onMain ? `, origin/main's ${total(onMain)}.` : ' (no allowlist on origin/main yet).')
  );
  if (worse.length > 0) {
    console.error(
      `\n❌ ${worse.length} new crisis reader(s) or resource literal(s) outside ${KERNEL}:`
    );
    worse.forEach((w) => console.error(`  - ${w}`));
    console.error(`\n${FIX}`);
    process.exit(1);
  }
  console.log(
    sites.length < total(allow)
      ? '\n✅ No new sites, and some were removed: run with --update to lower the allowlist.'
      : '\n✅ No new sites.'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
