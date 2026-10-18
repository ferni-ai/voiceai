/**
 * Every "is this a member?" decision goes through isMemberIdentity
 * (services/identity/member-identity.ts).
 *
 * `userId !== 'anonymous'` is a blocklist: unrecognised callers (anon:<uuid>)
 * and the third party on a call Ferni places (onbehalf:<callId>) pass it, so
 * their words were stored as a member's memories and scores. Ad-hoc
 * `startsWith('anon:')` checks drift the same way. This test fails on a new
 * literal comparison in src. The few that are not member gates (a provider
 * enum, an in-process cache keyed by id) are listed with a reason in
 * member-identity-callers.allowlist.json.
 *
 * @module tests/member-identity-callers.test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const allowlist = JSON.parse(
  readFileSync(join(__dirname, 'member-identity-callers.allowlist.json'), 'utf8')
) as Array<{ file: string; line: string; reason: string }>;
const PREDICATE = 'services/identity/member-identity.ts';
const LITERAL_CHECK =
  /[!=]==\s*['"]anonymous['"]|['"]anonymous['"]\s*[!=]==|startsWith\(\s*['"](anon|onbehalf):['"]\s*\)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'tests' || name === 'node_modules'
        ? []
        : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

/** Every literal member check in src, as "file: trimmed line". */
function literalMemberChecks(files: Array<{ file: string; text: string }>): string[] {
  return files.flatMap(({ file, text }) =>
    text
      .split('\n')
      .filter((line) => LITERAL_CHECK.test(line))
      .map((line) => `${file}: ${line.trim()}`)
  );
}

const allowed = new Set(allowlist.map((entry) => `${entry.file}: ${entry.line}`));

describe('member identity callers', () => {
  it('no source file compares a user id to a literal non-member marker', () => {
    const files = sourceFiles(SRC)
      .map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }))
      .filter(({ file }) => file !== PREDICATE);
    const offenders = literalMemberChecks(files).filter((hit) => !allowed.has(hit));
    expect(offenders).toEqual([]);
  });

  it('every allowlisted site says why it is not a member gate', () => {
    for (const entry of allowlist) expect(entry.reason.length, entry.file).toBeGreaterThan(20);
  });

  it.each([
    "if (!userId || userId === 'anonymous') return;",
    'if (userId !== "anonymous") save(userId);',
    "if ('anonymous' === ctx.userId) return;",
    "return !id.startsWith('anon:');",
    "if (id.startsWith( 'onbehalf:' )) return;",
  ])('catches %s', (line) => {
    expect(literalMemberChecks([{ file: 'x.ts', text: line }])).toHaveLength(1);
  });

  it.each([
    "const userId = services?.userId || 'anonymous';",
    'if (!isMemberIdentity(userId)) return;',
    "log.info('anonymous caller');",
  ])('ignores %s', (line) => {
    expect(literalMemberChecks([{ file: 'x.ts', text: line }])).toHaveLength(0);
  });
});
