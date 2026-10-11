/**
 * One way to read an on/off env flag.
 *
 * The code base grew two vocabularies for "on" (`=== 'true'` in older code,
 * `=== 'on'` in newer code) plus half a dozen private parse helpers, so a value
 * written in the wrong vocabulary switched a flag off without a word. flagOn
 * accepts both, ignores case and surrounding space, and falls back to the
 * flag's default from the manifest when the value is unset or unrecognised.
 *
 * The name must be in FLAG_MANIFEST (flag-manifest.ts), so the compiler refuses
 * a flag nobody has registered, and the manifest test refuses an env flag read
 * any other way that the manifest doesn't list.
 *
 * @module config/env-flag
 */
import { FLAG_MANIFEST, type FlagName } from './flag-manifest.js';

export type Env = Readonly<Record<string, string | undefined>>;

const ON = new Set(['on', 'true', '1', 'live']);
const OFF = new Set(['off', 'false', '0']);

function parse(value: string | undefined): boolean | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (ON.has(v)) return true;
  if (OFF.has(v)) return false;
  return undefined;
}

/**
 * True when the flag is on: `on`, `true`, `1` or `live`, any case. `off`,
 * `false` and `0` turn it off. Unset, empty or anything else gives the
 * manifest default, so a default-on kill switch stays on until it is
 * explicitly turned off.
 */
export function flagOn(name: FlagName, env: Env = process.env): boolean {
  return parse(env[name]) ?? parse(FLAG_MANIFEST[name].default) ?? false;
}
