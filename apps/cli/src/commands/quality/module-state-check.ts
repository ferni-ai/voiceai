#!/usr/bin/env npx tsx
/**
 * Module-Level Per-Caller State Check
 *
 * One voice worker process serves many calls at once. A module-level `let`
 * that a function fills with a room, session, user or participant is shared
 * by every call in the process: the second call overwrites the first one's
 * value, and messages, memories or audio go to the wrong person.
 *
 * Flags a module-level `let`/`var` when a top-level function:
 * - assigns it from a per-caller parameter (`instance = new Publisher(room)`), or
 * - passes a per-caller parameter to a setter on it (`instance.setRoom(room)`).
 *
 * Keyed state (`sessions.set(sessionId, ...)`) and `const` bindings are not flagged.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/quality/module-state-check.ts            # report
 *   npx tsx apps/cli/src/commands/quality/module-state-check.ts --max=40   # fail above 40
 *   npx tsx apps/cli/src/commands/quality/module-state-check.ts --json
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import ts from 'typescript';

import { findProjectRoot } from '../../utils/project-root.js';

export interface ModuleStateHazard {
  readonly file: string;
  readonly line: number;
  readonly variable: string;
  readonly fn: string;
  readonly param: string;
}

const PER_CALLER_NAME =
  /^(room|roomRef|session|agentSession|sessionId|userId|uid|participant|participantId|callerId|ctx|jobCtx|jobContext)$/i;
const PER_CALLER_TYPE =
  /\b(Room|RoomRef|JobContext|AgentSession|RemoteParticipant|LocalParticipant)\b/;
const SETTER = /^(set[A-Z]|attach|bind|init|switch|use[A-Z]|update[A-Z])/;

function isPerCallerParam(param: ts.ParameterDeclaration, sf: ts.SourceFile): string | null {
  if (!ts.isIdentifier(param.name)) return null;
  const name = param.name.text;
  const typeText = param.type ? param.type.getText(sf) : '';
  return PER_CALLER_NAME.test(name) || PER_CALLER_TYPE.test(typeText) ? name : null;
}

function moduleLets(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (stmt.declarationList.flags & ts.NodeFlags.Const) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
    }
  }
  return names;
}

interface TopLevelFunction {
  readonly name: string;
  readonly node: ts.SignatureDeclaration & { body?: ts.Node };
}

function topLevelFunctions(sf: ts.SourceFile): TopLevelFunction[] {
  const fns: TopLevelFunction[] = [];
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      fns.push({ name: stmt.name.text, node: stmt });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (
          ts.isIdentifier(decl.name) &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          fns.push({ name: decl.name.text, node: init });
        }
      }
    }
  }
  return fns;
}

function mentions(node: ts.Node, names: ReadonlySet<string>): string | null {
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && names.has(n.text)) {
      found = n.text;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function receiverName(expr: ts.Expression): string | null {
  return ts.isIdentifier(expr) ? expr.text : null;
}

/** Finds module-level state that a top-level function fills with per-caller values. */
export function findModuleStateHazards(source: string, file: string): ModuleStateHazard[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lets = moduleLets(sf);
  if (lets.size === 0) return [];

  const hazards: ModuleStateHazard[] = [];
  const seen = new Set<string>();
  const report = (node: ts.Node, variable: string, fn: string, param: string): void => {
    const key = `${fn}:${variable}`;
    if (seen.has(key)) return;
    seen.add(key);
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    hazards.push({ file, line, variable, fn, param });
  };

  for (const { name, node } of topLevelFunctions(sf)) {
    const params = new Set(
      node.parameters.map((p) => isPerCallerParam(p, sf)).filter((p): p is string => p !== null)
    );
    if (params.size === 0 || !node.body) continue;

    const visit = (n: ts.Node): void => {
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(n.left) &&
        lets.has(n.left.text)
      ) {
        const param = mentions(n.right, params);
        if (param) report(n, n.left.text, name, param);
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const target = receiverName(n.expression.expression);
        if (target && lets.has(target) && SETTER.test(n.expression.name.text)) {
          const param = n.arguments.map((a) => mentions(a, params)).find((p) => p !== null);
          if (param) report(n, target, name, param);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node.body);
  }
  return hazards;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__', '__mocks__', 'tests']);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listSourceFiles(join(dir, entry.name)));
    } else if (/\.ts$/.test(entry.name) && !/\.(test|spec|d)\.ts$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function main(argv: readonly string[]): number {
  const root = findProjectRoot();
  const maxArg = argv.find((a) => a.startsWith('--max='));
  const max = maxArg ? Number(maxArg.slice('--max='.length)) : Infinity;

  const hazards = listSourceFiles(join(root, 'src')).flatMap((abs) =>
    findModuleStateHazards(readFileSync(abs, 'utf8'), relative(root, abs))
  );

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(hazards, null, 2)}\n`);
  } else {
    for (const h of hazards) {
      process.stdout.write(
        `${h.file}:${h.line}  ${h.fn}() stores ${h.param} in module-level '${h.variable}'\n`
      );
    }
    process.stdout.write(
      `\n${hazards.length} module-level per-caller state hazard(s). ` +
        'Keep per-call state on the session (or in a Map keyed by session id).\n'
    );
  }
  return hazards.length > max ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
