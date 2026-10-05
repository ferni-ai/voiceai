/**
 * Unawaited promises in HTTP handlers must fail `pnpm lint` (CI's lint step).
 *
 * PR #295 fixed eleven `const auth = requireAdmin(req, res); if (!auth) return true;`
 * sites: a Promise is always truthy, so admin writes ran unauthenticated.
 * @typescript-eslint/no-misused-promises was already an error and flags that line,
 * but `pnpm lint` never ran it there: the script passed an unquoted src/**\/*.ts,
 * which sh expands with ** meaning *, so it linted src/<dir>/<file>.ts only
 * (1,037 of 5,995 files) and none of src/api/v1/admin/.
 *
 * This pins both halves: the lint script reaches every file under src/api and
 * src/servers, and the config those files get makes both promise rules errors
 * with type information.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const HANDLER_GLOB = 'src/{api,servers}/**/*.ts';

function lintScript(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  return pkg.scripts.lint;
}

/** The file arguments of an npm script: quoted ones reach eslint verbatim, unquoted ones go through sh. */
function fileArgs(script: string): { quoted: string[]; unquoted: string[] } {
  const quoted = [...script.matchAll(/'(src[^']*)'/g)].map((m) => m[1]);
  const unquoted = script
    .replace(/'[^']*'/g, '')
    .split(/\s+/)
    .filter((token) => token.startsWith('src'));
  return { quoted, unquoted };
}

describe('pnpm lint covers the HTTP handlers', () => {
  it('passes every src glob quoted, so sh never expands ** as *', () => {
    expect(fileArgs(lintScript()).unquoted).toEqual([]);
  });

  it('reaches every .ts file under src/api and src/servers, including the #295 sites', () => {
    const linted = new Set(
      fileArgs(lintScript()).quoted.flatMap((g) => globSync(g, { cwd: ROOT }))
    );
    const handlers = globSync(HANDLER_GLOB, { cwd: ROOT });

    expect(handlers.length).toBeGreaterThan(300);
    expect(linted).toContain('src/api/v1/admin/flags.ts');
    expect(linted).toContain('src/servers/api/routes/push.ts');
    expect(handlers.filter((file) => !linted.has(file))).toEqual([]);
  });
});

describe('the config for handler files', () => {
  const eslint = new ESLint({ cwd: ROOT });

  it.each(['src/api/v1/admin/flags.ts', 'src/servers/api/routes/push.ts'])(
    '%s: promise rules are errors with type information',
    async (file) => {
      const config = (await eslint.calculateConfigForFile(join(ROOT, file))) as {
        rules: Record<string, unknown[]>;
        languageOptions: { parserOptions: { project?: unknown } };
      };

      expect(config.languageOptions.parserOptions.project).toBe('./tsconfig.json');
      expect(config.rules['@typescript-eslint/no-misused-promises']).toEqual([
        2,
        { checksConditionals: true },
      ]);
      expect(config.rules['@typescript-eslint/no-floating-promises']?.[0]).toBe(2);
    }
  );
});
