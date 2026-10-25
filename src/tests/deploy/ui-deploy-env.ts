/**
 * The production web server's env and secrets, read the way the deploy builds
 * them: deploy/ui-server/env.yaml plus the per-deploy keys the workflow step
 * appends with printf (--env-vars-file), and deploy/ui-server/secrets.txt
 * joined with commas (--set-secrets). Every reader first checks that
 * the john-bogle-ui deploy command still reads both files, so a test can't
 * pass against a file the deploy no longer uses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

export const ENV_FILE = 'deploy/ui-server/env.yaml';
export const SECRETS_FILE = 'deploy/ui-server/secrets.txt';

/** A file's lines that aren't blank or `#` comments. */
export function entryLines(path: string): string[] {
  return read(path)
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'));
}

/** The UI deploy step, from the env file copy to the end of the gcloud command. */
export function uiDeployStep(): string {
  const workflow = read('.github/workflows/deploy-production.yml');
  const deploy = workflow.search(/run deploy john-bogle-ui\b/);
  const start = workflow.lastIndexOf('ENV_FILE=$(mktemp', deploy);
  if (deploy < 0 || start < 0) throw new Error('john-bogle-ui deploy step not found');
  const lines = workflow.slice(start).split('\n');
  const cmd = lines.findIndex((l) => /run deploy john-bogle-ui\b/.test(l));
  const end = lines.findIndex((l, i) => i >= cmd && !l.trimEnd().endsWith('\\'));
  return lines.slice(0, end + 1).join('\n');
}

function assertWired(step: string): void {
  const wiring = [
    `cp ${ENV_FILE} "$ENV_FILE"`,
    `SECRETS=$(grep -v -e '^#' -e '^$' ${SECRETS_FILE} | paste -sd, -)`,
    '--env-vars-file "$ENV_FILE"',
    '--set-secrets "$SECRETS"',
  ];
  for (const w of wiring) {
    if (!step.includes(w)) throw new Error(`john-bogle-ui deploy no longer has: ${w}`);
  }
  if (step.includes('--set-env-vars')) throw new Error('john-bogle-ui deploy sets env inline');
}

const YAML_LINE = /^([A-Z][A-Z0-9_]*): "([^"\\]*)"$/;
const PRINTF_LINE = /printf '([A-Z][A-Z0-9_]*): "%s"\\n' "([^"]*)"/g;

/** The server's env as `KEY=value`, file keys then appended keys. Throws on a malformed line or a repeated key. */
export function uiServerEnv(): string[] {
  const step = uiDeployStep();
  assertWired(step);
  const pairs: Array<[string, string]> = entryLines(ENV_FILE).map((l) => {
    const m = YAML_LINE.exec(l);
    if (!m) throw new Error(`${ENV_FILE}: not KEY: "value": ${l}`);
    return [m[1], m[2]];
  });
  for (const m of step.matchAll(PRINTF_LINE)) pairs.push([m[1], m[2]]);
  const keys = pairs.map(([k]) => k);
  const repeated = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (repeated.length) throw new Error(`repeated env keys: ${repeated.join(', ')}`);
  return pairs.map(([k, v]) => `${k}=${v}`);
}

/** The server's Secret Manager mounts, `ENV=secret:latest`. */
export function uiServerSecrets(): string[] {
  assertWired(uiDeployStep());
  return entryLines(SECRETS_FILE);
}
