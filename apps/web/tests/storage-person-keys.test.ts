/**
 * Every key the web app saves in localStorage or sessionStorage is either the
 * person's, named under FERNI_KEY_PATTERN so sign-out clears it, or listed in
 * DEVICE_KEYS with the reason it belongs to this device. A key that is neither
 * survives sign-out and is left for the next person on a shared browser, as
 * 'voiceai-marketplace-installed' was.
 *
 * Keys are read with the TypeScript checker: string literals and literal types,
 * constants, template and concatenation heads, the return values of key-building
 * helpers, and every argument passed to a helper's key parameter.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEVICE_KEYS, FERNI_KEY_PATTERN } from '../src/config/storage-keys';

const WEB = join(__dirname, '..');
const SRC = join(WEB, 'src');
const PREFIX = '*'; // a key known only up to here, e.g. `ferni_cache_${id}` → 'ferni_cache_*'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource = path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.endsWith('.test.ts');
    return isSource ? [path] : [];
  });
}

function scanSavedKeys(): { keys: { key: string; at: string }[]; unread: string[] } {
  const config = ts.readConfigFile(join(WEB, 'tsconfig.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, WEB);
  const program = ts.createProgram(sourceFiles(SRC), { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const ownFiles = program.getSourceFiles().filter((file) => file.fileName.startsWith(SRC));
  const at = (node: ts.Node) => {
    const file = node.getSourceFile();
    return `${relative(SRC, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  };
  const calleeOf = (call: ts.CallExpression) => {
    const name = ts.isPropertyAccessExpression(call.expression)
      ? call.expression.name
      : call.expression;
    const symbol = checker.getSymbolAtLocation(name);
    return symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  };
  const unread: string[] = [];

  function keysOf(expr: ts.Expression, depth = 0): string[] {
    const unknown = () => (unread.push(`${at(expr)} ${expr.getText().slice(0, 60)}`), []);
    if (depth > 6) return unknown();
    const type = checker.getTypeAtLocation(expr);
    const parts = type.isUnion() ? type.types : [type];
    if (parts.every((part) => part.isStringLiteral())) {
      return parts.map((part) => (part as ts.StringLiteralType).value);
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
    if (ts.isTemplateExpression(expr)) {
      if (expr.head.text) return [expr.head.text + PREFIX];
      const [first] = expr.templateSpans;
      return keysOf(first!.expression, depth + 1).map((key) =>
        key.endsWith(PREFIX) ? key : key + first!.literal.text + PREFIX
      );
    }
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) {
      return keysOf(expr.expression, depth + 1);
    }
    if (ts.isConditionalExpression(expr)) {
      return [...keysOf(expr.whenTrue, depth + 1), ...keysOf(expr.whenFalse, depth + 1)];
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return keysOf(expr.left, depth + 1).map((key) => (key.endsWith(PREFIX) ? key : key + PREFIX));
    }
    const declaration = (
      ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)
        ? checker.getSymbolAtLocation(expr)
        : undefined
    )?.valueDeclaration;
    if (declaration && ts.isParameter(declaration)) return argumentsFor(declaration, depth);
    if (
      declaration &&
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration)) &&
      declaration.initializer
    ) {
      return keysOf(declaration.initializer, depth + 1);
    }
    if (ts.isCallExpression(expr)) {
      let fn: ts.Node | undefined = calleeOf(expr)?.valueDeclaration;
      if (fn && ts.isVariableDeclaration(fn)) fn = fn.initializer; // const keyFor = (id) => `…`
      if (fn && ts.isFunctionLike(fn) && 'body' in fn && fn.body) {
        return returnedKeys(fn.body as ts.Node, depth);
      }
    }
    return unknown();
  }

  // A helper's key parameter is every value its callers pass for it. A helper
  // nobody calls saves nothing; once someone calls it, their argument is checked.
  function argumentsFor(parameter: ts.ParameterDeclaration, depth: number): string[] {
    const fn = parameter.parent;
    const index = fn.parameters.indexOf(parameter);
    const fnSymbol = fn.name ? checker.getSymbolAtLocation(fn.name) : undefined;
    const keys: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && fnSymbol && calleeOf(node) === fnSymbol) {
        const argument = node.arguments[index];
        if (argument) keys.push(...keysOf(argument, depth + 1));
      }
      ts.forEachChild(node, visit);
    };
    for (const file of ownFiles) visit(file);
    return keys;
  }

  function returnedKeys(body: ts.Node, depth: number): string[] {
    if (!ts.isBlock(body)) return keysOf(body as ts.Expression, depth + 1);
    const keys: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression)
        keys.push(...keysOf(node.expression, depth + 1));
      else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
    };
    visit(body);
    return keys;
  }

  const keys: { key: string; at: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setItem' &&
      node.arguments[0]
    ) {
      const receiver = checker.getNonNullableType(
        checker.getTypeAtLocation(node.expression.expression)
      );
      if (checker.typeToString(receiver) === 'Storage') {
        for (const key of keysOf(node.arguments[0])) keys.push({ key, at: at(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const file of ownFiles) visit(file);
  return { keys, unread };
}

describe('keys the web app saves in browser storage', () => {
  let keys: { key: string; at: string }[] = [];
  let unread: string[] = [];
  beforeAll(() => {
    ({ keys, unread } = scanSavedKeys());
  }, 120_000); // type-checks all of src

  it('finds the app saving keys at all (a scan that reads nothing proves nothing)', () => {
    expect(keys.length).toBeGreaterThan(100);
  });

  it("are the person's (cleared at sign-out) or a listed device key", () => {
    const neither = keys
      .filter(({ key }) => !FERNI_KEY_PATTERN.test(key) && !Object.hasOwn(DEVICE_KEYS, key))
      .map(({ key, at }) => `${key} (${at})`);
    expect(
      neither,
      'rename under ferni_/ferni-/ferni:/voiceai_, or add to DEVICE_KEYS with a reason'
    ).toEqual([]);
  });

  it('can all be read, so none slips past the check above', () => {
    expect(unread).toEqual([]);
  });

  it('gives each device key the reason it belongs to the device, not the person', () => {
    const unexplained = Object.entries(DEVICE_KEYS).filter(([, reason]) => !reason.trim());
    expect(unexplained).toEqual([]);
  });
});
