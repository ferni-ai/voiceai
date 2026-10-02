/**
 * Mappings from older preference shapes into the profile vocabulary:
 * - the old setPreference tool's single `preferences/settings` doc
 * - the account profile's `preferences` (verbosity, topicsToAvoid) from
 *   PUT /api/account/profile and the twin/profile UIs
 *
 * @module services/user-preferences/legacy
 */

import type { PreferenceInput } from './types.js';

type Verbosity = 'concise' | 'balanced' | 'storytelling';

const VERBOSITY_TO_LENGTH: Record<Verbosity, string> = {
  concise: 'short',
  balanced: 'medium',
  storytelling: 'long',
};
const LENGTH_TO_VERBOSITY: Record<string, Verbosity> = {
  short: 'concise',
  medium: 'balanced',
  long: 'storytelling',
};

export function verbosityToResponseLength(verbosity: string): string | null {
  return VERBOSITY_TO_LENGTH[verbosity as Verbosity] ?? null;
}

export function responseLengthToVerbosity(length: string): Verbosity | null {
  return LENGTH_TO_VERBOSITY[length] ?? null;
}

function deliberate(
  domain: PreferenceInput['domain'],
  key: string,
  value: string
): PreferenceInput {
  return { domain, key, value, source: 'explicit', confidence: 1, userEdited: true };
}

/** Inputs for the old `bogle_users/{uid}/preferences/settings` document. */
export function legacySettingsToInputs(legacy: Record<string, unknown>): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  const str = (k: string): string | null =>
    typeof legacy[k] === 'string' && legacy[k] ? (legacy[k] as string) : null;
  const add = (domain: PreferenceInput['domain'], key: string, value: string | null): void => {
    if (value) out.push(deliberate(domain, key, value));
  };
  add('practical', 'temperatureUnit', str('temperatureUnit'));
  add('practical', 'distanceUnit', str('distanceUnit'));
  add('practical', 'timeFormat', str('timeFormat'));
  add('practical', 'timezone', str('timezone'));
  add('practical', 'voiceSpeed', str('voiceSpeed'));
  add('conversation', 'preferredName', str('nickname'));
  add('conversation', 'language', str('language'));
  const custom = legacy.customPreferences;
  if (custom && typeof custom === 'object') {
    for (const [k, v] of Object.entries(custom as Record<string, unknown>)) {
      if (typeof v === 'string' && v) out.push(deliberate('practical', `custom:${k}`, v));
    }
  }
  return out;
}

/** Inputs for the account profile preference fields (deliberate user settings). */
export function accountPreferencesToInputs(prefs: {
  verbosity?: string;
  topicsToAvoid?: readonly string[];
}): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  if (prefs.verbosity) {
    const length = verbosityToResponseLength(prefs.verbosity);
    if (length) out.push(deliberate('conversation', 'responseLength', length));
  }
  for (const topic of prefs.topicsToAvoid ?? []) {
    if (typeof topic === 'string' && topic.trim()) {
      out.push(deliberate('boundaries', `avoidTopic:${topic}`, topic.trim()));
    }
  }
  return out;
}
