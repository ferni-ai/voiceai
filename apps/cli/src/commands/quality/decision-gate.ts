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
import { DECISIONS, type DomainDecision, type Fingerprint } from './decisions.js';
import { basePathOf, diffAgainstBase, readAtBase, resolveBase } from './merge-base.js';

export interface DecisionHit {
  decision: string;
  fingerprint: string;
  line: number;
  text: string;
}

const TEST = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|^src\/(tests|e2e)\/)/;
export const isProductionSource = (f: string): boolean =>
  f.startsWith('src/') && /\.tsx?$/.test(f) && !f.endsWith('.d.ts') && !TEST.test(f);

/** `line` without a trailing `//` comment (quotes and template strings respected). */
export function stripTrailingComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/** The text with block comments, whole-line and trailing `//` comments blanked; line numbers kept. */
export function stripComments(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split('\n')
    .map((l) => stripTrailingComment(l))
    .join('\n');
}

/** Lines (1-based) holding a regex literal, or a string that is an element of an array literal, that matches. */
function wordListLines(file: string, text: string, pattern: RegExp): Set<number> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    const isRegex = node.kind === ts.SyntaxKind.RegularExpressionLiteral;
    const isListWord = ts.isStringLiteralLike(node) && ts.isArrayLiteralExpression(node.parent);
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
}

/** Decisions whose fingerprint count in `file` rose from `baseText` (null: a new file) to `headText`. */
export function gained(file: string, headText: string, baseText: string | null, decisions = DECISIONS): Gained[] {
  const now = hits(file, headText, decisions);
  const then = baseText === null ? [] : hits(file, baseText, decisions); // judged at the head path: a move is free
  return decisions
    .map((d) => ({ file, decision: d.id, before: count(then, d.id), after: count(now, d.id), lines: now.filter((h) => h.decision === d.id) }))
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
      for (const h of w.lines.slice(0, 3)) say(`      ${h.line}: ${h.text.slice(0, 110)}`);
      say(`      fix: ask ${d.owner.module}#${d.owner.fn} instead of deciding here`);
    }
    say('\nA deliberate new owner? Change it in apps/cli/src/commands/quality/decisions.ts (code owners review it).');
    process.exit(1);
  }
  say('\n✅ No new deciders outside their owners.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
