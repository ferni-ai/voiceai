/**
 * pnpm flags:new NAME --default off --owner voice --kind experiment [--note "..."]
 *   [--expires YYYY-MM-DD] [--issue '#123'] [--context "what decides it"]
 *
 * Writes src/config/flags/NAME.ts and regenerates the flag barrel, so a new flag
 * touches no shared hand-edited file. --note becomes the comment above the entry:
 * say what "on" does and where it is read. An experiment gets expires (default:
 * 90 days out) and issue (default 'TBD'); the manifest test fails once it expires.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FLAG_KINDS, FLAG_OWNERS } from '../../src/config/flag-spec.js';

export interface NewFlag {
  name: string;
  default: string;
  owner: string;
  kind: string;
  note?: string;
  expires?: string;
  issue?: string;
  context?: string;
}

/**
 * Mirrors DEFAULT_EXPERIMENT_DAYS and ISSUE_TBD in src/config/flag-lifecycle.ts (a test
 * keeps them equal). Not imported: flags:migrate copies scripts/flags into a scratch repo
 * that has only the flag-spec files.
 */
export const EXPERIMENT_DAYS = 90;
export const ISSUE_PLACEHOLDER = 'TBD';

const NAME = /^[A-Z][A-Z0-9_]*$/;
const VALUE = /^[\w.-]+$/;

export function parseNewFlag(argv: string[], today: Date = new Date()): NewFlag {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      default: { type: 'string' },
      owner: { type: 'string' },
      kind: { type: 'string' },
      note: { type: 'string' },
      expires: { type: 'string' },
      issue: { type: 'string' },
      context: { type: 'string' },
    },
  });
  const [name] = positionals;
  const flag = { name, default: values.default, owner: values.owner, kind: values.kind };
  const problems = [
    positionals.length === 1 && NAME.test(name ?? '') ? '' : 'one NAME in UPPER_SNAKE_CASE',
    VALUE.test(flag.default ?? '') ? '' : '--default <value> (off, on or a mode word)',
    (FLAG_OWNERS as readonly string[]).includes(flag.owner ?? '')
      ? ''
      : `--owner ${FLAG_OWNERS.join('|')}`,
    (FLAG_KINDS as readonly string[]).includes(flag.kind ?? '')
      ? ''
      : `--kind ${FLAG_KINDS.join('|')}`,
  ].filter(Boolean);
  if (values.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.expires)) {
    problems.push('--expires YYYY-MM-DD');
  }
  if (problems.length > 0) throw new Error(`flags:new needs ${problems.join(', ')}`);
  const out: NewFlag = { ...(flag as Omit<NewFlag, 'note'>), note: values.note };
  if (flag.kind === 'experiment') {
    const later = new Date(today.getTime() + EXPERIMENT_DAYS * 86_400_000);
    out.expires = values.expires ?? later.toISOString().slice(0, 10);
    out.issue = values.issue ?? ISSUE_PLACEHOLDER;
  }
  if (values.context) out.context = values.context;
  return out;
}

export function flagFileSource(flag: NewFlag): string {
  const note = (flag.note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `// ${line}`);
  return flagFileText(flag.name, flag, note);
}

/** Optional FlagSpec fields, written after kind in this order when set. */
const LIFECYCLE_KEYS = ['expires', 'issue', 'context'] as const;

/** A flag file: the comment lines verbatim above the export (flags:move uses this too). */
export function flagFileText(
  name: string,
  spec: Omit<NewFlag, 'name'>,
  comments: string[]
): string {
  return (
    "import type { FlagSpec } from '../flag-spec.js';\n\n" +
    comments.map((line) => `${line}\n`).join('') +
    `export const ${name} = {\n` +
    `  default: '${spec.default}',\n` +
    `  owner: '${spec.owner}',\n` +
    `  kind: '${spec.kind}',\n` +
    LIFECYCLE_KEYS.filter((k) => spec[k] !== undefined)
      .map((k) => `  ${k}: '${String(spec[k]).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',\n`)
      .join('') +
    '} as const satisfies FlagSpec;\n'
  );
}

/** Writes src/config/flags/NAME.ts under root; refuses a name that already exists anywhere. */
export function writeNewFlag(root: string, flag: NewFlag): string {
  const config = join(root, 'src', 'config');
  const file = join(config, 'flags', `${flag.name}.ts`);
  if (existsSync(file))
    throw new Error(`${flag.name} already has src/config/flags/${flag.name}.ts`);
  const entry = new RegExp(`^\\s*${flag.name}: \\{`, 'm');
  for (const legacy of readdirSync(config).filter((f) => /^flag-manifest[\w-]*\.ts$/.test(f))) {
    if (entry.test(readFileSync(join(config, legacy), 'utf8'))) {
      throw new Error(`${flag.name} is already in src/config/${legacy}`);
    }
  }
  writeFileSync(file, flagFileSource(flag));
  return file;
}

/** True when the module at url is the script node was started with, through any symlink. */
export const isMain = (url: string): boolean =>
  !!process.argv[1] && realpathSync(fileURLToPath(url)) === realpathSync(process.argv[1]);

if (isMain(import.meta.url)) {
  try {
    const file = writeNewFlag(process.cwd(), parseNewFlag(process.argv.slice(2)));
    console.log(`Wrote ${file}`);
    execFileSync('pnpm', ['flags:gen'], { stdio: 'inherit' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
