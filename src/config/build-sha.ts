/**
 * The commit this process was built from, for the EFFECTIVE_SETTINGS boot line and
 * the Sentry release.
 *
 * `lk agent deploy` builds the image on LiveKit Cloud and passes no build args, so
 * BUILD_SHA can't come from `--build-arg`. Instead the deploy-agent chain writes
 * `git rev-parse HEAD` to `.build-sha`, docker/Dockerfile.agent copies it into the
 * image's working directory, and the agent reads it here at boot. An env BUILD_SHA
 * (Cloud Run, a local .env) wins. With neither, BUILD_SHA stays unset and the boot
 * line says `unknown`.
 *
 * @module config/build-sha
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Written by the deploy-agent chain at the repo root; copied to the image's WORKDIR. */
export const BUILD_SHA_FILE = '.build-sha';

const COMMIT = /^[0-9a-f]{7,40}$/;

/**
 * Sets `env.BUILD_SHA` from the build-sha file when it is unset, and returns the
 * commit in effect. A missing, unreadable or non-hash file leaves it unset.
 */
export function loadBuildSha(
  env: Record<string, string | undefined> = process.env,
  file: string = resolve(process.cwd(), BUILD_SHA_FILE)
): string | undefined {
  const fromEnv = env.BUILD_SHA?.trim();
  if (fromEnv) return fromEnv;

  let sha: string;
  try {
    sha = readFileSync(file, 'utf8').trim();
  } catch {
    return undefined; // no file: a local or non-lk image; the boot line says unknown
  }
  if (!COMMIT.test(sha)) return undefined;
  env.BUILD_SHA = sha;
  return sha;
}
