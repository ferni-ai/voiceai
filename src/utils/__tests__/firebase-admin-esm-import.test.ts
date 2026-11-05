/**
 * firebase-admin 14 has no namespaced API. Under plain Node ESM (how the built agent
 * runs), `await import('firebase-admin')` has no `apps` on the namespace or on
 * `.default`; only the named app functions (initializeApp, getApps, ...) are left.
 * Vitest's interop can hide shape changes like this, so code reading `admin.apps.length`
 * would pass its tests and then throw in production. This pins the real shape outside
 * vitest. The firebase-admin-app guard keeps the root import out of the code entirely;
 * use firebase-admin/app, /firestore, /auth or /messaging.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

describe('firebase-admin dynamic import', () => {
  it('has no namespaced API under plain Node ESM, only the named app functions', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m = await import('firebase-admin'); console.log(typeof m.apps, typeof m.default.apps, typeof m.initializeApp)",
      ],
      { cwd: SRC, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('undefined undefined function');
  });
});
