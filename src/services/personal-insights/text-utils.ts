/**
 * Small, transparent text helpers shared by the people model, topic mining
 * and prediction: kinship roles, sensitivity, sentiment, stable ids.
 *
 * @module services/personal-insights/text-utils
 */

import { createHash } from 'crypto';
import { contentWords, mentions } from '../../memory/recall/session-recall.js';
import type { OpenThread, RelationshipGroup, SensitiveCategory, SourceSummary } from './types.js';

export { contentWords, mentions };

export const DAY_MS = 24 * 60 * 60 * 1000;

export function stableId(prefix: string, key: string): string {
  return `${prefix}_${createHash('sha1').update(key.trim().toLowerCase()).digest('hex').slice(0, 16)}`;
}

/** The entity the extractor uses for the caller themself. */
export function isSelf(name: string): boolean {
  return /^(speaker|user|me|i|myself|the user)$/i.test(name.trim());
}

// ============================================================================
// KINSHIP ROLES
// ============================================================================

interface RoleDef {
  readonly role: string;
  readonly group: RelationshipGroup;
  /** Roles a user has at most one of: a bare "mom" can merge with the one named mother. */
  readonly unique: boolean;
  /** How the persona refers to them without a name. */
  readonly label: string;
  readonly words: readonly string[];
}

const ROLES: readonly RoleDef[] = [
  {
    role: 'mother',
    group: 'family',
    unique: true,
    label: 'mom',
    words: ['mom', 'mother', 'mum', 'mama', 'mommy'],
  },
  {
    role: 'father',
    group: 'family',
    unique: true,
    label: 'dad',
    words: ['dad', 'father', 'papa', 'daddy'],
  },
  {
    role: 'partner',
    group: 'partner',
    unique: true,
    label: 'partner',
    words: [
      'partner',
      'wife',
      'husband',
      'spouse',
      'boyfriend',
      'girlfriend',
      'fiance',
      'fiancee',
      'fiancé',
      'fiancée',
    ],
  },
  { role: 'sister', group: 'family', unique: false, label: 'sister', words: ['sister', 'sis'] },
  { role: 'brother', group: 'family', unique: false, label: 'brother', words: ['brother', 'bro'] },
  { role: 'son', group: 'family', unique: false, label: 'son', words: ['son'] },
  { role: 'daughter', group: 'family', unique: false, label: 'daughter', words: ['daughter'] },
  { role: 'child', group: 'family', unique: false, label: 'kid', words: ['kid', 'child'] },
  {
    role: 'grandmother',
    group: 'family',
    unique: false,
    label: 'grandma',
    words: ['grandma', 'grandmother', 'nana', 'granny'],
  },
  {
    role: 'grandfather',
    group: 'family',
    unique: false,
    label: 'grandpa',
    words: ['grandpa', 'grandfather', 'granddad'],
  },
  { role: 'aunt', group: 'family', unique: false, label: 'aunt', words: ['aunt', 'auntie'] },
  { role: 'uncle', group: 'family', unique: false, label: 'uncle', words: ['uncle'] },
  { role: 'cousin', group: 'family', unique: false, label: 'cousin', words: ['cousin'] },
  {
    role: 'in_law',
    group: 'family',
    unique: false,
    label: 'in-law',
    words: ['mother-in-law', 'father-in-law', 'sister-in-law', 'brother-in-law', 'in-law'],
  },
  {
    role: 'best_friend',
    group: 'friend',
    unique: true,
    label: 'best friend',
    words: ['best friend', 'bestie', 'bff'],
  },
  {
    role: 'friend',
    group: 'friend',
    unique: false,
    label: 'friend',
    words: ['friend', 'buddy', 'pal'],
  },
  {
    role: 'neighbor',
    group: 'friend',
    unique: false,
    label: 'neighbor',
    words: ['neighbor', 'neighbour'],
  },
  {
    role: 'roommate',
    group: 'friend',
    unique: false,
    label: 'roommate',
    words: ['roommate', 'flatmate', 'housemate'],
  },
  { role: 'classmate', group: 'friend', unique: false, label: 'classmate', words: ['classmate'] },
  {
    role: 'boss',
    group: 'work',
    unique: true,
    label: 'boss',
    words: ['boss', 'manager', 'supervisor'],
  },
  {
    role: 'coworker',
    group: 'work',
    unique: false,
    label: 'coworker',
    words: ['coworker', 'co-worker', 'colleague', 'teammate'],
  },
  {
    role: 'dog',
    group: 'pet',
    unique: false,
    label: 'dog',
    words: ['dog', 'pup', 'puppy', 'doggo', 'pooch'],
  },
  { role: 'cat', group: 'pet', unique: false, label: 'cat', words: ['cat', 'kitty', 'kitten'] },
  {
    role: 'pet',
    group: 'pet',
    unique: false,
    label: 'pet',
    words: ['pet', 'rabbit', 'bunny', 'hamster', 'parrot', 'horse', 'guinea pig'],
  },
];

const ROLE_BY_NAME = new Map(ROLES.map((r) => [r.role, r]));

/** Longest words first so "best friend" wins over "friend", "mother-in-law" over "mother". */
const ROLE_WORDS: Array<{ word: string; def: RoleDef }> = ROLES.flatMap((def) =>
  def.words.map((word) => ({ word, def }))
).sort((a, b) => b.word.length - a.word.length);

/**
 * The kinship role a phrase names: "Mom", "my mother", "is_mother_of",
 * "relationship: sister". Null when it names no role.
 */
export function roleFromText(text: string): string | null {
  const t = text.toLowerCase().replace(/[_]+/g, ' ').replace(/'s\b/g, '');
  for (const { word, def } of ROLE_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z])${escaped}s?($|[^a-z])`, 'i').test(t)) return def.role;
  }
  return null;
}

export function roleGroup(role: string | undefined): RelationshipGroup {
  return (role && ROLE_BY_NAME.get(role)?.group) || 'other';
}

export function roleIsUnique(role: string): boolean {
  return ROLE_BY_NAME.get(role)?.unique ?? false;
}

export function roleLabel(role: string): string {
  return ROLE_BY_NAME.get(role)?.label ?? role.replace(/_/g, ' ');
}

/** Surface words for a role, for mention matching ("mom", "mother", ...). */
export function roleWords(role: string): readonly string[] {
  return ROLE_BY_NAME.get(role)?.words ?? [];
}

/** A phrase that is only a role reference ("mom", "my sister"), not a proper name. */
export function isRoleOnly(name: string): boolean {
  const stripped = name
    .toLowerCase()
    .replace(/^(my|our|the|his|her|their)\s+/, '')
    .trim();
  return ROLE_WORDS.some(({ word }) => stripped === word || stripped === `${word}s`);
}

/** "Linda", "Dr. Patel": capitalized, not a role word, not the user. */
export function looksLikeProperName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || isRoleOnly(n) || isSelf(n) || /'s\b/i.test(n)) return false;
  const tokens = n.split(/\s+/);
  return tokens.length <= 3 && tokens.every((t) => /^[A-Z][\p{L}.'-]*$/u.test(t));
}

// ============================================================================
// SENSITIVITY / SENTIMENT
// ============================================================================

const SENSITIVE: ReadonlyArray<[SensitiveCategory, RegExp]> = [
  [
    'crisis',
    /\b(suicid\w*|self[- ]harm|kill (myself|himself|herself)|overdose|want to die|abuse[ds]?)\b/i,
  ],
  ['grief', /\b(died|death|passed away|funeral|grie(f|ving)|loss of|lost (my|her|his))\b/i],
  [
    'health',
    /\b(surgery|cancer|diagnos\w*|hospital|doctor|therapy|therapist|illness|sick|medication|chemo|pregnan\w*|miscarriage|depress\w*|anxiety|panic|sleep|insomnia|injur\w*|pain)\b/i,
  ],
  [
    'money',
    /\b(debt|money|loan|mortgage|rent|bills?|broke|salary|laid off|layoff|bankrupt\w*|savings|finances?)\b/i,
  ],
  [
    'relationships',
    /\b(divorce|breakup|broke up|separat\w*|affair|cheat\w*|fight(ing)? with|argument)\b/i,
  ],
];

/** The most sensitive category a text touches, crisis first. */
export function sensitivityOf(text: string): SensitiveCategory | undefined {
  for (const [category, pattern] of SENSITIVE) if (pattern.test(text)) return category;
  return undefined;
}

const POSITIVE =
  /\b(great|good|happy|love[ds]?|proud|excited|better|fun|wonderful|amazing|close|grateful|thankful|support\w*|enjoy\w*|glad)\b/gi;
const NEGATIVE =
  /\b(bad|sad|angry|upset|worried|worse|stress\w*|fight\w*|argu\w*|tense|hurt|frustrat\w*|annoy\w*|disappoint\w*|lonely|scared|anxious|difficult|hard)\b/gi;

/** Lexicon sentiment in [-1, 1]; 0 when neutral or empty. */
export function sentimentScore(text: string): number {
  const pos = text.match(POSITIVE)?.length ?? 0;
  const neg = text.match(NEGATIVE)?.length ?? 0;
  return pos + neg === 0 ? 0 : (pos - neg) / (pos + neg);
}

// ============================================================================
// LABELS
// ============================================================================

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** True when `text` is about `terms`: a multi-word label needs half its words, a single word needs itself. */
export function textMatchesTerms(text: string, terms: readonly string[]): boolean {
  const words = contentWords(text);
  for (const term of terms) {
    const tw = contentWords(term);
    if (tw.size === 0) {
      if (mentions(text, term)) return true;
      continue;
    }
    let hit = 0;
    for (const w of tw) if (words.has(w)) hit++;
    if (hit >= Math.max(1, Math.ceil(tw.size / 2))) return true;
    if (mentions(text, term)) return true;
  }
  return false;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** True when a later summary reports on this item (shares at least half its content words). */
export function isResolved(item: OpenThread, later: readonly SourceSummary[]): boolean {
  const words = contentWords(item.text);
  if (words.size === 0) return false;
  for (const s of later) {
    if (s.at <= item.mentionedAt) continue;
    const reported = contentWords([...s.keyPoints, ...s.mainTopics].join(' '));
    let shared = 0;
    for (const w of words) if (reported.has(w)) shared++;
    if (shared >= Math.ceil(words.size / 2)) return true;
  }
  return false;
}
