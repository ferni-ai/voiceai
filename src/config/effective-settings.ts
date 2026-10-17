/**
 * The effective settings this process runs with, as one greppable line.
 *
 * The agent logs `EFFECTIVE_SETTINGS {...}` once at boot, so two deployments can
 * be compared by the hash of their non-secret settings instead of by hand. Every
 * manifest flag is listed with its resolved value. Every other env name the code
 * reads is listed too, but only its presence is shown unless the name is on the
 * printable list. Secrets are never printed: a name that does not clearly carry
 * a non-secret value is shown as `<set>` or `<unset>`.
 *
 * @module config/effective-settings
 */
import { createHash } from 'node:crypto';
import { ENV_READ_NAMES } from './env-read-names.generated.js';
import { FLAG_MANIFEST, type FlagName } from './flag-manifest.js';

export type Env = Readonly<Record<string, string | undefined>>;

export interface EffectiveSettings {
  readonly commit: string;
  /** Hash of the non-secret map (flags and printable names). Equal hashes mean equal non-secret settings. */
  readonly hash: string;
  readonly flags: Readonly<Record<string, string>>;
  readonly env: Readonly<Record<string, string>>;
}

/** Shown in place of a value we will not print. */
export const SET = '<set>';
const UNSET = '<unset>';

/**
 * Name shapes that carry secrets. Deny by default: substring match, so
 * `MY_API_KEY`, `db_password` and `WEBHOOK_SECRET` all match. Over-matching only
 * hides a value; under-matching leaks one.
 */
const SECRET_NAME =
  /KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL|PRIVATE|DSN|AUTH|CERT|SIGNING|WEBHOOK|URL/i;

/** A URL whose authority holds a user or password, such as `https://user:pw@host`. */
const URL_WITH_CREDENTIALS = /:\/\/[^/\s]*@/;

/**
 * Non-secret names whose values may be printed. Keep this list short and never
 * add a name that matches SECRET_NAME (a test checks that). Anything missing here
 * is shown as `<set>`, so PR 2's settings classification decides what joins it.
 */
const PRINTABLE = new Set([
  'AGENT_NAME',
  'BUILD_SHA',
  'GEMINI_MODEL',
  'GOOGLE_CLOUD_PROJECT',
  'NODE_ENV',
  'PERSONA_ID',
  'PORT',
]);

/** Values a flag may show: a lower-case word such as `on`, `off`, `live` or `learned`. */
const FLAG_WORD = /^[a-z]{1,24}$/;

/** A flag's resolved value: its env value lower-cased, or the manifest default when unset. */
function flagValue(name: FlagName, env: Env): string {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return FLAG_MANIFEST[name].default;
  return FLAG_WORD.test(raw) ? raw : SET;
}

/** A non-flag env value we will print, or a marker. */
function envValue(name: string, env: Env): string {
  const raw = env[name]?.trim();
  if (!raw) return UNSET;
  if (SECRET_NAME.test(name) || !PRINTABLE.has(name)) return SET;
  if (URL_WITH_CREDENTIALS.test(raw)) return SET;
  return raw;
}

/** Stable hash of the non-secret map: sorted keys, so the same settings always give the same hash. */
function hashOf(map: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(map)
    .sort()
    .map((k) => [k, map[k]]);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

export function effectiveSettings(env: Env = process.env): EffectiveSettings {
  const flags: Record<string, string> = {};
  for (const name of Object.keys(FLAG_MANIFEST) as FlagName[]) {
    flags[name] = flagValue(name, env);
  }

  const envMap: Record<string, string> = {};
  for (const name of new Set(ENV_READ_NAMES)) {
    if (name in FLAG_MANIFEST) continue;
    envMap[name] = envValue(name, env);
  }

  // Hash only what is printed: a secret's presence or value never moves the hash.
  const printed = Object.fromEntries(
    Object.entries({ ...flags, ...envMap }).filter(([, v]) => v !== SET)
  );

  return {
    commit: env.BUILD_SHA?.trim() || 'unknown',
    hash: hashOf(printed),
    flags,
    env: envMap,
  };
}

/** The one line the agent logs at boot. */
export function formatEffectiveSettings(env: Env = process.env): string {
  return `EFFECTIVE_SETTINGS ${JSON.stringify(effectiveSettings(env))}`;
}
