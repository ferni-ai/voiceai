/**
 * Interests & hobbies — a first-class domain of the preference profile.
 *
 * Stored like every preference (`interests` domain, key `interest:<name>`), with
 * structured `details`: kind, engagement level (curious → serious), related
 * people (F's personId when known), specifics worth remembering ("plays a 1998
 * Fender", "training for a 10k") and lastMentionedAt.
 *
 * Callers:
 *   F (topic mining / openers): getInterests(userId) — and still gate each topic
 *     with isTopicAllowedProactively (an interest never overrides a boundary).
 *
 * @module services/user-preferences/interests
 */

import { isActive } from './rules.js';
import { listPreferences } from './store.js';
import type {
  InterestDetails,
  InterestKind,
  InterestLevel,
  InterestPerson,
  PreferenceInput,
  PreferenceSource,
  UserPreference,
} from './types.js';

export { MAX_PEOPLE, MAX_SPECIFICS, mergeDetails, sanitizeDetails } from './interest-details.js';

export interface Interest {
  readonly id: string;
  readonly name: string;
  readonly kind?: InterestKind;
  readonly level?: InterestLevel;
  readonly relatedPeople: readonly InterestPerson[];
  readonly specifics: readonly string[];
  readonly lastMentionedAt?: string;
  readonly source: PreferenceSource;
  readonly userEdited: boolean;
  readonly active: boolean;
  readonly sourceConversationIds: readonly string[];
  readonly updatedAt: string;
}

export function toInterest(p: UserPreference): Interest {
  const d = p.details ?? {};
  return {
    id: p.id,
    name: p.value,
    ...(d.kind ? { kind: d.kind } : {}),
    ...(d.level ? { level: d.level } : {}),
    relatedPeople: d.relatedPeople ?? [],
    specifics: d.specifics ?? [],
    ...(d.lastMentionedAt ? { lastMentionedAt: d.lastMentionedAt } : {}),
    source: p.source,
    userEdited: p.userEdited,
    active: isActive(p),
    sourceConversationIds: p.sourceConversationIds,
    updatedAt: p.updatedAt,
  };
}

/** Pure: interests from a profile, most recently mentioned first. */
export function interestsFrom(
  prefs: readonly UserPreference[],
  opts: { activeOnly?: boolean } = {}
): Interest[] {
  return prefs
    .filter((p) => p.domain === 'interests')
    .map(toInterest)
    .filter((i) => !opts.activeOnly || i.active)
    .sort((a, b) =>
      (b.lastMentionedAt ?? b.updatedAt).localeCompare(a.lastMentionedAt ?? a.updatedAt)
    );
}

/**
 * The user's interests & hobbies. Defaults to ACTIVE ones only (explicit,
 * user-edited, or mentioned in 2+ conversations) — the right set for openers.
 */
export async function getInterests(
  userId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<Interest[]> {
  return interestsFrom(await listPreferences(userId), { activeOnly: opts.activeOnly ?? true });
}

// ── capture ────────────────────────────────────────────────────────────────

const KIND_HINTS: readonly [RegExp, InterestKind][] = [
  [
    /\b(running|10k|5k|marathon|cycling|swimming|tennis|golf|soccer|basketball|climbing|yoga|lifting|crossfit|boxing|skiing|surfing)\b/i,
    'sport',
  ],
  [
    /\b(pottery|painting|drawing|knitting|sewing|photography|writing|guitar|piano|drums|bass|singing|woodworking|baking)\b/i,
    'creative',
  ],
  [
    /\b(spanish|french|japanese|german|coding|programming|language|course|class|studying)\b/i,
    'learning',
  ],
  [/\b(reading|books?|series|podcasts?|anime|films?|movies|tv)\b/i, 'media'],
  [/\b(collect(?:ing)?|vinyl|stamps|coins|cards|sneakers)\b/i, 'collecting'],
  [/\b(hiking|camping|gardening|fishing|birding|birdwatching|kayaking)\b/i, 'outdoors'],
  [/\b(chess|video games|gaming|board games|puzzles|crosswords)\b/i, 'games'],
];

export function guessInterestKind(name: string): InterestKind {
  return KIND_HINTS.find(([re]) => re.test(name))?.[1] ?? 'hobby';
}

function interestInput(
  name: string,
  details: InterestDetails,
  source: PreferenceSource,
  confidence: number,
  conversationId?: string
): PreferenceInput {
  const clean = name
    .replace(/[.!?,;]+$/, '')
    .trim()
    .toLowerCase();
  return {
    domain: 'interests',
    key: `interest:${clean}`,
    value: clean,
    details: { kind: guessInterestKind(clean), ...details },
    source,
    confidence,
    ...(conversationId ? { conversationId } : {}),
  };
}

const INTEREST_RULES: readonly [
  RegExp,
  (m: RegExpExecArray) => [string, InterestDetails] | null,
][] = [
  [
    /\bi'?ve (?:gotten|got|been getting) (?:really )?into\s+([a-z][a-z' -]{1,30})/i,
    (m) => [m[1], { level: 'regular' }],
  ],
  [
    /\bi'?ve (?:just )?(?:started|taken up|picked up)\s+(?:learning\s+|playing\s+)?([a-z][a-z' -]{1,30})/i,
    (m) => [m[1], { level: 'curious' }],
  ],
  [/\bmy (?:new )?hobby is\s+([a-z][a-z' -]{1,30})/i, (m) => [m[1], { level: 'regular' }]],
  [
    /\bi'?m (?:really )?(?:obsessed with|passionate about|big into)\s+([a-z][a-z' -]{1,30})/i,
    (m) => [m[1], { level: 'serious' }],
  ],
  [
    /\bi'?m training for (?:a|an|the)\s+(10k|5k|half marathon|marathon|triathlon|[a-z0-9 -]{2,25}race)/i,
    (m) => ['running', { level: 'serious', specifics: [`training for a ${m[1].trim()}`] }],
  ],
  [
    /\bi play (?:a|an|my)\s+([0-9]{4}\s+)?([a-z][a-z -]{1,20}?)\s+(guitar|bass|piano|violin|ukulele)\b/i,
    (m) => [
      m[3],
      { specifics: [`plays a ${(m[1] ?? '').trim()} ${m[2].trim()} ${m[3]}`.replace(/\s+/g, ' ')] },
    ],
  ],
  [
    /\bi'?m (?:reading|on book \d+ of) (?:the\s+)?([A-Za-z][\w' -]{1,40}?)\s+series\b(?:,?\s+on book (\d+))?/i,
    (m) => [
      'reading',
      { specifics: [`reading the ${m[1].trim()} series${m[2] ? `, on book ${m[2]}` : ''}`] },
    ],
  ],
];

const NOT_INTERESTS = /^(a|an|the|it|that|this|trouble|a fight|an argument|debt|bed|work)\b/i;

/** Interests stated in the user's words. */
export function parseInterestStatements(
  textIn: string,
  source: PreferenceSource,
  confidence: number,
  conversationId?: string
): PreferenceInput[] {
  const out: PreferenceInput[] = [];
  for (const [re, build] of INTEREST_RULES) {
    const m = re.exec(textIn);
    const built = m ? build(m) : null;
    if (!built) continue;
    const name = built[0].split(/\s+(?:and|but|because|lately|recently|again|now)\b/i)[0].trim();
    if (!name || NOT_INTERESTS.test(name) || name.split(' ').length > 4) continue;
    out.push(interestInput(name, built[1], source, confidence, conversationId));
  }
  return out;
}

/** Turn a liked activity ("I love hiking") into an interest mention. */
export function interestFromActivity(
  activity: string,
  source: PreferenceSource,
  confidence: number,
  conversationId?: string
): PreferenceInput {
  return interestInput(activity, { level: 'casual' }, source, confidence, conversationId);
}
