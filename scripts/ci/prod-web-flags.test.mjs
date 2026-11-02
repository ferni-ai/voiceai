/**
 * prod-web-flags.mjs: the menu gate's web build gets prod's VITE_* flags from the one
 * place prod reads them (deploy-firebase.yml + the repo variables), with the Venmo
 * account replaced, and fails loudly on a shape it can't resolve.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDERS,
  SERVER_ENV,
  WEB_BUILD,
  diffTable,
  resolve,
  serverFlags,
  stepEnv,
  varsFromEnv,
  webFlags,
} from './prod-web-flags.mjs';

const workflow = readFileSync(WEB_BUILD, 'utf8');

describe('prod web flags', () => {
  it('reads every VITE_* flag of the app.ferni.ai build, and nothing else', () => {
    const env = stepEnv(workflow, 'Build frontend');
    expect(env.VITE_MEMORY_VIEW).toBe('${{ vars.VITE_MEMORY_VIEW }}');
    expect(env.VITE_VENMO_CHIP_IN).toBe('${{ vars.VITE_VENMO_CHIP_IN }}');
    expect(Object.keys(env).every((k) => k.startsWith('VITE_'))).toBe(true);
  });

  it('resolves each flag from the repo variables, with the workflow default when unset', () => {
    const flags = webFlags(workflow, {
      VITE_MEMORY_VIEW: 'true',
      VITE_VENMO_CHIP_IN: 'true',
      VITE_VENMO_HANDLE: 'real-person-handle',
    });
    expect(flags.VITE_MEMORY_VIEW).toBe('true');
    expect(flags.VITE_VENMO_CHIP_IN).toBe('true');
    expect(flags.VITE_TRY_FIRST).toBe('true'); // `vars.VITE_TRY_FIRST || 'true'`
    expect(flags.VITE_CALL_WRAP_UP).toBe('');
    // The real account never reaches the walk; an unset one stays unset (chip-in stays off)
    expect(flags.VITE_VENMO_HANDLE).toBe(PLACEHOLDERS.VITE_VENMO_HANDLE);
    expect(webFlags(workflow, {}).VITE_VENMO_HANDLE).toBe('');
    expect(diffTable(flags)).not.toContain('real-person-handle');
  });

  it('the walk workflows pass exactly the variables the build reads, and never the handle', () => {
    for (const file of ['.github/workflows/menu-e2e.yml', '.github/workflows/signed-in-e2e.yml']) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/toJSON\(vars\)\s*\}\}/);
      expect(text, file).not.toMatch(/vars\.VITE_VENMO_HANDLE\s*\}\}/);
      const env = Object.fromEntries(
        [...text.matchAll(/^\s+(PROD_VAR_[A-Z0-9_]+):/gm)].map((m) => [m[1], 'x'])
      );
      env.PROD_VAR_VITE_VENMO_HANDLE_SET = 'true';
      expect(() => varsFromEnv(workflow, env), file).not.toThrow();
    }
  });

  it('reads only the PROD_VAR_* it is given: a missing or extra one fails', () => {
    const env = {
      PROD_VAR_VITE_MEMORY_VIEW: 'true',
      PROD_VAR_VITE_VENMO_CHIP_IN: 'true',
      PROD_VAR_VITE_VENMO_HANDLE_SET: 'true',
    };
    expect(() => varsFromEnv(workflow, env)).toThrow(/missing: .*PROD_VAR_VITE_CAPTIONS_V2/);
    const all = Object.fromEntries(
      Object.values(stepEnv(workflow, 'Build frontend')).map((raw) => [
        `PROD_VAR_${/vars\.([A-Z0-9_]+)/.exec(raw)[1]}`,
        '',
      ])
    );
    delete all.PROD_VAR_VITE_VENMO_HANDLE;
    const full = { ...all, ...env, PATH: '/usr/bin' };
    expect(varsFromEnv(workflow, full)).toMatchObject({
      VITE_MEMORY_VIEW: 'true',
      VITE_VENMO_HANDLE: PLACEHOLDERS.VITE_VENMO_HANDLE,
    });
    expect(
      varsFromEnv(workflow, { ...full, PROD_VAR_VITE_VENMO_HANDLE_SET: 'false' })
    ).not.toHaveProperty('VITE_VENMO_HANDLE');
    expect(() => varsFromEnv(workflow, { ...full, PROD_VAR_VITE_VENMO_HANDLE: 'real' })).toThrow(
      /not read by the build: PROD_VAR_VITE_VENMO_HANDLE/
    );
  });

  it('a variable set to "false" wins over the default', () => {
    expect(resolve('X', "${{ vars.X || 'true' }}", { X: 'false' })).toBe('false');
  });

  it("fails on a value it can't resolve, rather than building with it off", () => {
    expect(() => resolve('X', '${{ secrets.X }}', {})).toThrow(/not \$\{\{ vars\.X \}\}/);
    expect(() => stepEnv(workflow, 'No such step')).toThrow(/no "No such step" step/);
  });

  it('passes every avatar motion switch to each web build, from its repo variable, off when unset', () => {
    // The switches motion-flags.ts reads; a new one must reach deploy and the walks too.
    const source = readFileSync('apps/web/src/config/motion-flags.ts', 'utf8');
    const motion = [
      ...new Set([...source.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)].map((m) => m[1])),
    ];
    expect(motion.length).toBeGreaterThanOrEqual(13);

    const build = stepEnv(workflow, 'Build frontend');
    const image = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
    const dockerfile = readFileSync('docker/Dockerfile.ui', 'utf8');
    const walks = ['.github/workflows/menu-e2e.yml', '.github/workflows/signed-in-e2e.yml'].map(
      (file) => [file, readFileSync(file, 'utf8')]
    );
    for (const name of motion) {
      expect(build[name], `${WEB_BUILD} Build frontend: ${name}`).toBe(`\${{ vars.${name} }}`);
      expect(resolve(name, build[name], {}), `${name} default`).toBe('');
      expect(image, `deploy-production.yml build-arg ${name}`).toContain(
        `--build-arg ${name}="\${{ vars.${name} }}"`
      );
      expect(dockerfile, `Dockerfile.ui ARG ${name}`).toMatch(new RegExp(`^ARG ${name}=""$`, 'm'));
      expect(dockerfile, `Dockerfile.ui ENV ${name}`).toContain(`${name}=$${name}`);
      for (const [file, text] of walks) {
        expect(text, `${file}: PROD_VAR_${name}`).toContain(
          `PROD_VAR_${name}: \${{ vars.${name} }}`
        );
      }
    }
  });

  it("takes the API server's on/off flags from its prod env file", () => {
    const flags = serverFlags(readFileSync(SERVER_ENV, 'utf8'));
    expect(flags.MEMORY_VIEW).toBe('on');
    expect(Object.values(flags).every((v) => v === 'on' || v === 'off')).toBe(true);
    expect(flags).not.toHaveProperty('ALLOWED_ORIGINS');
  });
});
