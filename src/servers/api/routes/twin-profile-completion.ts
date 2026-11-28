/**
 * How complete a Digital Twin profile is, and which fields a saved profile must carry
 * for that to be computed. One list of scored fields serves both, so the save check and
 * the score can't drift apart.
 *
 * @module servers/api/routes/twin-profile-completion
 */

/** Scored list fields and their weight: a field counts once it has at least one entry. */
const LIST_FIELD_WEIGHTS = {
  lifeChapters: 15,
  keyRelationships: 10,
  formativeExperiences: 10,
  signaturePhrases: 15,
  expressionsWhenHappy: 5,
  expressionsWhenSad: 5,
  expressionsWhenExcited: 5,
  expressionsWhenFrustrated: 5,
  coreValues: 10,
  whatMatters: 5,
} as const;

/** Scored text fields and their weight: a field counts once it is non-empty. */
const TEXT_FIELD_WEIGHTS = {
  greetingStyle: 5,
  farewellStyle: 5,
  lifePhilosophy: 5,
} as const;

type ScoredListField = keyof typeof LIST_FIELD_WEIGHTS;
type ScoredTextField = keyof typeof TEXT_FIELD_WEIGHTS;

/** The part of a profile the score reads. */
export type ScoredProfile = Record<ScoredListField, readonly unknown[]> &
  Partial<Record<ScoredTextField, string>>;

const SCORED_LIST_FIELDS = Object.keys(LIST_FIELD_WEIGHTS) as ScoredListField[];
const SCORED_TEXT_FIELDS = Object.keys(TEXT_FIELD_WEIGHTS) as ScoredTextField[];

export function calculateCompletionPercentage(profile: ScoredProfile): number {
  let score = 0;
  for (const field of SCORED_LIST_FIELDS) {
    if (profile[field].length > 0) score += LIST_FIELD_WEIGHTS[field];
  }
  for (const field of SCORED_TEXT_FIELDS) {
    if (profile[field]) score += TEXT_FIELD_WEIGHTS[field];
  }
  return Math.min(100, score);
}

/**
 * The scored list fields a request's profile is missing or doesn't give as a list, in a
 * fixed order. Empty means the profile can be scored and saved.
 */
export function invalidScoredFields(profile: object): ScoredListField[] {
  const fields = profile as Partial<Record<ScoredListField, unknown>>;
  return SCORED_LIST_FIELDS.filter((field) => !Array.isArray(fields[field]));
}
