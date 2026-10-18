/**
 * The UI server mounts DISPATCH_SIGNING_SECRET only once that secret has a
 * value and the agents use it too (#1706 rollout, each step on Seth's yes).
 * 2026-10-17: #1721 mounted it while the secret had no version, and every prod
 * web deploy failed ("dispatch-signing-secret/versions/latest was not found").
 * Unset, dispatchSigningSecret() falls back to LIVEKIT_API_SECRET, which the
 * agents verify with. When the rollout reaches the server step, re-add the
 * mount and change this test in the same PR.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');
const cli = readFileSync(join(ROOT, 'apps/cli/src/commands/deploy/deploy.ts'), 'utf8');

describe('dispatch signing secret mount', () => {
  it('neither UI deploy path mounts it before the rollout', () => {
    expect(workflow).not.toMatch(/DISPATCH_SIGNING_SECRET=dispatch-signing-secret/);
    expect(cli).not.toMatch(/DISPATCH_SIGNING_SECRET=dispatch-signing-secret/);
  });
});
