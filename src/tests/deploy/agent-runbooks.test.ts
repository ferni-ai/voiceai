/**
 * The incident-response and rollback runbooks used to tell responders to ssh
 * into the GCE VM voiceai-agent-gce or run `ferni deploy|rollback gce`. That VM
 * no longer runs; the voice agent is on LiveKit Cloud. The runbooks must give
 * the real `lk` commands with an absolute --config path and the rooms=0 rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (f: string) => readFileSync(join(ROOT, '.github/workflows', f), 'utf8');
const code = (yml: string) =>
  yml
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe.each(['incident-response.yml', 'rollback.yml'])('%s voice-agent runbook', (file) => {
  const yml = read(file);

  it('no longer points at the GCE VM or the ferni gce commands', () => {
    expect(code(yml)).not.toMatch(
      /voiceai-agent-gce|compute ssh|ferni (deploy|rollback) gce|34\.134\.186\.63/
    );
  });

  it('gives lk commands for ferni-prod with an absolute config path', () => {
    expect(yml).toContain('P=ferni-prod');
    expect(yml).toContain('C="$(git rev-parse --show-toplevel)/livekit.prod-cloud.toml"');
    expect(yml).toMatch(/lk agent rollback --project \\?\$P --config \\?"\\?\$C\\?"/);
    expect(yml).toContain('.claude/skills/deploy-agent/SKILL.md');
  });

  it('checks rooms=0 before any restart or rollback, failing closed', () => {
    expect(yml).toContain('lk room list --project $P');
    expect(yml).toContain('Using project \\[$P\\]');
    expect(yml).toContain('grep -c "│ RM_")" = 0');
  });
});
