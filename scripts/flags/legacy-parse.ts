/**
 * Reads the flag registries with the TypeScript compiler API: the legacy
 * src/config/flag-manifest*.ts literals, the one-file-per-flag src/config/flags/
 * files and the cohort list. Used by flags:move and flags:migrate, which splice by
 * the positions found here, never by regex.
 */
import ts from 'typescript';

export type Spec = Record<'default' | 'owner' | 'kind', string> &
  Partial<Record<(typeof LIFECYCLE)[number], string>>;
/** Optional lifecycle fields (src/config/flag-lifecycle.ts): free text, carried as-is. */
const LIFECYCLE = ['expires', 'issue', 'context'] as const;

/** A node's own whole lines (first comment line .. past its newline) and its comments, verbatim. */
interface Attached {
  /** Comments on the lines above; one after the previous entry on its line is not one. */
  comments: string[];
  /** A comment after the node on its line. */
  trailing?: string;
  start: number;
  end: number;
}

/** block: the const holding it (a FLAGS_* block, LEGACY_FLAG_MANIFEST, or a flag file's export). */
export type Entry = Attached & { name: string; spec: Spec; file: string; block: string };
/** name: the spread identifier, e.g. FLAGS_DISABLE_TO_EOT. */
export type Spread = Attached & { name: string; block: string };
/** A flag block statement with its doc comment, as whole lines. */
export type Block = { name: string; exported: boolean; start: number; end: number };
export type Registry = { entries: Entry[]; spreads: Spread[]; blocks: Block[] };

const lineStart = (text: string, pos: number): number => text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text: string, pos: number): number => {
  const nl = text.indexOf('\n', pos);
  return nl === -1 ? text.length : nl + 1;
};

function fail(file: string, text: string, pos: number, why: string): never {
  const line = text.slice(0, pos).split('\n').length;
  throw new Error(`${file}:${line}: ${why}`);
}

function attached(text: string, file: string, node: ts.Node, sf: ts.SourceFile): Attached {
  const full = node.getFullStart();
  const own = node.getStart(sf);
  const leading = (ts.getLeadingCommentRanges(text, full) ?? []).filter((r) =>
    text.slice(full, r.pos).includes('\n')
  );
  let after = node.end;
  const comma = /^\s*,/.exec(text.slice(after));
  if (comma) after += comma[0].length;
  const tail = ts.getTrailingCommentRanges(text, after)?.[0];
  const start = lineStart(text, leading[0]?.pos ?? own);
  const end = lineEnd(text, tail?.end ?? after);
  const rest = text.slice(tail?.end ?? after, end);
  if (text.slice(start, leading[0]?.pos ?? own).trim() !== '' || rest.trim() !== '') {
    fail(file, text, own, 'an entry must sit on lines of its own');
  }
  return {
    comments: leading.map((r) => text.slice(r.pos, r.end)),
    trailing: tail && text.slice(tail.pos, tail.end),
    start,
    end,
  };
}

/** Refuses an entry with a comment inside it: only comments above or after it move with it. */
function noInnerComment(text: string, file: string, node: ts.Node, name: string): void {
  if (/\/[/*]/.test(node.getText())) {
    fail(
      file,
      text,
      node.getStart(),
      `${name} has a comment inside its entry; move it above the entry`
    );
  }
}

function readSpec(text: string, file: string, node: ts.Expression): Spec {
  const spec: Record<string, string> = {};
  if (ts.isObjectLiteralExpression(node)) {
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) {
        spec[p.name.getText()] = p.initializer.text;
      }
    }
  }
  const isLife = (k: string): boolean => (LIFECYCLE as readonly string[]).includes(k);
  const core = Object.keys(spec).filter((k) => !isLife(k));
  const plain = core.every((k) => /^[\w.-]+$/.test(spec[k]!));
  if (core.sort().join() !== 'default,kind,owner' || !plain) {
    fail(file, text, node.pos, `not a { default, owner, kind } of plain strings`);
  }
  const life = Object.fromEntries(LIFECYCLE.filter((k) => k in spec).map((k) => [k, spec[k]!]));
  return { default: spec.default!, owner: spec.owner!, kind: spec.kind!, ...life };
}

/** The object or array literal a declaration holds, under any `as const` / `satisfies`. */
function literalOf(decl: ts.VariableDeclaration): ts.Expression | undefined {
  let init = decl.initializer;
  while (init && (ts.isSatisfiesExpression(init) || ts.isAsExpression(init)))
    init = init.expression;
  return init;
}

const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** Every flag entry, spread and flag block in a legacy flag-manifest*.ts file. */
export function parseLegacy(file: string, text: string): Registry {
  const sf = parse(file, text);
  const out: Registry = { entries: [], spreads: [], blocks: [] };
  for (const stmt of sf.statements.filter(ts.isVariableStatement)) {
    for (const decl of stmt.declarationList.declarations) {
      const literal = literalOf(decl);
      const isFlag = (p: ts.ObjectLiteralElementLike): boolean =>
        ts.isSpreadAssignment(p) ||
        (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer));
      if (!literal || !ts.isObjectLiteralExpression(literal) || !literal.properties.every(isFlag)) {
        continue;
      }
      const block = decl.name.getText(sf);
      const doc = ts.getLeadingCommentRanges(text, stmt.getFullStart())?.at(-1)?.pos;
      out.blocks.push({
        name: block,
        exported: !!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
        start: lineStart(text, doc ?? stmt.getStart(sf)),
        end: lineEnd(text, stmt.end),
      });
      for (const p of literal.properties) {
        const at = attached(text, file, p, sf);
        if (ts.isSpreadAssignment(p))
          out.spreads.push({ ...at, block, name: p.expression.getText(sf) });
        else if (ts.isPropertyAssignment(p)) {
          noInnerComment(text, file, p, p.name.getText(sf));
          const spec = readSpec(text, file, p.initializer);
          out.entries.push({ ...at, name: p.name.getText(sf), spec, file, block });
        }
      }
    }
  }
  return out;
}

/** The one entry a src/config/flags/NAME.ts file exports, its comments above the export. */
export function parseFlagFile(file: string, text: string): Entry {
  const sf = parse(file, text);
  const stmts = sf.statements.filter(ts.isVariableStatement);
  const decl = stmts[0]?.declarationList.declarations[0];
  const literal = decl && literalOf(decl);
  if (stmts.length !== 1 || !decl || !literal)
    fail(file, text, 0, 'expected one `export const NAME = {...}`');
  noInnerComment(text, file, stmts[0], decl.name.getText(sf));
  const [name, spec] = [decl.name.getText(sf), readSpec(text, file, literal)];
  return { ...attached(text, file, stmts[0], sf), name, spec, file, block: name };
}

/** Comments as a flag file carries them: a same-line comment moves above the export. */
export const commentsOf = (e: Pick<Entry, 'comments' | 'trailing'>): string[] =>
  e.trailing ? [...e.comments, e.trailing] : e.comments;

/**
 * COHORT_FLAGS in src/services/platform/cohort-flags.ts: each name with its group
 * comments. For the cohort move (PR6/PR7); nothing reads it yet.
 */
export function parseCohortFlags(file: string, text: string): Array<Attached & { name: string }> {
  const sf = parse(file, text);
  for (const stmt of sf.statements.filter(ts.isVariableStatement)) {
    const decl = stmt.declarationList.declarations[0];
    const literal = decl && literalOf(decl);
    if (
      decl?.name.getText(sf) !== 'COHORT_FLAGS' ||
      !literal ||
      !ts.isArrayLiteralExpression(literal)
    ) {
      continue;
    }
    return literal.elements.map((el) => {
      if (!ts.isStringLiteral(el))
        fail(file, text, el.pos, 'COHORT_FLAGS holds string literals only');
      return { name: el.text, ...attached(text, file, el, sf) };
    });
  }
  return fail(file, text, 0, 'no COHORT_FLAGS array');
}
