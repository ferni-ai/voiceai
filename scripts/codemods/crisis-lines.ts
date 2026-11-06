/**
 * Moves crisis line names and numbers onto services/safety (crisis-centralize step S1).
 *
 * Every string or template literal outside services/safety that contains a name, phone,
 * text or chat value of a line in services/safety/crisis-lines.ts, or the emergency number,
 * gets that value as a reference instead: `'Call or text 988'` becomes
 * `` `Call or text ${LIFELINE_988.phone}` `` and a literal that is exactly one value becomes
 * the bare reference. The text is unchanged; only its source moves. A literal whose wording
 * differs from the kernel's ("HOME to 741741", "988lifeline.org") is left alone.
 *
 * Skipped: imports, type positions, property names, tagged templates, and RegExp arguments
 * (patterns are step S2).
 *
 *   npx tsx scripts/codemods/crisis-lines.ts <file>...
 *   npx tsx scripts/codemods/crisis-lines.ts --prove <git-ref> <file>...
 *
 * --prove reads each file at <git-ref> and now, evaluates every string-valued literal and
 * crisis-line reference in source order, and fails unless both lists are identical.
 *
 * @module scripts/codemods/crisis-lines
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import ts from 'typescript';

import * as LINES from '../../src/services/safety/crisis-lines.js';
import type { CrisisResource } from '../../src/services/safety/crisis-response.js';
import { EMERGENCY_NUMBER } from '../../src/services/safety/emergency-number.js';

const SAFETY = 'src/services/safety/';
/** Files the rewrite never touches: the kernel itself, tests and generated tables. */
const NOT_REWRITTEN = /^src\/services\/safety\/|__tests__|\.(test|spec)\.ts$|\.generated\.ts$/;
const FIELDS = ['name', 'phone', 'text', 'chat'] as const;

export interface Ref {
  value: string;
  expr: string;
  symbol: string;
}

/** Every value the rewrite moves, longest first so a name wins over the number inside it. */
export function refs(): Ref[] {
  const emergency = 'EMERGENCY_NUMBER';
  const out: Ref[] = [{ value: EMERGENCY_NUMBER, expr: emergency, symbol: emergency }];
  for (const [symbol, line] of Object.entries(LINES)) {
    for (const field of FIELDS) {
      const value: unknown = (line as CrisisResource)[field];
      if (typeof value === 'string') out.push({ value, expr: `${symbol}.${field}`, symbol });
    }
  }
  const byValue = new Map<string, string>();
  for (const r of out) {
    const other = byValue.get(r.value);
    if (other && other !== r.expr) throw new Error(`"${r.value}" is both ${other} and ${r.expr}`);
    byValue.set(r.value, r.expr);
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A value on its own: not part of a longer number, word, amount or URL ("$988", "988lifeline"). */
function pattern(all: Ref[]): RegExp {
  const values = all.map((r) => escape(r.value)).join('|');
  return new RegExp(`(?:(?<=\\\\[nrt])|(?<![\\w$€£#./-]))(?:${values})(?![\\w%/-]|[.,]\\d)`, 'g');
}

/** A single-quoted or double-quoted string body as a template body with the same value. */
function templateBody(inner: string, quote: string): string {
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (c === '\\') {
      const next = inner[i + 1] ?? '';
      out += next === quote ? quote : c + next;
      i++;
    } else if (c === '`') out += '\\`';
    else if (c === '$' && inner[i + 1] === '{') out += '\\$';
    else out += c;
  }
  return out;
}

function skipped(node: ts.Node): boolean {
  const p = node.parent;
  const named = ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p);
  const call = ts.isCallExpression(p) || ts.isNewExpression(p);
  return (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    ts.isLiteralTypeNode(p) ||
    ts.isTaggedTemplateExpression(p) ||
    (named && p.name === node) ||
    (call && p.expression.getText() === 'RegExp')
  );
}

interface Edit {
  start: number;
  end: number;
  text: string;
  line: number;
}
type Rewritten = { text: string; edits: Edit[] } | null;

/** The rewritten source, or null when nothing in it matches. */
export function rewrite(file: string, source: string, all = refs()): Rewritten {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const re = pattern(all);
  const exprOf = new Map(all.map((r) => [r.value, r]));
  const used = new Set<Ref>();
  const edits: Edit[] = [];
  const sub = (body: string) =>
    body.replace(re, (m) => {
      const r = exprOf.get(m)!;
      used.add(r);
      return `\${${r.expr}}`;
    });
  const push = (node: ts.Node, start: number, end: number, text: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    edits.push({ start, end, text, line });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (skipped(node)) return;
      const raw = node.getText();
      const quote = raw[0]!;
      const body = quote === '`' ? raw.slice(1, -1) : templateBody(raw.slice(1, -1), quote);
      const next = sub(body);
      if (next === body) return;
      const bare = /^\$\{([\w.]+)\}$/.exec(next);
      push(node, node.getStart(), node.getEnd(), bare ? bare[1]! : `\`${next}\``);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      if (skipped(node)) return;
      const pieces: ts.Node[] = [node.head, ...node.templateSpans.map((s) => s.literal)];
      for (const piece of pieces) {
        const raw = piece.getText();
        const close = ts.isTemplateTail(piece) ? 1 : 2;
        const body = raw.slice(1, -close);
        const next = sub(body);
        if (next !== body) push(piece, piece.getStart() + 1, piece.getEnd() - close, next);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (edits.length === 0) return null;

  let text = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start))
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  return { text: addImports(file, source, text, used), edits };
}

/** One import from the safety barrel (other contexts import a context through its index). */
function addImports(file: string, original: string, source: string, used: Set<Ref>): string {
  const names = [...new Set([...used].map((r) => r.symbol))].sort();
  for (const name of names)
    if (new RegExp(`\\b${name}\\b`).test(original))
      throw new Error(`${file} already has a ${name}; rewrite it by hand`);
  let spec = relative(dirname(file), `${SAFETY}index.js`);
  if (!spec.startsWith('.')) spec = `./${spec}`;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const at = sf.statements.filter(ts.isImportDeclaration).at(-1)?.getEnd() ?? 0;
  return `${source.slice(0, at)}\nimport { ${names.join(', ')} } from '${spec}';${source.slice(at)}`;
}

// --- proof --------------------------------------------------------------------------------

/** Every string the file's literals and crisis-line references evaluate to, in source order. */
export function strings(file: string, source: string, all = refs()): string[] {
  const known = new Map(all.map((r) => [r.expr, r.value]));
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const compact = (n: ts.Node) => n.getText(sf).replace(/\s+/g, '');
  /** A substitution's code with its strings cut out (they are compared on their own). */
  const shape = (expr: ts.Node): string => {
    const cuts: Array<[number, number]> = [];
    const find = (n: ts.Node): void => {
      const literal =
        ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateExpression(n);
      if (literal || known.has(compact(n))) cuts.push([n.getStart(sf), n.getEnd()]);
      else ts.forEachChild(n, find);
    };
    find(expr);
    let text = '';
    let at = expr.getStart(sf);
    for (const [start, end] of cuts) {
      text += `${sf.text.slice(at, start)}#`;
      at = end;
    }
    return (text + sf.text.slice(at, expr.getEnd())).replace(/\s+/g, '');
  };
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push(node.text);
      return;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isIdentifier(node)) {
      const value = known.get(compact(node));
      if (value !== undefined) {
        out.push(value);
        return;
      }
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      const rest: ts.Node[] = [];
      for (const span of node.templateSpans) {
        const ref = known.get(compact(span.expression));
        if (ref === undefined) rest.push(span.expression);
        value += (ref ?? `\u0000${shape(span.expression)}\u0000`) + span.literal.text;
      }
      out.push(value);
      rest.forEach(visit);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function main(argv: string[]): number {
  if (argv[0] === '--prove') {
    const [, ref, ...paths] = argv;
    let bad = 0;
    for (const file of paths) {
      const old = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
      const before = strings(file, old);
      const after = strings(file, readFileSync(file, 'utf8'));
      const at = before.findIndex((s, i) => s !== after[i]);
      if (at >= 0 || before.length !== after.length) {
        bad++;
        const i = at >= 0 ? at : Math.min(before.length, after.length);
        console.log(
          `DIFF ${file} #${i}\n  before ${JSON.stringify(before[i])}\n  after  ${JSON.stringify(after[i])}`
        );
      } else console.log(`same ${file} (${before.length} strings)`);
    }
    return bad ? 1 : 0;
  }
  const all = refs();
  for (const file of argv.filter((f) => f.endsWith('.ts') && !NOT_REWRITTEN.test(f))) {
    const result = rewrite(file, readFileSync(file, 'utf8'), all);
    if (!result) continue;
    writeFileSync(file, result.text);
    for (const e of result.edits) console.log(`${file}:${e.line} ${e.text}`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
