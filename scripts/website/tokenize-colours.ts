/**
 * Website colour codemod: swaps hard-coded colours in site CSS and templates for
 * the theme roles in design-system/tokens/semantic-colors.json (step C1 of the
 * website theme plan).
 *
 * A literal is replaced only when a role's light value is exactly the same
 * colour, and only for a property that fits the role: color → text roles,
 * background → surface roles, border/outline → border roles. Light mode is
 * therefore unchanged; dark mode starts following the role. Everything else
 * (dark-context rules, custom properties, var() fallbacks, gradients, shadows,
 * colours no role has) is left alone and listed in the report.
 *
 * Page aliases: a page style that reads var(--page-ink, #2c2520) shows the
 * literal in light mode and the alias, which dark-mode-surfaces.css sets only in
 * dark mode, in dark. The whole var() becomes a role only when the role matches
 * both: its light value is the literal and its dark value is the alias.
 * Page variables work the same way: a template that declares
 * :root { --ferni: #4a6741 } and reads var(--ferni) has its dark value set by
 * dark-mode-surfaces.css, so var(--ferni) becomes the role that matches both.
 *
 * Usage: pnpm tsx scripts/website/tokenize-colours.ts <file...> [--write]
 *   Without --write it only prints the report.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ThemeRole, themeRoleGroups } from '../../design-system/lib/website-theme.js';
import {
  colourLiterals,
  DARK_MEDIA,
  DARK_SELECTOR,
} from '../../apps/cli/src/commands/quality/website-theme-debt.js';

type Kind = 'text' | 'surface' | 'border';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Roles a literal may become, per kind, in order of preference. */
export const CANDIDATES: Record<Kind, string[]> = {
  text: [
    'text-primary',
    'text-secondary',
    'text-muted',
    'text-dimmed',
    'brand-text',
    'accent',
    'accent-hover',
    'accent-pressed',
    'success',
    'error',
    'warning',
    'ferni-text',
    'peter-text',
    'alex-text',
    'maya-text',
    'jordan-text',
    'nayan-text',
  ],
  surface: [
    'surface-base',
    'surface-sunken',
    'surface-raised',
    'surface-overlay',
    'bg-tertiary',
    'accent',
    'accent-hover',
    'accent-pressed',
    'accent-subtle',
    'accent-glow',
    'success-bg',
    'error-bg',
    'warning-bg',
  ],
  border: ['border-subtle', 'border-medium', 'border-strong', 'accent'],
};

const KIND_OF: Array<[RegExp, Kind]> = [
  [/^(color|-webkit-text-fill-color|caret-color|text-decoration-color|fill|stroke)$/, 'text'],
  [/^background(-color)?$/, 'surface'],
  [
    /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?)$/,
    'border',
  ],
];

const LITERAL =
  /(?<![\w&#-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\brgba?\([^()]*\)|(?<![\w-])(?:white|black)(?![\w-])/gi;
const VAR_USE = /var\(\s*(--[\w-]+)\s*\)/g;
/** var(--page-x, <literal>) */
const ALIAS = new RegExp(`var\\(\\s*(--page-[\\w-]+)\\s*,\\s*(${LITERAL.source})\\s*\\)`, 'gi');

export interface Change {
  line: number;
  property: string;
  literal: string;
  role: string;
}
export interface Unmatched {
  line: number;
  property: string;
  literal: string;
  reason: string;
}

/** Every theme role, resolved from the design-system token files. */
export function themeRoles(): ThemeRole[] {
  const read = (f: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'design-system/tokens', f), 'utf8'));
  return themeRoleGroups(
    read('semantic-colors.json'),
    read('colors.json'),
    read('spacing.json')
  ).flatMap((g) => g.roles);
}

/** Per kind: role by normalised light value, and by "light|dark" pair. */
export type RoleTable = Record<Kind, { byLight: Map<string, string>; byPair: Map<string, string> }>;

export function roleTable(roles: ThemeRole[]): RoleTable {
  const byName = new Map(roles.map((r) => [r.name, r]));
  const table = {} as RoleTable;
  for (const kind of Object.keys(CANDIDATES) as Kind[]) {
    table[kind] = { byLight: new Map(), byPair: new Map() };
    for (const name of CANDIDATES[kind]) {
      const role = byName.get(`--color-${name}`);
      if (role === undefined) throw new Error(`semantic-colors.json has no --color-${name} role`);
      const light = normalise(role.light);
      const pair = `${light}|${normalise(role.dark ?? role.light)}`;
      if (!table[kind].byLight.has(light)) table[kind].byLight.set(light, role.name);
      if (!table[kind].byPair.has(pair)) table[kind].byPair.set(pair, role.name);
    }
  }
  return table;
}

/** The custom properties a stylesheet's :root rules declare, with their values. */
export function rootAliases(css: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const block of mask(css).matchAll(/:root(?::root)?\s*\{([^{}]*)\}/g)) {
    for (const m of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
      aliases.set(m[1]!, m[2]!.trim());
    }
  }
  return aliases;
}

/** A page variable's light value: a literal, or the literal fallback of a var(). */
function lightLiteral(value: string): string | undefined {
  const m = new RegExp(`^(?:var\\(\\s*--[\\w-]+\\s*,\\s*)?(${LITERAL.source})\\s*\\)?$`, 'i').exec(
    value.trim()
  );
  return m?.[1];
}

function normalise(literal: string): string {
  const named = { white: '#ffffff', black: '#000000' }[literal.toLowerCase()];
  return named ?? colourLiterals(literal)[0] ?? literal;
}

/** Comments blanked to spaces, so offsets in the result match the original. */
function mask(text: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\{#[\s\S]*?#\}/g, blank);
}

/** Why the literal at `at` in a value must stay: it sits inside a var() fallback or a gradient. */
function guardedReason(value: string, at: number): string | undefined {
  const open: string[] = [];
  for (const m of value.slice(0, at).matchAll(/([\w-]*)\(|\)/g)) {
    if (m[0] === ')') open.pop();
    else open.push(m[1]!.toLowerCase());
  }
  if (open.includes('var')) return 'var() fallback';
  if (open.some((f) => f.endsWith('gradient'))) return 'gradient';
  return undefined;
}

/** Replaces matching literals in one text; returns the new text and what it did. */
export function tokenize(
  text: string,
  table: RoleTable,
  isTemplate: boolean,
  aliases: Map<string, string> = new Map()
): { text: string; changes: Change[]; unmatched: Unmatched[] } {
  const masked = mask(text);
  const changes: Change[] = [];
  const unmatched: Unmatched[] = [];
  const edits: Array<[number, number, string]> = [];
  const lineAt = (offset: number): number => masked.slice(0, offset).split('\n').length;
  /** This file's light :root variables (name → literal); filled before any rewrite. */
  const pageLight = new Map<string, string>();

  const declarations = (start: number, end: number, dark: boolean): void => {
    const body = masked.slice(start, end);
    for (const m of body.matchAll(/(?:^|[;{\s"'])([-\w]+)\s*:([^;{}"']*)/g)) {
      const property = m[1]!.toLowerCase();
      const valueStart = start + m.index! + m[0].length - m[2]!.length;
      const kind = KIND_OF.find(([re]) => re.test(property))?.[1];
      const swapped: Array<[number, number]> = [];
      for (const a of kind && !dark && !property.startsWith('--') ? m[2]!.matchAll(ALIAS) : []) {
        const alias = aliases.get(a[1]!);
        const pair = alias && `${normalise(a[2]!)}|${normalise(alias)}`;
        const role = pair && !guardedReason(m[2]!, a.index!) && table[kind!].byPair.get(pair);
        if (!role) continue;
        const at = valueStart + a.index!;
        edits.push([at, at + a[0].length, `var(${role})`]);
        changes.push({ line: lineAt(at), property, literal: a[0], role });
        swapped.push([a.index!, a.index! + a[0].length]);
      }
      for (const v of kind && !dark && !property.startsWith('--') ? m[2]!.matchAll(VAR_USE) : []) {
        const light = pageLight.get(v[1]!);
        const alias = aliases.get(v[1]!);
        const pair = light && alias && `${normalise(light)}|${normalise(alias)}`;
        const role = pair && !guardedReason(m[2]!, v.index!) && table[kind!].byPair.get(pair);
        if (!role) continue;
        const at = valueStart + v.index!;
        edits.push([at, at + v[0].length, `var(${role})`]);
        changes.push({ line: lineAt(at), property, literal: v[0], role });
      }
      for (const lit of m[2]!.matchAll(LITERAL)) {
        if (swapped.some(([from, to]) => lit.index! >= from && lit.index! < to)) continue;
        const at = valueStart + lit.index!;
        const where = { line: lineAt(at), property, literal: lit[0] };
        const reason = property.startsWith('--')
          ? 'custom property'
          : dark
            ? 'dark context'
            : (guardedReason(m[2]!, lit.index!) ?? (kind ? undefined : 'property has no role'));
        const role = kind && !reason ? table[kind].byLight.get(normalise(lit[0])) : undefined;
        if (role) {
          edits.push([at, at + lit[0].length, `var(${role})`]);
          changes.push({ ...where, role });
        } else unmatched.push({ ...where, reason: reason ?? `no ${kind} role is ${lit[0]}` });
      }
    }
  };

  type Visit = (prelude: string, start: number, end: number, dark: boolean) => void;
  const visitDeclarations: Visit = (_prelude, start, end, dark) => declarations(start, end, dark);
  const collectPageLight: Visit = (prelude, start, end, dark) => {
    if (dark || prelude !== ':root') return;
    for (const m of masked.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
      const literal = lightLiteral(m[2]!);
      if (literal) pageLight.set(m[1]!, literal);
    }
  };

  const rules = (start: number, end: number, atRules: string[], visit: Visit): void => {
    let from = start;
    for (let i = start; i < end; i++) {
      const ch = masked[i];
      if (ch === ';' || ch === '}') from = i + 1;
      if (ch !== '{') continue;
      const prelude = masked.slice(from, i).trim();
      let depth = 1;
      let j = i + 1;
      for (; j < end && depth > 0; j++) depth += masked[j] === '{' ? 1 : masked[j] === '}' ? -1 : 0;
      if (prelude.startsWith('@')) rules(i + 1, j - 1, [...atRules, prelude], visit);
      else {
        const dark = DARK_SELECTOR.test(prelude) || atRules.some((a) => DARK_MEDIA.test(a));
        visit(prelude, i + 1, j - 1, dark);
      }
      i = j - 1;
      from = j;
    }
  };

  const styleBlocks = isTemplate
    ? [...masked.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)].map((m): [number, number] => {
        const start = m.index! + m[1]!.length;
        return [start, start + m[2]!.length];
      })
    : [[0, masked.length] as [number, number]];
  for (const visit of [collectPageLight, visitDeclarations]) {
    for (const [start, end] of styleBlocks) rules(start, end, [], visit);
  }
  if (isTemplate) {
    for (const m of masked.matchAll(/\bstyle=(["'])([\s\S]*?)\1/gi)) {
      const start = m.index! + m[0].indexOf(m[2]!);
      declarations(start, start + m[2]!.length, false);
    }
  }

  let out = text;
  for (const [from, to, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, from) + replacement + out.slice(to);
  }
  return { text: out, changes, unmatched };
}

function main(argv: string[]): void {
  const write = argv.includes('--write');
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: pnpm tsx scripts/website/tokenize-colours.ts <file...> [--write]');
    process.exit(2);
  }
  const table = roleTable(themeRoles());
  const surfaces = 'apps/website/ferni-website/src/css/dark-mode-surfaces.css';
  const aliases = rootAliases(fs.readFileSync(path.join(REPO_ROOT, surfaces), 'utf8'));
  for (const file of files) {
    const result = tokenize(
      fs.readFileSync(file, 'utf8'),
      table,
      file.endsWith('.njk') || file.endsWith('.html'),
      aliases
    );
    if (write && result.changes.length > 0) fs.writeFileSync(file, result.text);
    console.log(`\n${file}: ${result.changes.length} replaced, ${result.unmatched.length} left`);
    for (const c of result.changes)
      console.log(`  ${c.line}\t${c.property}: ${c.literal} → var(${c.role})`);
    for (const u of result.unmatched)
      console.log(`  ${u.line}\t${u.property}: ${u.literal}  (${u.reason})`);
  }
  if (!write) console.log('\nDry run: pass --write to apply.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
