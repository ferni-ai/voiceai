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
 *   whose pattern can match crisis words (suicide, self-harm, overdose, "kill myself",
 *   "want to die", crisis, hotline, lifeline, 988, 911 ...);
 * - `word`: a string or template literal with a crisis phrase, the form keyword
 *   lists take (`['suicide', ...].includes(t)`, `new RegExp(list.join('|'))`);
 * - `resource`: a string or template literal naming a crisis resource (988, 911,
 *   741741, hotline, lifeline, "crisis line").
 *
 * The sites that existed when this landed are allowlisted per file and kind in
 * crisis-readers-allowlist.generated.json. A file may not gain sites, a file not in
 * the allowlist must have none, and the total can only go down: when sites are
 * removed CI fails until `--update` lowers the allowlist, so they can't come back.
 * Nothing raises it; CI also fails an allowlist edited above origin/main's.
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

export type Kind = 'regex' | 'resource' | 'word';
const NOUN: Record<Kind, string> = {
  regex: 'regexes',
  word: 'word strings',
  resource: 'resource literals',
};
export interface Site {
  file: string;
  kind: Kind;
  line: number;
  text: string;
}

/** Crisis phrases in text that is lower case with punctuation turned to spaces. */
const CRISIS_PHRASES =
  /suicid|self ?harm|overdos|kill (?:my|him|her|them|your) ?sel|want(?:ed|s)? to die|end(?:ing)? (?:my (?:own )?life|it all)|better off dead|unalive/;
/** What a crisis regex reads: a crisis phrase, or a crisis resource word. */
const CRISIS_WORDS = new RegExp(
  `${CRISIS_PHRASES.source}|crisis|hotline|lifeline|\\b(?:988|911)\\b`
);
/** A crisis resource in a string. */
const RESOURCE = /\b(?:988|911|741741)\b|hotline|lifeline|crisis (?:text )?line/i;

const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** What an escape matches, as text: `\s` a space, `\b` nothing, `\.` a dot. */
const ESCAPED: Record<string, string> = { s: ' ', b: '', B: '', w: 'x', W: ' ', d: '0', D: 'x' };
const escaped = (c = ''): string =>
  ESCAPED[c] ?? (/[nrtfv]/.test(c) ? ' ' : /[1-9]/.test(c) ? '' : c);
const MAX_TEXTS = 512;

/**
 * Up to MAX_TEXTS strings the pattern matches: each alternative, an optional part with and
 * without it, a class as its first member, lookarounds dropped. `kill\s*(my|your)self`
 * → "killmyself", "kill myself", "killyourself" ...
 */
export function matchedTexts(source: string): string[] {
  let i = 0;
  const join = (a: string[], b: string[]): string[] =>
    a.flatMap((x) => b.map((y) => x + y)).slice(0, MAX_TEXTS);
  const atom = (): string[] => {
    const c = source[i++]!;
    if (c === '\\') return [escaped(source[i++])];
    if (c === '^' || c === '$') return [''];
    if (c === '.') return [' '];
    if (c === '[') {
      const negated = source[i] === '^';
      if (negated) i++;
      const first = source[i] === '\\' ? escaped(source[i + 1]) : source[i]!;
      i += source[i] === ']' ? 1 : 0;
      while (i < source.length && source[i] !== ']') i += source[i] === '\\' ? 2 : 1;
      i++;
      return [negated ? 'x' : first];
    }
    if (c !== '(') return [c];
    const look = /^\?<?[=!]/.exec(source.slice(i));
    if (look) i += look[0].length;
    else if (source.startsWith('?:', i)) i += 2;
    else if (source.startsWith('?<', i)) i = source.indexOf('>', i) + 1;
    const inner = alternatives();
    i++;
    return look ? [''] : inner;
  };
  const alternatives = (): string[] => {
    const out: string[] = [];
    let seq = [''];
    while (i < source.length && source[i] !== ')') {
      if (source[i] === '|') {
        i++;
        out.push(...seq);
        seq = [''];
        continue;
      }
      let part = atom();
      const q = /^(?:[?*+]|\{(\d*)(?:,\d*)?\})\??/.exec(source.slice(i));
      if (q) {
        i += q[0].length;
        if (q[0][0] === '?' || q[0][0] === '*' || q[1] === '0') part = ['', ...part];
      }
      seq = join(seq, part);
    }
    return [...out, ...seq].slice(0, MAX_TEXTS);
  };
  return alternatives();
}

/** Whether a regex source reads crisis words, through escapes, classes, optional parts and groups. */
export const readsCrisis = (source: string): boolean =>
  [source.replace(/\\./g, ' '), ...matchedTexts(source)].some((t) => CRISIS_WORDS.test(plain(t)));

export const isScanned = (rel: string): boolean =>
  rel.startsWith('src/') &&
  !rel.startsWith(KERNEL) &&
  /\.(ts|tsx|mts)$/.test(rel) &&
  !rel.endsWith('.d.ts') &&
  !TEST_FILE.test(rel);

/** The kind of a string or template literal, from its text outside `${}`: a resource wins. */
export function kindOf(parts: readonly string[]): 'resource' | 'word' | null {
  if (parts.some((p) => RESOURCE.test(p))) return 'resource';
  if (parts.some((p) => CRISIS_PHRASES.test(plain(p)))) return 'word';
  return null;
}

/** Every crisis regex and resource literal in one file's text. */
export function sitesIn(file: string, text: string): Site[] {
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
      if (readsCrisis(body)) add(node, 'regex');
      return;
    }
    const arg = regexArg(node);
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
      if (readsCrisis(arg.text)) add(node, 'regex');
      return;
    }
    const parts =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? [node.text]
        : ts.isTemplateExpression(node)
          ? [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
          : [];
    const kind = kindOf(parts);
    if (kind) add(node, kind);
    if (parts.length > 0 && !ts.isTemplateExpression(node)) return;
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
      `${key}: ${before} → ${count} crisis ${NOUN[key.slice(key.indexOf('#') + 1) as Kind]} outside ${KERNEL}.${where}`
    );
  }
  return out;
}

/** Allowlist entries above today's count: run --update, or the removed site could come back. */
export function stale(allow: Allowlist, sites: Site[]): string[] {
  const now = countByKey(sites);
  return Object.entries(allow)
    .filter(([key, before]) => (now[key] ?? 0) < before)
    .map(([key, before]) => `${key}: allowlist ${before}, now ${now[key] ?? 0}`);
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
  const lower = stale(allow, sites);
  if (lower.length > 0) {
    console.error(`\n❌ Sites were removed: run with --update to lower the allowlist.`);
    lower.forEach((w) => console.error(`  - ${w}`));
    process.exit(1);
  }
  console.log('\n✅ No new sites.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
