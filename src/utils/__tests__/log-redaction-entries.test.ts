/**
 * Phone numbers are masked in a process's logs only after it has imported
 * utils/log-redaction-install.ts. Before that import nothing is masked, and the app
 * logger keeps the first sink it builds, so one line logged ahead of the install
 * leaves that process unmasked until it exits. Every deployed entry point therefore
 * imports the install before anything else, directly or as the first import of its own
 * first import; the context service imported it nowhere.
 *
 * Also here: normalizePhone's warning carried the number itself, in both copies of the
 * function (utils/validation.ts, and tools/validation.ts, which the text and call tools
 * reach through validatePhone). `phone` is a key the redaction masks; `cleaned` is not,
 * and a number followed by an extension was printed whole. The line now carries lengths.
 *
 * Not seen here: a process started some other way than a Dockerfile CMD or the per-call
 * child; and whether a module the install itself imports logs while it loads.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lines = vi.hoisted(() => [] as unknown[][]);
vi.mock('../safe-logger.js', () => {
  const keep = (...args: unknown[]): void => void lines.push(args);
  const logger = { debug: keep, info: keep, warn: keep, error: keep, child: () => logger };
  return { getLogger: () => logger, createLogger: () => logger, safeLog: () => logger };
});

import { deployedEntries } from '../../tests/helpers/deployed-entries.js';
import { normalizePhone as toolsNormalizePhone, validatePhone } from '../../tools/validation.js';
import { keyContext, NO_CONTEXT } from '../log-object-redaction.js';
import { normalizePhone } from '../validation.js';

const ROOT = join(__dirname, '..', '..', '..');
const INSTALL = 'utils/log-redaction-install.js';

/** A deployed entry as its source file: dist/x.js is built from src/x.ts. */
const sourceOf = (entry: string): string =>
  entry.startsWith('dist/') ? entry.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts') : entry;

/** A source text without its comments: a commented-out line is not code. */
const codeOf = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The module a source text imports first, when that import runs the module: `import 'x'`
 * or `await import('x')`. An `import type`, or an import of names (which the compiler
 * drops when no name is used as a value), is reported as what it is, and matches nothing.
 */
function firstImportIn(text: string): string | undefined {
  const first = /^\s*(?:await\s+)?import\b[^'"]*['"]([^'"]+)['"]/m.exec(codeOf(text));
  if (!first) return undefined;
  const runsIt = /^\s*(?:import\s*|await\s+import\(\s*)['"]/.test(first[0]);
  return runsIt ? first[1] : `not a side-effect import: ${first[0].trim()}`;
}
const firstImport = (file: string): string | undefined =>
  firstImportIn(readFileSync(join(ROOT, file), 'utf8'));

/**
 * The first import of a file, then the first import of that module, and so on, until the
 * install or a module outside the repository. Each hop is evaluated before anything else
 * its importer names, so a chain that ends at the install runs it before any other module.
 */
function firstImports(file: string): string[] {
  const chain: string[] = [];
  let current = file;
  for (let hop = 0; hop < 4; hop++) {
    const first = firstImport(current);
    if (first === undefined) break;
    chain.push(first);
    if (first.endsWith(INSTALL) || !first.startsWith('.')) break;
    current = join(dirname(current), first).replace(/\.js$/, '.ts');
  }
  return chain;
}

/** Deployed, but not a file this census can read. */
const NOT_READ: Record<string, string> = {
  'token-server.js': 'the landing token server: plain JavaScript outside src/',
};

/** Entries that reach the install through a module of their own. Every other entry imports it directly. */
const VIA: Record<string, string[]> = {
  // index.ts is over the size limit and may not grow: its first imports live in one module.
  'dist/servers/api/index.js': ['./first-imports.js', '../../utils/log-redaction-install.js'],
};

describe('every deployed process installs the phone redaction before anything else', () => {
  const entries = [...new Set(deployedEntries())];

  it('finds the deployed entries', () => {
    expect(entries).toEqual(
      expect.arrayContaining([
        'dist/agent.js',
        'dist/servers/api/index.js',
        'dist/services/context-service/server.js',
      ])
    );
  });

  it.each(entries.filter((entry) => !(entry in NOT_READ)))('%s', (entry) => {
    const chain = firstImports(sourceOf(entry));
    expect(chain.at(-1), `${sourceOf(entry)} imports ${chain.join(', then ')} first`).toMatch(
      new RegExp(`${INSTALL.replace(/[./]/g, '\\$&')}$`)
    );
    if (entry in VIA) expect(chain).toEqual(VIA[entry]);
    else expect(chain).toHaveLength(1);
  });

  it('every entry listed as going through its own module is still deployed', () => {
    for (const entry of Object.keys(VIA)) expect(entries).toContain(entry);
  });

  it('importing the install module installs it', () => {
    const code = codeOf(readFileSync(join(ROOT, 'src', INSTALL.replace(/\.js$/, '.ts')), 'utf8'));
    expect(code).toMatch(/^installLogPhoneRedaction\(\);$/m);
  });

  it('every entry left unread is still deployed', () => {
    for (const entry of Object.keys(NOT_READ)) expect(entries).toContain(entry);
  });

  it('the per-call child starts with instrument.ts, which starts with the install', () => {
    expect(firstImports('src/agents/gce/job-child.ts')).toEqual([
      '../../instrument.js',
      `./${INSTALL}`,
    ]);
  });

  it.each([
    ["import './a.js';\nimport './b.js';", './a.js'],
    ["/** doc with import 'x' */\n// import './c.js';\nimport './d.js';", './d.js'],
    ["import type {} from './g.js';", "not a side-effect import: import type {} from './g.js'"],
    ["import { a } from './h.js';", "not a side-effect import: import { a } from './h.js'"],
    ["import {} from './i.js';", "not a side-effect import: import {} from './i.js'"],
    ["const x = 1;\nawait import('./e.js');\nimport './f.js';", './e.js'],
  ])('reads the first import of %j', (text, expected) => {
    expect(firstImportIn(text)).toBe(expected);
  });
});

describe('the census throws on an image it cannot read', () => {
  const roots: string[] = [];
  const image = (name: string, text: string): string[] => {
    const root = mkdtempSync(join(tmpdir(), 'deployed-entries-'));
    roots.push(root);
    mkdirSync(join(root, 'docker'));
    writeFileSync(join(root, name), `FROM node\n${text}\n`);
    return deployedEntries(root);
  };
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('reads CMD ["node", "dist/x.js"] and CMD ["pnpm", "exec", "tsx", "src/y.ts"]', () => {
    expect(image('docker/Dockerfile.a', 'CMD ["node", "dist/x.js", "dev"]')).toEqual(['dist/x.js']);
    expect(image('Dockerfile.b', 'CMD ["pnpm", "exec", "tsx", "src/y.ts"]')).toEqual(['src/y.ts']);
  });

  it.each([
    ['no start line', 'RUN true'],
    ['a shell-form CMD', 'CMD node dist/x.js'],
    ['an ENTRYPOINT', 'ENTRYPOINT ["node", "dist/x.js"]'],
    ['an ENTRYPOINT beside a CMD', 'ENTRYPOINT ["node"]\nCMD ["dist/x.js"]'],
    ['a CMD that names no script', 'CMD ["nginx", "-g", "daemon off;"]'],
  ])('%s', (_case, text) => {
    expect(() => image('docker/Dockerfile.new', text)).toThrow(/Dockerfile\.new: every start line/);
  });

  it("a HEALTHCHECK's CMD is not a start line", () => {
    const text = 'HEALTHCHECK --interval=30s \\\n  CMD wget -q http://localhost/health || exit 1';
    expect(image('docker/Dockerfile.a', `${text}\nCMD ["node", "dist/x.js"]`)).toEqual([
      'dist/x.js',
    ]);
    expect(() => image('docker/Dockerfile.new', text)).toThrow(/Dockerfile\.new: every start line/);
  });

  it('other files in docker/ are not images', () => {
    expect(image('docker/README.md', 'CMD node dist/x.js')).toEqual([]);
  });
});

const NORMALIZERS: Array<[string, (input: string) => string | null]> = [
  ['utils/validation.ts normalizePhone', normalizePhone],
  ['tools/validation.ts normalizePhone', toolsNormalizePhone],
  [
    'tools/validation.ts validatePhone (the text and call tools)',
    (input) => {
      const { sanitized } = validatePhone(input);
      return typeof sanitized === 'string' ? sanitized : null;
    },
  ],
];

describe.each(NORMALIZERS)(
  '%s: the warning carries lengths, not the number',
  (_name, normalize) => {
    beforeEach(() => {
      lines.length = 0;
    });

    it.each([
      ['a number followed by an extension', '(415) 555-0123 ext 456789'],
      ['a number pasted twice', '41555501234155550123'],
      ['seven digits', '555-0123'],
      ['a national number with a leading 0', '02079460958'],
    ])('%s', (_case, input) => {
      expect(normalize(input)).toBeNull();
      expect(lines).toHaveLength(1);
      // No run of the input's digits: four in a row would be the masked form's whole tail.
      expect(JSON.stringify(lines[0])).not.toMatch(/\d{4}/);
      const fields = lines[0][0] as Record<string, unknown>;
      expect(fields).toEqual({
        inputLength: input.length,
        digitCount: input.replace(/\D/g, '').length,
      });
      // The redaction reads neither key as a number's, so it leaves the counts as they are.
      for (const key of Object.keys(fields)) expect(keyContext(key), key).toBe(NO_CONTEXT);
    });

    it('a valid number logs nothing', () => {
      expect(normalize('+14155550123')).toBe('+14155550123');
      expect(lines).toHaveLength(0);
    });
  }
);
