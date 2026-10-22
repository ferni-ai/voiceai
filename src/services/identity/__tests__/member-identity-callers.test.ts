/**
 * Every "is this a member?" decision goes through isMemberIdentity
 * (services/identity/member-identity.ts, on utils/synthetic-user.ts markers).
 *
 * `userId !== 'anonymous'` is a blocklist: unrecognised callers (anon:<uuid>)
 * and the third party on a call Ferni places (onbehalf:<callId>) pass it, so
 * their words were stored as a member's memories and scores. Ad-hoc
 * `startsWith('anon:')` checks and private placeholder lists drift the same
 * way. This test fails on a new literal member check anywhere in src. It lives
 * here, not in src/tests, so it runs on every PR.
 *
 * What counts as a literal member check (quotes or backticks, across lines):
 * - a comparison to 'anonymous'
 * - an id (userId, uid, callerId, ownerId) compared to 'unknown', 'default' or 'shared'
 * - startsWith('anon:' | 'onbehalf:') or a /^anon:/ /^onbehalf:/ regex
 * - an array or Set literal holding 'anonymous', or .includes/.has('anonymous')
 *
 * The sites that are not member gates are in member-identity-callers.allowlist.json:
 * per file, how many matches it may have, a category and why. A file that gains
 * a match fails; an entry whose matches are gone fails as stale.
 *
 * @module services/identity/__tests__/member-identity-callers.test
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');
/** Where the markers are defined, and so may be named. */
const DEFINITIONS = new Set(['services/identity/member-identity.ts', 'utils/synthetic-user.ts']);

/**
 * enum: compares an enum, not an id. cache: an in-process cache for this call.
 * non-user-id: the value is not used as a user id. inverse: the check WANTS a
 * non-member id. pending: a real gate waiting on another PR.
 */
const CATEGORIES = ['enum', 'cache', 'non-user-id', 'inverse', 'pending'] as const;
interface AllowEntry {
  file: string;
  count: number;
  category: (typeof CATEGORIES)[number];
  reason: string;
  /** Only for 'pending': the PR it waits on ("#1234"), or "<branch> (no PR yet)". */
  waitsOn?: string;
}
const allowlist = JSON.parse(
  readFileSync(join(__dirname, 'member-identity-callers.allowlist.json'), 'utf8')
) as AllowEntry[];

const Q = '[\'"`]';
const ID = '[\\w$.?]*(?:userId|UserId|uid|Uid|callerId|CallerId|ownerId|OwnerId|user_id)\\b';
const PATTERNS: RegExp[] = [
  new RegExp(`[!=]==\\s*${Q}anonymous${Q}|${Q}anonymous${Q}\\s*[!=]==`, 'g'),
  new RegExp(`${ID}\\s*[!=]==\\s*${Q}(?:unknown|default|shared)${Q}`, 'g'),
  new RegExp(`${Q}(?:unknown|default|shared)${Q}\\s*[!=]==\\s*${ID}`, 'g'),
  new RegExp(`startsWith\\(\\s*${Q}(?:anon|onbehalf):${Q}\\s*\\)`, 'g'),
  /\/\^(?:anon|onbehalf):/g,
  new RegExp(`\\[[^\\[\\]]*${Q}anonymous${Q}[^\\[\\]]*\\]`, 'g'),
  new RegExp(`\\.(?:includes|has)\\(\\s*${Q}anonymous${Q}`, 'g'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return ['__tests__', '__mocks__', 'tests', 'node_modules'].includes(name)
        ? []
        : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** How many literal member checks this text holds. */
function literalMemberChecks(text: string): number {
  return PATTERNS.reduce((n, pattern) => n + (text.match(pattern)?.length ?? 0), 0);
}

function countsBySourceFile(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of sourceFiles(SRC)) {
    const file = relative(SRC, path);
    if (DEFINITIONS.has(file)) continue;
    const n = literalMemberChecks(readFileSync(path, 'utf8'));
    if (n > 0) counts.set(file, n);
  }
  return counts;
}

describe('member identity callers', () => {
  const counts = countsBySourceFile();
  const allowed = new Map(allowlist.map((entry) => [entry.file, entry]));

  it('no source file adds a literal member check', () => {
    const offenders = [...counts]
      .filter(([file, n]) => n !== (allowed.get(file)?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} (allowlisted: ${allowed.get(file)?.count ?? 0})`);
    expect(offenders).toEqual([]);
  });

  it('every allowlist entry still matches what it allows (no stale entries)', () => {
    const stale = allowlist.filter((entry) => !counts.has(entry.file)).map((entry) => entry.file);
    expect(stale).toEqual([]);
  });

  it('every entry names its category and says why', () => {
    for (const entry of allowlist) {
      expect(CATEGORIES, entry.file).toContain(entry.category);
      expect(entry.count, entry.file).toBeGreaterThan(0);
      expect(entry.reason.split(/\s+/).length, entry.file).toBeGreaterThanOrEqual(8);
      if (entry.category === 'pending') {
        expect(entry.waitsOn ?? '', entry.file).toMatch(/^#\d+$|\(no PR yet\)$/);
      } else {
        expect(entry.waitsOn, entry.file).toBeUndefined();
      }
    }
    expect(new Set(allowlist.map((e) => e.file)).size).toBe(allowlist.length);
  });

  it.each([
    "if (!userId || userId === 'anonymous') return;",
    'if (userId !== "anonymous") save(userId);',
    'if (userId !== `anonymous`) save(userId);',
    "if ('anonymous' === ctx.userId) return;",
    "if (\n  userId !==\n    'anonymous'\n) return;",
    "if (ctx.userId === 'unknown') return;",
    "if ('shared' !== userId) save();",
    "return !id.startsWith('anon:');",
    "if (id.startsWith( 'onbehalf:' )) return;",
    'if (/^anon:/.test(userId)) return;',
    "if (['anonymous', 'default'].includes(userId)) return;",
    "const NOBODY = new Set([\n  'anonymous',\n  'unknown',\n]);",
    "if (placeholders.has('anonymous')) return;",
  ])('catches %j', (text) => {
    expect(literalMemberChecks(text)).toBe(1);
  });

  it.each([
    "const userId = services?.userId || 'anonymous';",
    'if (!isMemberIdentity(userId)) return;',
    "log.info('anonymous caller');",
    "if (voice === 'default') return;",
    "if (mode === 'unknown') return;",
  ])('ignores %j', (text) => {
    expect(literalMemberChecks(text)).toBe(0);
  });
});
