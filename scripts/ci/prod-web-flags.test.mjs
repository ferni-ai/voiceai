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

  it('a variable set to "false" wins over the default', () => {
    expect(resolve('X', "${{ vars.X || 'true' }}", { X: 'false' })).toBe('false');
  });

  it("fails on a value it can't resolve, rather than building with it off", () => {
    expect(() => resolve('X', '${{ secrets.X }}', {})).toThrow(/not \$\{\{ vars\.X \}\}/);
    expect(() => stepEnv(workflow, 'No such step')).toThrow(/no "No such step" step/);
  });

  it("takes the API server's on/off flags from its prod env file", () => {
    const flags = serverFlags(readFileSync(SERVER_ENV, 'utf8'));
    expect(flags.MEMORY_VIEW).toBe('on');
    expect(Object.values(flags).every((v) => v === 'on' || v === 'off')).toBe(true);
    expect(flags).not.toHaveProperty('ALLOWED_ORIGINS');
  });
});
