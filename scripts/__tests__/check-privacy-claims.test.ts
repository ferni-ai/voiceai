/**
 * The privacy-claims guard: it must catch the promises Ferni can't keep, leave
 * true sentences alone, honour the allowlist, and find nothing in the repo.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAllowlist, scanRepo, scanText } from '../check-privacy-claims.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('scanText', () => {
  it.each([
    ['What you tell us stays between us.', 'stays-between-us'],
    ['This stays just between us, I promise.', 'stays-between-us'],
    ['Never spam, never shared.', 'never-shared'],
    ['Your conversations are encrypted and never sold or shared.', 'never-shared'],
    ['We don’t store your conversations.', 'we-dont-store'],
    ['Only you can see what you tell Ferni.', 'only-you-can-see'],
    ['Your conversations are end-to-end encrypted.', 'end-to-end-encrypted'],
    ['Encrypted end-to-end', 'end-to-end-encrypted'],
    ['Your data stays private. Always.', 'data-stays-private'],
  ])('flags %j', (line, id) => {
    expect(scanText(line, 'x.njk').map((f) => f.id)).toEqual([id]);
  });

  it.each([
    'Ferni saves your conversations so it can remember you next time.',
    'We never sell your data. Outside providers process it to make Ferni work.',
    'Deleting your account erases it.',
    "Just between us, you're one of our favorites.",
    "We don't store timestamps, so we rely on the caller to clean up.",
  ])('leaves %j alone', (line) => {
    expect(scanText(line, 'x.njk')).toEqual([]);
  });

  it('reports the line number', () => {
    expect(scanText('ok\nok\nnever shared', 'a.ts')[0]).toMatchObject({ file: 'a.ts', line: 3 });
  });
});

describe('scanRepo', () => {
  function fakeRepo(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-claims-'));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
  }

  it('finds a claim in website, app strings and server copy, and skips tests', () => {
    const root = fakeRepo({
      'apps/website/ferni-website/src/index.njk': '<p>What you tell us stays between us.</p>',
      'apps/web/src/i18n/locales/en-US.json': '{ "note": "Your data stays private." }',
      'src/api/routes/landing.ts': "const a = 'end-to-end encrypted';",
      'src/api/__tests__/landing.test.ts': "expect('never shared')",
      'src/api/routes/landing.test.ts': "expect('never shared')",
    });
    expect(scanRepo(root, []).map((f) => f.file)).toEqual([
      'apps/website/ferni-website/src/index.njk',
      'src/api/routes/landing.ts',
      'apps/web/src/i18n/locales/en-US.json',
    ]);
  });

  it('honours an allowlist entry only for its own file', () => {
    const line = '<p>Your bank login is never shared with me.</p>';
    const root = fakeRepo({
      'apps/website/ferni-website/src/a.njk': line,
      'apps/website/ferni-website/src/b.njk': line,
    });
    const allow = [
      { file: 'apps/website/ferni-website/src/a.njk', contains: 'bank login', reason: 'Plaid' },
    ];
    expect(scanRepo(root, allow).map((f) => f.file)).toEqual([
      'apps/website/ferni-website/src/b.njk',
    ]);
  });
});

describe('this repo', () => {
  it('makes no privacy promise Ferni cannot keep', () => {
    expect(scanRepo(REPO, loadAllowlist(REPO))).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const stale = loadAllowlist(REPO).filter((a) => {
      const abs = path.join(REPO, a.file);
      return !fs.existsSync(abs) || !fs.readFileSync(abs, 'utf8').includes(a.contains);
    });
    expect(stale).toEqual([]);
  });
});
