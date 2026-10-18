/**
 * The Error Rate Monitor must watch the voice agent where it actually runs.
 * Until 2026-10-18 it queried the GCE VM voiceai-agent-gce, which is
 * TERMINATED, so voice-agent errors on LiveKit Cloud raised no alert.
 *
 * The agent's logs land in Cloud Logging as logs/cloud-agents. Almost every
 * line has severity ERROR (the agent writes to stderr), so the monitor must
 * count pino level >= 50, never severity>=ERROR.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/error-alerting.yml'), 'utf8');

function step(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, `step "${name}" exists`).toBeGreaterThan(-1);
  const next = workflow.indexOf('\n      - name: ', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

describe('voice-agent error alerting', () => {
  it('no longer queries the retired GCE VM', () => {
    const code = workflow
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/gce_instance|voiceai-agent-gce/);
  });

  it('reads the LiveKit Cloud agent logs for prod and dev', () => {
    const voice = step('Check Voice Agent errors');
    expect(voice).toContain('logs/cloud-agents');
    expect(voice).toContain('labels.agent_id');
    expect(workflow).toMatch(/PROD_AGENT_ID: CA_GeFvEpsNXLSF/);
    expect(workflow).toMatch(/DEV_AGENT_ID: CA_siTDMHEba4Fg/);
  });

  it('counts pino level >= 50, not Cloud Logging severity', () => {
    const voice = step('Check Voice Agent errors');
    expect(voice).not.toMatch(/severity/);
    expect(voice).toContain('textPayload:"\\"level\\":50"');
    expect(voice).toContain('textPayload:"\\"level\\":60"');
    expect(voice).toMatch(/\.level \/\/ 0\) >= 50/);
  });

  it('fails loudly when the log query fails instead of reporting zero', () => {
    const voice = step('Check Voice Agent errors');
    expect(voice).toContain('set -euo pipefail');
    expect(voice).not.toMatch(/\|\|\s*echo "0"/);
  });

  it('runs on a schedule', () => {
    expect(workflow).toMatch(/^\s{2}schedule:\s*\n\s+- cron: '\*\/15 \* \* \* \*'/m);
  });
});
