/**
 * Flag sets the full-path simulator runs under (full-path-sim.ts), picked with
 * CRISIS_SIM_PROFILE. A fix lane adds its flag to `all-on` in its own PR, so
 * "every lane on" is always one profile.
 *
 * `prod-2026-10-31`: the crisis flags of the prod worker's boot settings on
 * 2026-10-31. Unset flags are written out at their code default, so a default
 * changing later shows up as a diff here, not as a silent change of baseline.
 *
 * `prod-2026-11-01`: the same, from the prod worker's boot settings for release
 * rc2 (53bb669b4) on 2026-11-01.
 *
 * `prod-2026-11-11`: prod-2026-11-01 with CRISIS_MEANS_IN_HAND live (prod flipped it
 * shadow → live on 2026-11-10 ~23:44Z), plus MINOR_CARE_OWNERS, which the sim reads
 * (minor-care.ts ownerExempt). Every value is checked against the prod boot settings on
 * 2026-11-11 (build 53bb669b4, rc2). Flags absent from that build, or unset there, are written
 * at main's code default.
 *
 * Every value is the exact mode its flag's resolver returns for it (full-path-profiles.test.ts):
 * a value a resolver doesn't know falls back to off or shadow without a word, so `on` where a
 * flag only knows `live` quietly ran it in shadow (CRISIS_MEANS_IN_HAND) or off
 * (THIRD_PARTY_SELF_HARM) in `all-on`.
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

const PROD_2026_11_01: FlagSet = {
  ...PROD_2026_10_31,
  CRISIS_CONFIRMED_CALL_RISK: 'shadow',
  EARLY_WARNING_STT_FORMS: 'off',
  SEXUAL_TOPIC_BOUNDARY: 'on',
  MINOR_CARE: 'on',
};

const PROD_2026_11_11: FlagSet = {
  ...PROD_2026_11_01,
  CRISIS_MEANS_IN_HAND: 'live',
  MINOR_CARE_OWNERS: 'on',
  // absent from prod build 53bb669b4; written at main's default
  CRISIS_GRADED_RESPONSE: 'off',
  CRISIS_READ_JOINED_TURN: 'off',
  MINOR_CRISIS_CARE: 'off',
  CRISIS_CLASSIFIER_BLOCKED_SIGNAL: 'off',
  // unset in prod build 53bb669b4 (no flag-registry entry); written at main's default
  CRISIS_CLASSIFIER_TIMEOUT_MS: '1000',
  CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS: '2000',
  CRISIS_SECOND_READ_GRACE_MS: '150',
  CRISIS_GROUNDED_RELEASE_TIMEOUT_MS: '1500',
  CRISIS_ADJUDICATOR_TIMEOUT_MS: '1200',
};

/** Every crisis brake that exists, on. The adjudicator's live mode is blocked in code. */
const ALL_ON: FlagSet = {
  ...PROD_2026_10_31,
  CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on',
  CRISIS_GROUNDED_RELEASE: 'live',
  CRISIS_GRADED_RESPONSE: 'shadow',
  CRISIS_CONFIRMED_CALL_RISK: 'on',
  CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live',
  CRISIS_CLASSIFIER_SECOND_READ: 'on',
  CRISIS_TRANSFER_EVERYDAY: 'on',
  CRISIS_SAME_CALL_NOTE_FADES: 'on',
  CRISIS_SIGHT_NEEDS_CUE: 'on',
  CRISIS_MEANS_IN_HAND: 'live',
  SAFETY_WHOLE_WORD_SITES: 'on',
  EARLY_WARNING_WORD_BOUNDARY: 'on',
  THIRD_PARTY_SELF_HARM: 'live',
};

export const PROFILES: Readonly<Record<string, FlagSet>> = {
  'prod-2026-10-31': PROD_2026_10_31,
  'prod-2026-11-01': PROD_2026_11_01,
  'prod-2026-11-11': PROD_2026_11_11,
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
