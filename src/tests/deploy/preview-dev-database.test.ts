/**
 * A Cloud Run deploy that talks to the dev LiveKit project or the dev agent must
 * use the ferni-dev Firestore database, as the dev agent does. Preview deploys
 * (staging.yml) once left FIRESTORE_DATABASE unset, so a preview's web/API read
 * and wrote the prod '(default)' database while its calls went to ferni-dev.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '..', '..', '..', '.github', 'workflows');

/** Each `gcloud run deploy` command in the workflows, continuation lines joined. */
function runDeploys(): Array<{ file: string; cmd: string }> {
  return readdirSync(DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((file) => {
      const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
      return lines.flatMap((l, i) => {
        if (!/gcloud run deploy\b/.test(l) || l.trim().startsWith('#')) return [];
        const end = lines.findIndex((x, j) => j >= i && !x.trimEnd().endsWith('\\'));
        return [{ file, cmd: lines.slice(i, end + 1).join('\n') }];
      });
    });
}

const isDev = (cmd: string): boolean => /wss:\/\/dev-|AGENT_NAME=voice-agent-dev\b/.test(cmd);

describe('dev-targeted Cloud Run deploys use the ferni-dev database', () => {
  it('finds the preview deploy, so the check is not vacuous', () => {
    expect(runDeploys().filter((d) => d.file === 'staging.yml' && isDev(d.cmd))).toHaveLength(1);
  });

  it.each(runDeploys().filter((d) => isDev(d.cmd)))(
    '$file sets FIRESTORE_DATABASE=ferni-dev',
    ({ cmd }) => {
      expect(cmd).toMatch(/[",]FIRESTORE_DATABASE=ferni-dev[",]/);
    }
  );

  it('no prod-targeted deploy names ferni-dev', () => {
    for (const d of runDeploys().filter((x) => !isDev(x.cmd)))
      expect(d.cmd).not.toContain('ferni-dev');
  });
});
