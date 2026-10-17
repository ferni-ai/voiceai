/**
 * The effective settings this process runs with, as one greppable line.
 *
 * The agent logs `EFFECTIVE_SETTINGS {...}` once at boot, so two deployments can
 * be compared by the hash of their non-secret settings instead of by hand. Every
 * manifest flag is listed with its resolved value. Every other env name the code
 * reads is listed too, but its value is printed only when it matches a strict
 * shape for that name. Anything else is `<set>` or `<unset>`, so no secret value
 * can reach the line.
 *
 * @module config/effective-settings
 */
import { createHash } from 'node:crypto';
import { ENV_READ_NAMES } from './env-read-names.generated.js';
import { FLAG_MANIFEST, type FlagName } from './flag-manifest.js';

export type Env = Readonly<Record<string, string | undefined>>;

export interface EffectiveSettings {
  readonly commit: string;
  /**
   * Hash of the printed values only (flags and printable names). A value shown as `<set>` is not
   * in it, so equal hashes mean equal printed settings, not equal settings.
   */
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

/**
 * Non-secret names and the one strict shape each value must match to be printed.
 * A shape excludes `:`, `/`, `@` and spaces, so a URL with credentials or a
 * pasted key never matches. A name missing here is shown as `<set>`.
 */
const PRINTABLE: ReadonlyMap<string, RegExp> = new Map([
  ['AGENT_NAME', /^[a-z0-9][a-z0-9-]{0,62}$/],
  ['BUILD_SHA', /^[0-9a-f]{7,40}$/],
  ['GEMINI_MODEL', /^gemini-[a-z0-9.-]{1,40}$/],
  ['GOOGLE_CLOUD_PROJECT', /^[a-z][a-z0-9-]{4,29}$/],
  ['NODE_ENV', /^(development|production|staging|test)$/],
  ['PERSONA_ID', /^[a-z][a-z-]{0,39}$/],
  ['PORT', /^\d{1,5}$/],
]);

/**
 * Words a flag may show: `on`, `off` and the other words the manifest uses as
 * defaults. Any other value is a secret-shaped risk and shows as `<set>`. A new
 * mode word appears here once PR 2 classifies it.
 */
const FLAG_WORDS: ReadonlySet<string> = new Set([
  '0',
  '1',
  'false',
  'live',
  'no',
  'shadow',
  'true',
  'yes',
  ...Object.values(FLAG_MANIFEST).map((spec) => spec.default),
]);

/** A flag's resolved value: its env value lower-cased, or the manifest default when unset. */
function flagValue(name: FlagName, env: Env): string {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return FLAG_MANIFEST[name].default;
  return FLAG_WORDS.has(raw) ? raw : SET;
}

/** A non-flag env value we will print, or a marker. */
function envValue(name: string, env: Env): string {
  const raw = env[name]?.trim();
  if (!raw) return UNSET;
  const shape = PRINTABLE.get(name);
  if (!shape || SECRET_NAME.test(name)) return SET;
  return shape.test(raw) ? raw : SET;
}

/** Stable hash of a map: sorted keys, so the same settings always give the same hash. */
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

  // Hash only values that are printed. Neither marker moves the hash, so a
  // secret being set or unset never changes it.
  const printed = Object.fromEntries(
    Object.entries({ ...flags, ...envMap }).filter(([, v]) => v !== SET && v !== UNSET)
  );

  const commit = env.BUILD_SHA?.trim() ?? '';
  return {
    commit: commit ? (PRINTABLE.get('BUILD_SHA')?.test(commit) ? commit : SET) : 'unknown',
    hash: hashOf(printed),
    flags,
    env: envMap,
  };
}

const PREFIX = 'EFFECTIVE_SETTINGS ';

/** Longest line the agent logs. Log pipelines may truncate a long line, so the env names are split across parts. */
export const PART_MAX_CHARS = 12_000;

function partLine(part: number, body: Record<string, unknown>): string {
  return `${PREFIX}${JSON.stringify({ part, ...body })}`;
}

/**
 * The lines the agent logs at boot, each `EFFECTIVE_SETTINGS {...}`. Part 1 holds the
 * parts count, the commit, the hash and every flag. The env names follow in parts
 * of at most PART_MAX_CHARS. The snapshot script joins the parts by `part` and `parts`.
 */
export function effectiveSettingsLines(env: Env = process.env): string[] {
  const settings = effectiveSettings(env);
  const groups: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  for (const [name, value] of Object.entries(settings.env)) {
    const grown = { ...current, [name]: value };
    if (Object.keys(current).length && JSON.stringify(grown).length > PART_MAX_CHARS - 200) {
      groups.push(current);
      current = { [name]: value };
    } else {
      current = grown;
    }
  }
  if (Object.keys(current).length) groups.push(current);

  const parts = 1 + groups.length;
  const lines = [
    partLine(1, { parts, commit: settings.commit, hash: settings.hash, flags: settings.flags }),
  ];
  groups.forEach((group, i) => lines.push(partLine(i + 2, { parts, env: group })));
  return lines;
}
