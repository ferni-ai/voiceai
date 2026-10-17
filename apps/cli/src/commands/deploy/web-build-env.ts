/**
 * The VITE_* GitHub repo variables that CI builds apps/web with
 * (deploy-firebase.yml, "Build frontend"). Vite bakes them in at build time,
 * so a local `ferni deploy frontend` built without them ships the caption
 * and Venmo flags as off until the next CI deploy.
 */

import { execSync } from 'child_process';

/** The VITE_* entries from `gh variable list --json name,value` output. */
export function parseViteVars(json: string): Record<string, string> {
  const rows = JSON.parse(json) as Array<{ name?: unknown; value?: unknown }>;
  const vars: Record<string, string> = {};
  for (const { name, value } of rows) {
    if (typeof name === 'string' && name.startsWith('VITE_') && typeof value === 'string') {
      vars[name] = value;
    }
  }
  return vars;
}

/** The repo CI builds from; named so a shell in another repo can't change it. */
export const REPO = 'ferni-ai/voiceai';

/**
 * Read the repo's VITE_* variables with the gh CLI. Throws when gh can't read
 * them or finds none: building without them would quietly turn those flags
 * off in prod. Repo values win over a local VITE_* env, so a manual deploy
 * matches CI.
 */
export function repoViteVars(
  run: (cmd: string) => string = (cmd) =>
    execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
): Record<string, string> {
  let vars: Record<string, string>;
  try {
    vars = parseViteVars(run(`gh variable list --repo ${REPO} --json name,value`));
  } catch (error) {
    throw new Error(
      'Could not read the repo VITE_* variables with `gh variable list` (run `gh auth login`). ' +
        'The frontend build needs them, or the caption and Venmo flags ship as off. ' +
        `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (Object.keys(vars).length === 0) {
    throw new Error(
      `No VITE_* variables found in ${REPO}; refusing to build the frontend with every flag off.`
    );
  }
  return vars;
}

/** Build apps/web the way CI does: with the repo VITE_* variables in its env. */
export function buildFrontend(
  frontendDir: string,
  vars: Record<string, string> = repoViteVars()
): void {
  execSync('npm run build', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, ...vars },
  });
}
