#!/usr/bin/env npx tsx
/**
 * Decision gate: a change that adds a crisis word list, voice resolver, quiet-hours
 * predicate, tool cap, forget checker or Twilio sender outside its owner fails CI.
 *
 * The registry (decisions.ts, beside this file) names each domain decision's owner and the
 * fingerprints of a second decider. For every production file the change touches, this
 * counts fingerprint lines outside the owner here and at the merge base (merge-base.ts; a
 * moved file is compared with its old path) and fails when a file gains one. Comments
 * don't count, trailing ones included.
 *
 *   pnpm quality:decisions    check (CI, Quality Gates)
 *
 * @module quality/decision-gate
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { pathToFileURL } from 'url';
import { DECISIONS, NOT_DECIDERS, type DomainDecision, type Fingerprint } from './decisions.js';
import { basePathOf, diffAgainstBase, readAtBase, resolveBase } from './merge-base.js';

export interface DecisionHit {
  decision: string;
  fingerprint: string;
  line: number;
  text: string;
}

const TEST = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|^src\/(tests|e2e)\/)/;
export const isProductionSource = (f: string): boolean =>
  f.startsWith('src/') &&
  /\.tsx?$/.test(f) &&
  !f.endsWith('.d.ts') &&
  !TEST.test(f) &&
  !NOT_DECIDERS.some((p) => f.startsWith(p));

/**
 * The text with comments blanked (line numbers kept). Strings, template literals and regex
 * literals are recognised first, so `'uploads/*'` or `/https?:\/\//` can't open a comment.
 */
export function stripComments(text: string): string {
  const out = text.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let prev = ''; // last significant character outside strings and comments
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop - 1;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop - 1;
    } else if (c === "'" || c === '"' || c === '`' || (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev)))) {
      // a string, template or regex literal: skip to its unescaped closing character
      let j = i + 1;
      let inClass = false;
      for (; j < text.length; j++) {
        const d = text[j]!;
        if (d === '\\') j++;
        else if (c === '/' && d === '[') inClass = true;
        else if (c === '/' && d === ']') inClass = false;
        else if (d === c && !inClass) break;
        else if (d === '\n' && c !== '`') break; // unterminated: stop at the line end
      }
      i = j;
      prev = c;
    } else if (!/\s/.test(c)) prev = c;
  }
  return out.join('');
}

/** Methods whose string argument is a match against the text: a word list in all but name. */
const MATCHERS = new Set(['includes', 'startsWith', 'endsWith', 'match', 'test']);

/** True when `node` is a string argument of RegExp(...), new RegExp(...) or a MATCHERS call. */
function isMatcherArgument(node: ts.Node): boolean {
  const call = node.parent;
  if (!call || !(ts.isCallExpression(call) || ts.isNewExpression(call)) || !call.arguments?.includes(node as ts.Expression)) return false;
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'RegExp';
  return ts.isPropertyAccessExpression(callee) && MATCHERS.has(callee.name.text);
}

/** Lines (1-based) holding a regex literal, or a string that is an element of an array literal, that matches. */
function wordListLines(file: string, text: string, pattern: RegExp): Set<number> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    const isRegex = node.kind === ts.SyntaxKind.RegularExpressionLiteral;
    // A string counts when it is a word in a list, a matcher's argument, or a regex source (an
    // alternation such as 'ambulance|911|suicid\\w*', later handed to new RegExp).
    const isListWord =
      ts.isStringLiteralLike(node) &&
      (ts.isArrayLiteralExpression(node.parent) || isMatcherArgument(node) || /[\w)\]*?+]\|[\w(\\[]/.test(node.text));
    if ((isRegex || isListWord) && pattern.test(node.getText(sf))) {
      lines.add(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

const owns = (d: DomainDecision, file: string): boolean =>
  d.ownerPaths.some((p) => file === p || (p.endsWith('/') && file.startsWith(p)));

/** Fingerprint lines in `text`, judged as if it lived at `file`; one hit per (decision, line). */
export function hits(file: string, text: string, decisions: readonly DomainDecision[] = DECISIONS): DecisionHit[] {
  const out: DecisionHit[] = [];
  let lines: string[] | undefined;
  for (const d of decisions) {
    if (owns(d, file)) continue;
    const seen = new Set<number>();
    const add = (fp: Fingerprint, line: number): void => {
      if (seen.has(line)) return;
      seen.add(line);
      lines ??= stripComments(text).split('\n');
      out.push({ decision: d.id, fingerprint: fp.name, line, text: (lines[line - 1] ?? '').trim() });
    };
    for (const fp of d.fingerprints) {
      if (!fp.pattern.test(text) || (fp.onlyIn && !fp.onlyIn.test(text))) continue; // cheap prefilter
      if (fp.in === 'word-lists') {
        for (const line of wordListLines(file, text, fp.pattern)) add(fp, line);
        continue;
      }
      lines ??= stripComments(text).split('\n');
      lines.forEach((l, i) => fp.pattern.test(l) && add(fp, i + 1));
    }
  }
  return out;
}

const count = (hs: DecisionHit[], id: string): number => hs.filter((h) => h.decision === id).length;

export interface Gained {
  file: string;
  decision: string;
  before: number;
  after: number;
  lines: DecisionHit[];
  /** The hits whose text the base didn't have: the new decider lines, shown on failure. */
  fresh: DecisionHit[];
}

/** Hits in `now` beyond the ones `then` already had with the same text (a multiset difference). */
function freshHits(now: DecisionHit[], then: DecisionHit[]): DecisionHit[] {
  const left = new Map<string, number>();
  for (const h of then) left.set(h.text, (left.get(h.text) ?? 0) + 1);
  return now.filter((h) => {
    const n = left.get(h.text) ?? 0;
    if (n > 0) left.set(h.text, n - 1);
    return n === 0;
  });
}

/** Decisions whose fingerprint count in `file` rose from `baseText` (null: a new file) to `headText`. */
export function gained(file: string, headText: string, baseText: string | null, decisions = DECISIONS): Gained[] {
  const now = hits(file, headText, decisions);
  const then = baseText === null ? [] : hits(file, baseText, decisions); // judged at the head path: a move is free
  return decisions
    .map((d) => {
      const lines = now.filter((h) => h.decision === d.id);
      const fresh = freshHits(lines, then.filter((h) => h.decision === d.id));
      return { file, decision: d.id, before: count(then, d.id), after: count(now, d.id), lines, fresh };
    })
    .filter((g) => g.after > g.before);
}

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function main(): void {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`);
  const root = process.cwd();
  const started = Date.now();
  const base = resolveBase(root);
  const diff = diffAgainstBase(base, ['src'], root);
  const files = diff.changed.filter(isProductionSource);
  const baseTexts = readAtBase(base, files.map((f) => basePathOf(diff, f)).filter((p): p is string => p !== null), root);
  const worse = files.flatMap((f) => {
    const old = basePathOf(diff, f);
    return gained(f, readFileSync(join(root, f), 'utf8'), old === null ? null : (baseTexts.get(old) ?? null));
  });
  // Scoreboard only: today's fingerprint lines outside each owner across src/.
  const all = walk(join(root, 'src'), []).map((f) => relative(root, f)).filter(isProductionSource);
  const totals = new Map<string, number>();
  for (const f of all) for (const h of hits(f, readFileSync(join(root, f), 'utf8'))) totals.set(h.decision, (totals.get(h.decision) ?? 0) + 1);
  say(`Decision gate, base ${base.slice(0, 9)}: ${files.length} changed production files, ${Date.now() - started} ms. Fingerprint lines outside each owner in src/ (scoreboard):`);
  for (const d of DECISIONS) say(`  ${d.id.padEnd(20)} ${String(totals.get(d.id) ?? 0).padStart(4)}  owner ${d.owner.module}#${d.owner.fn}${d.owner.provisional ? ' (provisional)' : ''}`);
  if (worse.length > 0) {
    say(`\n❌ ${worse.length} file(s) gained a decision fingerprint outside its owner:`);
    for (const w of worse) {
      const d = DECISIONS.find((x) => x.id === w.decision)!;
      say(`  ${w.decision}  ${w.file}: ${w.before} → ${w.after}`);
      for (const h of (w.fresh.length > 0 ? w.fresh : w.lines).slice(0, 3)) say(`      ${h.line}: ${h.text.slice(0, 110)}`);
      say(`      fix: ask ${d.owner.module}#${d.owner.fn} instead of deciding here`);
    }
    say('\nA deliberate new owner? Change it in apps/cli/src/commands/quality/decisions.ts (CODEOWNERS asks its owner to review).');
    process.exit(1);
  }
  say('\n✅ No new deciders outside their owners.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
