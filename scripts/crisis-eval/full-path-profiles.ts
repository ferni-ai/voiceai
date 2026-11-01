/**
 * Flag sets the full-path simulator runs under (full-path-sim.ts), picked with
 * CRISIS_SIM_PROFILE. A fix lane adds its flag to `all-on` in its own PR, so
 * "every lane on" is always one profile.
 *
 * `prod-2026-10-31`: the crisis flags of the prod worker's boot settings on
 * 2026-10-31. Unset flags are written out at their code default, so a default
 * changing later shows up as a diff here, not as a silent change of baseline.
 */

export type FlagSet = Readonly<Record<string, string>>;

const PROD_2026_10_31: FlagSet = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_IMMINENT_NEEDS_AGREEMENT: 'off',
  CRISIS_GROUNDED_RELEASE: 'off',
  CRISIS_CONFIRMED_CALL_RISK: 'off',
  CRISIS_ADJUDICATOR: 'off',
  CRISIS_CLASSIFIER_ONLY_CHECKIN: 'off',
  CRISIS_CLASSIFIER_SECOND_READ: 'off',
  CRISIS_TRANSFER_EVERYDAY: 'off',
  CRISIS_SAME_CALL_NOTE_FADES: 'off',
  CRISIS_SIGHT_NEEDS_CUE: 'off',
  CRISIS_MEANS_IN_HAND: 'shadow',
  SAFETY_WHOLE_WORD_SITES: 'off',
  EARLY_WARNING_WORD_BOUNDARY: 'off',
  THIRD_PARTY_SELF_HARM: 'off',
  // Off in prod, and kept off here: on, it writes crisis events to Firestore.
  CRISIS_EVENT_RECORD: 'off',
};

/** Every crisis brake that exists, on. The adjudicator's live mode is blocked in code. */
const ALL_ON: FlagSet = {
  ...PROD_2026_10_31,
  CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on',
  CRISIS_GROUNDED_RELEASE: 'live',
  CRISIS_CONFIRMED_CALL_RISK: 'on',
  CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live',
  CRISIS_CLASSIFIER_SECOND_READ: 'on',
  CRISIS_TRANSFER_EVERYDAY: 'on',
  CRISIS_SAME_CALL_NOTE_FADES: 'on',
  CRISIS_SIGHT_NEEDS_CUE: 'on',
  CRISIS_MEANS_IN_HAND: 'on',
  SAFETY_WHOLE_WORD_SITES: 'on',
  EARLY_WARNING_WORD_BOUNDARY: 'on',
  THIRD_PARTY_SELF_HARM: 'on',
};

export const PROFILES: Readonly<Record<string, FlagSet>> = {
  'prod-2026-10-31': PROD_2026_10_31,
  'all-on': ALL_ON,
};

export const DEFAULT_PROFILE = 'prod-2026-10-31';

/**
 * The profile named by CRISIS_SIM_PROFILE, then CRISIS_SIM_SET overrides
 * ("NAME=value;NAME=value"), for a one-off arm. Throws on an unknown profile
 * or a malformed override: a typo must never run the wrong flags quietly.
 */
export function resolveProfile(env: Record<string, string | undefined> = process.env): {
  name: string;
  flags: FlagSet;
} {
  const name = env.CRISIS_SIM_PROFILE?.trim() || DEFAULT_PROFILE;
  const base = PROFILES[name];
  if (!base)
    throw new Error(`unknown CRISIS_SIM_PROFILE ${name}: ${Object.keys(PROFILES).join(', ')}`);
  const flags: Record<string, string> = { ...base };
  for (const pair of (env.CRISIS_SIM_SET ?? '').split(';').filter((p) => p.trim())) {
    const match = /^\s*([A-Z][A-Z0-9_]*)=(\S+)\s*$/.exec(pair);
    if (!match) throw new Error(`malformed CRISIS_SIM_SET entry: ${pair}`);
    flags[match[1]] = match[2];
  }
  const overridden = env.CRISIS_SIM_SET?.trim() ? `${name}+${env.CRISIS_SIM_SET.trim()}` : name;
  return { name: overridden, flags };
}
