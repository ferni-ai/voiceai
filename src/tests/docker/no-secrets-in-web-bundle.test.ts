/**
 * Everything Vite exposes as VITE_* is compiled into public JavaScript. This
 * guard keeps credential-shaped VITE_* names to the ones that are public by
 * design, so a server secret (like the admin API key that cloudbuild-ui.yaml
 * once passed as VITE_ADMIN_API_KEY) cannot be baked into the bundle again.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

/** Credential-shaped names that are safe to ship: they grant nothing on any server. */
const PUBLIC_BY_DESIGN = new Set([
  'VITE_FIREBASE_API_KEY', // Firebase web config; access is enforced by security rules
  'VITE_VAPID_PUBLIC_KEY', // the public half of the web-push key pair
  'VITE_STRIPE_PUBLISHABLE_KEY', // Stripe's browser key
  // Hides the dev panel behind ?dev=<key>. Readable in the bundle like any VITE_*
  // value; acceptable only because a production build's panel makes no server
  // writes (dev-panel.ui.ts skips them unless import.meta.env.DEV).
  'VITE_DEV_PANEL_KEY',
]);

const CREDENTIAL_SHAPED = /^VITE_[A-Z0-9_]*_(KEY|SECRET|TOKEN|PASSWORD|PAT)$/;

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

/** VITE_* names a source or build file reads or sets, with where. */
function viteNames(files: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of files) {
    for (const [name] of readFileSync(file, 'utf8').matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
      const where = found.get(name) ?? [];
      where.push(relative(ROOT, file));
      found.set(name, where);
    }
  }
  return found;
}

function credentialShapedSecrets(files: string[]): string[] {
  return [...viteNames(files)]
    .filter(([name]) => CREDENTIAL_SHAPED.test(name) && !PUBLIC_BY_DESIGN.has(name))
    .map(([name, where]) => `${name} in ${[...new Set(where)].join(', ')}`);
}

const webSource = filesUnder(
  join(ROOT, 'apps/web/src'),
  (p) => /\.(ts|tsx|js)$/.test(p) && !/\.test\.|__tests__/.test(p)
);
const buildConfigs = [
  ...filesUnder(join(ROOT, 'docker'), (p) => /Dockerfile/.test(p)),
  ...filesUnder(join(ROOT, 'infra/docker'), (p) => /Dockerfile/.test(p)),
  ...readdirSync(ROOT)
    .filter((n) => /^cloudbuild.*\.ya?ml$/.test(n))
    .map((n) => join(ROOT, n)),
  ...filesUnder(join(ROOT, '.github/workflows'), (p) => /\.ya?ml$/.test(p)),
];

describe('no server secret in the web bundle', () => {
  it('scans real files', () => {
    expect(webSource.length).toBeGreaterThan(100);
    expect(buildConfigs.some((p) => p.endsWith('docker/Dockerfile.ui'))).toBe(true);
    expect(buildConfigs.some((p) => p.endsWith('cloudbuild-ui.yaml'))).toBe(true);
  });

  it('the web app reads no credential-shaped VITE_* value that is not public by design', () => {
    expect(credentialShapedSecrets(webSource)).toEqual([]);
  });

  it('no build passes a credential-shaped VITE_* value that is not public by design', () => {
    expect(credentialShapedSecrets(buildConfigs)).toEqual([]);
  });

  it('flags the shape it guards against', () => {
    const probe = join(ROOT, 'apps/web/src/admin/admin-api.ts');
    const names = viteNames([probe]);
    // admin-api.ts must not mention the old key at all
    expect(names.has('VITE_ADMIN_API_KEY')).toBe(false);
    expect(CREDENTIAL_SHAPED.test('VITE_ADMIN_API_KEY')).toBe(true);
    expect(CREDENTIAL_SHAPED.test('VITE_TOKEN_SERVER_URL')).toBe(false);
  });
});
