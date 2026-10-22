/**
 * The Apple web sign-in build flag (apps/web/src/config/apple-web-signin-flag.ts)
 * reaches both web builds, so turning on the repo variable once Apple's web
 * OAuth config exists shows the button on app.ferni.ai and on the Cloud Run UI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('VITE_APPLE_WEB_SIGNIN', () => {
  it('reaches the Firebase hosting build', () => {
    expect(read('.github/workflows/deploy-firebase.yml')).toMatch(
      /VITE_APPLE_WEB_SIGNIN: \$\{\{ vars\.VITE_APPLE_WEB_SIGNIN \}\}/
    );
  });

  it('reaches the Docker UI build', () => {
    expect(read('.github/workflows/deploy-production.yml')).toMatch(
      /--build-arg VITE_APPLE_WEB_SIGNIN="\$\{\{ vars\.VITE_APPLE_WEB_SIGNIN \}\}"/
    );
    expect(read('docker/Dockerfile.ui')).toMatch(
      /ARG VITE_APPLE_WEB_SIGNIN=""\nENV VITE_APPLE_WEB_SIGNIN=\$VITE_APPLE_WEB_SIGNIN/
    );
  });
});
