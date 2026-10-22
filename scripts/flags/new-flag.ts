/**
 * pnpm flags:new NAME --default off --owner voice --kind experiment [--note "..."]
 *
 * Writes src/config/flags/NAME.ts and regenerates the flag barrel, so a new flag
 * touches no shared hand-edited file. --note becomes the comment above the entry:
 * say what "on" does and where it is read.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { FLAG_KINDS, FLAG_OWNERS } from '../../src/config/flag-spec.js';

export interface NewFlag {
  name: string;
  default: string;
  owner: string;
  kind: string;
  note?: string;
}

const NAME = /^[A-Z][A-Z0-9_]*$/;
const VALUE = /^[\w.-]+$/;

export function parseNewFlag(argv: string[]): NewFlag {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      default: { type: 'string' },
      owner: { type: 'string' },
      kind: { type: 'string' },
      note: { type: 'string' },
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
  if (problems.length > 0) throw new Error(`flags:new needs ${problems.join(', ')}`);
  return { ...(flag as Omit<NewFlag, 'note'>), note: values.note };
}

export function flagFileSource(flag: NewFlag): string {
  const note = (flag.note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `// ${line}\n`)
    .join('');
  return (
    "import type { FlagSpec } from '../flag-spec.js';\n\n" +
    note +
    `export const ${flag.name} = {\n` +
    `  default: '${flag.default}',\n` +
    `  owner: '${flag.owner}',\n` +
    `  kind: '${flag.kind}',\n` +
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const file = writeNewFlag(process.cwd(), parseNewFlag(process.argv.slice(2)));
    console.log(`Wrote ${file}`);
    execFileSync('pnpm', ['flags:gen'], { stdio: 'inherit' });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
