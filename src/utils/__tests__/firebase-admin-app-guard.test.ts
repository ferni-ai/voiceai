/**
 * Nothing new may initialize firebase-admin itself or use its namespaced API.
 *
 * firebase-admin 14 removes the namespaced API (`import admin from 'firebase-admin'`,
 * `admin.firestore()`, `admin.apps`), and the default app must be initialized in one
 * place (getAdminApp in ../firebase-admin-app.ts) so its config doesn't depend on which
 * module runs first. The files below predate that and still initialize the app
 * themselves; remove a file from the list when you move it onto getAdminApp().
 *
 * The firebase-admin 14 bump does not wait for this list to empty. v14 still exports
 * initializeApp and getApps by name from firebase-admin/app, and these files already
 * call them that way with the same options they always passed, so the bump changes
 * none of their behaviour. Moving them onto getAdminApp() is separate work, and this
 * test keeps new direct initialization from coming back meanwhile.
 *
 * The root `firebase-admin` import is the namespaced API, so it is checked in every
 * tracked source file (src, scripts, apps), in any form TypeScript's import scanner
 * sees: static, re-export, `typeof import()`, `import()` and `require()`. Text inside
 * strings and templates (test fixtures) is not an import. Direct `initializeApp(` is
 * checked in src only.
 */
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const HELPER = 'src/utils/firebase-admin-app.ts';

const NOT_YET_MIGRATED = new Set([
  'src/agents/shared/performance/batch-firestore.ts',
  'src/agents/shared/shutdown-handler.ts',
  'src/agents/voice-agent/session-init-handler.ts',
  'src/api/v1/developers/auth-routes.ts',
  'src/api/v1/developers/shared/developer-auth.ts',
  'src/api/waitlist-routes.ts',
  'src/audio/music-transition-analytics.ts',
  'src/conversation/humanization/persistence.ts',
  'src/conversation/humanization/voice-pattern-learning.ts',
  'src/intelligence/semantic-intelligence/persistence.ts',
  'src/marketplace/billing/persistence.ts',
  'src/marketplace/persistence/firestore.ts',
  'src/marketplace/reviews/persistence.ts',
  'src/scripts/query-threads.ts',
  'src/services/admin-activity.ts',
  'src/services/admin/daily-report.ts',
  'src/services/analytics/user-analytics.ts',
  'src/services/billing/subscription-metrics.ts',
  'src/services/coaching/persistence.ts',
  'src/services/data-layer/ttl-cleanup.ts',
  'src/services/games/game-analytics.ts',
  'src/services/gtm/gtm-storage.ts',
  'src/services/identity/firebase-auth.ts',
  'src/services/outreach/firestore-persistence.ts',
  'src/services/outreach/unified-delivery.ts',
  'src/services/pubsub/worker-main.ts',
  'src/services/self-healing/health-monitors.ts',
  'src/services/trust-systems/notification-delivery.ts',
  'src/tests/setup.ts',
  'src/utils/__tests__/firestore-ref-wrapping.test.ts',
]);

const ROOT_SPECIFIER = 'firebase-admin';
const DIRECT_INIT = /\binitializeApp\(/;
const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs', '*.jsx'];

function importsRoot(text: string): boolean {
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.some(({ fileName }) => fileName === ROOT_SPECIFIER);
}

/** Every tracked or new (not ignored) JS/TS file in the repo, repo-relative. */
function repoSourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SOURCE_GLOBS],
    { cwd: REPO_ROOT, maxBuffer: 1 << 28 }
  );
  return out.toString('utf8').split('\0').filter(Boolean);
}

function isExempt(file: string): boolean {
  return file === HELPER || file.startsWith('src/utils/__tests__/firebase-admin-app');
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function offenders(): string[] {
  const directInit = tsFiles(join(REPO_ROOT, 'src'))
    .map((path) => ({ file: relative(REPO_ROOT, path), text: readFileSync(path, 'utf8') }))
    .filter(({ file, text }) => !isExempt(file) && DIRECT_INIT.test(text))
    .map(({ file }) => file);
  const rootImport = repoSourceFiles().filter(
    (file) => !isExempt(file) && importsRoot(readFileSync(join(REPO_ROOT, file), 'utf8'))
  );
  return [...new Set([...directInit, ...rootImport])].sort();
}

describe('firebase-admin is initialized in one place', () => {
  it('the root import is found in every form the scanner reads, and not inside strings', () => {
    expect(importsRoot("import admin from 'firebase-admin';")).toBe(true);
    expect(importsRoot("const a = (await import('firebase-admin')).default;")).toBe(true);
    expect(importsRoot("let p: Promise<typeof import('firebase-admin')> | null = null;")).toBe(
      true
    );
    expect(importsRoot("const admin = require('firebase-admin');")).toBe(true);
    expect(importsRoot("export * from 'firebase-admin';")).toBe(true);
    expect(importsRoot("import { getApps } from 'firebase-admin/app';")).toBe(false);
    expect(importsRoot('const s = "await import(\'firebase-admin\')";')).toBe(false);
    expect(importsRoot("const s = `\nimport admin from 'firebase-admin';\n`;")).toBe(false);
  });

  it('no file outside the migration list imports the namespaced API or calls initializeApp', () => {
    const unexpected = offenders().filter((file) => !NOT_YET_MIGRATED.has(file));
    expect(unexpected, `use getAdminApp()/getAdminFirestore() from ${HELPER}`).toEqual([]);
  });

  it('the migration list only names files that still need migrating', () => {
    const stillOffending = new Set(offenders());
    const migrated = [...NOT_YET_MIGRATED].filter((file) => !stillOffending.has(file));
    expect(migrated, 'remove these from NOT_YET_MIGRATED').toEqual([]);
  });
});
