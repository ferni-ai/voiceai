/**
 * The dev web server answers crisis texts with 988 (SMS_CRISIS_SCREEN=on), as
 * prod does (ui-server-env-snapshot.test.ts pins prod). Dev's env is set inline
 * in its deploy workflow, so a revert to shadow or off there, or a second copy
 * of the key that wins, turns this red. Shadow reads a crisis text and sends
 * nothing back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = join(__dirname, '..', '..', '..', '.github', 'workflows', 'deploy-ui-dev.yml');

/** Every KEY=value the dev UI deploy sets with --set-env-vars. */
function devUiEnv(): string[] {
  const sets = [...readFileSync(WORKFLOW, 'utf8').matchAll(/--set-env-vars "([^"]*)"/g)];
  if (sets.length !== 1) throw new Error(`expected one --set-env-vars, found ${sets.length}`);
  return sets[0][1].split(',');
}

describe('dev UI deploy env', () => {
  it('deploys the dev web server', () => {
    expect(devUiEnv()).toContain('DEPLOY_ENV=dev');
  });

  it('SMS_CRISIS_SCREEN is on, set exactly once', () => {
    expect(devUiEnv().filter((kv) => kv.startsWith('SMS_CRISIS_SCREEN='))).toEqual([
      'SMS_CRISIS_SCREEN=on',
    ]);
  });
});
