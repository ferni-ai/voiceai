#!/usr/bin/env node
/**
 * Resolve the env + secret flags for a Cloud Run service from its catalog
 * (infra/secrets/<service>.json) and what actually exists in Secret Manager.
 *
 *   node scripts/deploy/resolve-secrets.mjs ui-service            # prints JSON {envVars, secrets, missing}
 *   node scripts/deploy/resolve-secrets.mjs ui-service --check    # human report, exit 1 if a required secret is missing
 *   node scripts/deploy/resolve-secrets.mjs ui-service --flags    # prints: --set-env-vars "..." --set-secrets "..."
 *   node scripts/deploy/resolve-secrets.mjs ui-service --env      # raw value for --set-env-vars (^@^-delimited)
 *   node scripts/deploy/resolve-secrets.mjs ui-service --secrets  # raw value for --set-secrets
 *
 * Why: `gcloud run deploy --set-secrets` REPLACES every secret on the service,
 * so a hand-maintained list silently dropped Stripe, Spotify, push, wearables...
 * and naming a secret that doesn't exist fails the deploy. This mounts exactly
 * the catalog secrets that exist and reports the rest.
 *
 * Env: GCP_PROJECT (default johnb-2025); SECRETS_AVAILABLE (comma list) skips
 * the gcloud call (used by tests).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const toSecretName = (envName) => envName.toLowerCase().replace(/_/g, '-');

export function loadCatalog(service) {
  return JSON.parse(readFileSync(join(ROOT, 'infra/secrets', `${service}.json`), 'utf8'));
}

export function listAvailableSecrets(project) {
  if (process.env.SECRETS_AVAILABLE !== undefined) {
    return new Set(process.env.SECRETS_AVAILABLE.split(',').map((s) => s.trim()).filter(Boolean));
  }
  const out = execFileSync('gcloud', ['secrets', 'list', `--project=${project}`, '--format=value(name)'], {
    encoding: 'utf8',
  });
  return new Set(out.split('\n').map((line) => line.trim().split('/').pop()).filter(Boolean));
}

export function resolve(catalog, available) {
  const secretFor = (env) => catalog.secrets?.[env] ?? toSecretName(env);
  const optional = Object.values(catalog.optional ?? {}).flat();
  const mounted = [];
  const missing = { required: [], optional: [] };

  for (const env of catalog.required) {
    (available.has(secretFor(env)) ? mounted : missing.required).push(env);
  }
  for (const env of optional) {
    (available.has(secretFor(env)) ? mounted : missing.optional).push(env);
  }

  return {
    envVars: catalog.env ?? {},
    secrets: Object.fromEntries(mounted.map((env) => [env, `${secretFor(env)}:latest`])),
    missing: {
      required: missing.required.map((env) => ({ env, secret: secretFor(env) })),
      optional: missing.optional.map((env) => ({ env, secret: secretFor(env) })),
    },
  };
}

/** '^@^' switches gcloud's list delimiter so values may contain commas. */
export const toEnvValue = (result, extra = {}) =>
  '^@^' + Object.entries({ ...result.envVars, ...extra }).map(([k, v]) => `${k}=${v}`).join('@');

export const toSecretsValue = (result) =>
  Object.entries(result.secrets).map(([k, v]) => `${k}=${v}`).join(',');

export function toFlags(result) {
  return `--set-env-vars "${toEnvValue(result)}" --set-secrets "${toSecretsValue(result)}"`;
}

function main() {
  const [service = 'ui-service', mode = '--json'] = process.argv.slice(2);
  const catalog = loadCatalog(service);
  const result = resolve(catalog, listAvailableSecrets(process.env.GCP_PROJECT || 'johnb-2025'));

  if (mode === '--flags') {
    process.stdout.write(toFlags(result));
  } else if (mode === '--env') {
    process.stdout.write(toEnvValue(result, process.env.BUILD_SHA ? { BUILD_SHA: process.env.BUILD_SHA } : {}));
  } else if (mode === '--secrets') {
    process.stdout.write(toSecretsValue(result));
  } else if (mode === '--check') {
    console.log(`Mounted ${Object.keys(result.secrets).length} secrets for ${service}.`);
    for (const { env, secret } of result.missing.required) console.log(`  MISSING (required) ${env} <- ${secret}`);
    for (const { env, secret } of result.missing.optional) console.log(`  missing (optional) ${env} <- ${secret}`);
    if (result.missing.optional.length) {
      console.log('\nCreate one with: printf %s "$VALUE" | gcloud secrets create <secret> --data-file=-');
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (result.missing.required.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
