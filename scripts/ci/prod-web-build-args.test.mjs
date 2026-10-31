/**
 * Both prod web builds can carry every build-time switch the app reads for Ferni's
 * avatar and home screen. Until 2026-10-31 the 13 motion switches
 * (apps/web/src/config/motion-flags.ts) and calm idle were accepted by
 * docker/Dockerfile.ui but passed by neither deploy, so no repo variable could turn
 * them on for app.ferni.ai or the Cloud Run UI.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEB_BUILD, WEB_BUILD_STEP, stepEnv } from './prod-web-flags.mjs';

const read = (p) => readFileSync(p, 'utf8');

/** The VITE_* names the motion switches and calm idle read at build time. */
function avatarBuildNames() {
  const motion = [
    ...read('apps/web/src/config/motion-flags.ts').matchAll(
      /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g
    ),
  ];
  const calm = [
    ...read('apps/web/src/config/calm-idle.ts').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g),
  ];
  return [...new Set([...motion, ...calm].map((m) => m[1]))];
}

describe('prod web build args', () => {
  const names = avatarBuildNames();

  it('finds the switches it checks', () => {
    expect(names).toContain('VITE_SPRING_BODY');
    expect(names).toContain('VITE_CALM_IDLE');
    expect(names.length).toBe(14);
  });

  it('app.ferni.ai (deploy-firebase.yml) builds with each switch from its repo variable', () => {
    const env = stepEnv(read(WEB_BUILD), WEB_BUILD_STEP);
    for (const name of names) expect(env[name], name).toBe(`\${{ vars.${name} }}`);
  });

  it('the Cloud Run UI image accepts each switch and the deploy passes it', () => {
    const dockerfile = read('docker/Dockerfile.ui');
    const deploy = read('.github/workflows/deploy-production.yml');
    for (const name of names) {
      expect(dockerfile, name).toMatch(new RegExp(`^ARG ${name}=""$`, 'm'));
      expect(dockerfile, name).toMatch(new RegExp(`\\b${name}=\\$${name}\\b`));
      expect(deploy, name).toContain(`--build-arg ${name}="\${{ vars.${name} }}"`);
    }
  });
});
