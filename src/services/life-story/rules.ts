/**
 * Pure rules for life story / beliefs memory: identity keys, ids, story
 * dedupe (the same story told twice is one entry), validation, merge
 * precedence (the user's word wins; stated beats inferred).
 *
 * @module services/life-story/rules
 */

import { createHash } from 'node:crypto';
import {
  BELIEF_KINDS,
  STORY_KINDS,
  type BeliefKind,
  type ItemArea,
  type ItemInput,
  type MemoryItem,
  type StoryKind,
} from './types.js';

export const LIMITS = { title: 140, detail: 400, period: 40, name: 60, theme: 40 } as const;

/** Ids are `story_<24 hex>`, `belief_<24 hex>`, `value_<...>` (legacy values have longer ids). */
export const ITEM_ID_PATTERN = /^(story|belief|value)_[A-Za-z0-9_-]{6,80}$/;

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export function isValidStoryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2100;
}

export function cleanText(value: string | undefined, max: number): string {
  if (!value) return '';
  const text = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

const STOPWORDS = new Set(
  (
    'a an the and or but so of to in on at for with from by about as is was were be been being ' +
    'i me my mine we us our you your he him his she her they them their it its this that these ' +
    'those there here then than when while what who whom which how why where just really very ' +
    'always never ever used use had have has did do does would could should will can got get ' +
    'one time once little kid kids young old year years ago back day days thing things story ' +
    'remember told tell telling talk talked about like also still all some any much many more'
  ).split(' ')
);

const SYNONYMS: Readonly<Record<string, string>> = {
  mom: 'mother',
  mum: 'mother',
  mama: 'mother',
  dad: 'father',
  papa: 'father',
  bro: 'brother',
  sis: 'sister',
  grandma: 'grandmother',
  gran: 'grandmother',
  nana: 'grandmother',
  grandpa: 'grandfather',
  granddad: 'grandfather',
  built: 'build',
  ran: 'run',
  went: 'go',
  broke: 'break',
  fell: 'fall',
  lost: 'lose',
};

function stem(word: string): string {
  const w = SYNONYMS[word] ?? word;
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Content tokens (stopwords dropped, crude stems), sorted and unique. */
export function contentTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(words.map(stem))].sort();
}

export function normalizeSubject(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|my|a|an) /, '')
    .trim();
}

/** Kinds whose identity is "the same story", matched loosely (wording varies each telling). */
const NARRATIVE_KINDS: ReadonlySet<StoryKind> = new Set(['story', 'moment', 'turning_point']);

export function isNarrativeKind(kind: string): boolean {
  return NARRATIVE_KINDS.has(kind as StoryKind);
}

/** Identity key for an input: `kind:normalized subject`. */
export function itemKeyFor(
  input: Pick<ItemInput, 'area' | 'kind' | 'title'> & { place?: string }
): string {
  if (input.area === 'story' && input.kind === 'origin' && input.place) {
    return `origin:${normalizeSubject(input.place)}`;
  }
  const tokens = contentTokens(input.title).slice(0, 8);
  const subject = tokens.length ? tokens.join(' ') : normalizeSubject(input.title);
  const group = isNarrativeKind(input.kind) ? 'story' : input.kind;
  return `${group}:${subject}`;
}

const PREFIX: Readonly<Record<ItemArea, string>> = { story: 'story_', beliefs: 'belief_' };

export function itemIdFor(area: ItemArea, key: string): string {
  const hash = createHash('sha256').update(`${area}|${key}`).digest('hex');
  return `${PREFIX[area]}${hash.slice(0, 24)}`;
}

/**
 * Is this the same story told again? Loose on purpose: people retell a story
 * in different words ("the treehouse my brother and I built" / "building a
 * treehouse with my brother"). Needs two shared content words, and most of
 * the shorter telling.
 */
export function isSameStory(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = new Set(contentTokens(b));
  if (ta.length === 0 || tb.size === 0) return false;
  const shared = ta.filter((t) => tb.has(t)).length;
  if (shared < 2) return false;
  const smaller = Math.min(ta.length, tb.size);
  const union = new Set([...ta, ...tb]).size;
  return shared / union >= 0.5 || shared / smaller >= 0.6 || shared >= 4;
}

/** The stored item a new input belongs to (same key, or the same story retold). */
export function findMatch<T extends MemoryItem>(
  items: readonly T[],
  input: ItemInput,
  key: string
): T | undefined {
  const exact = items.find((i) => i.key === key);
  if (exact) return exact;
  if (input.area !== 'story' || !isNarrativeKind(input.kind)) return undefined;
  const text = `${input.title} ${input.detail ?? ''}`;
  return items.find(
    (i) =>
      isNarrativeKind(i.kind) &&
      (isSameStory(i.title, input.title) || isSameStory(`${i.title} ${i.detail ?? ''}`, text))
  );
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export type Validated =
  | { readonly ok: true; readonly value: ItemInput }
  | { readonly ok: false; readonly error: ValidationError };

export function validateInput(raw: ItemInput): Validated {
  const kinds: readonly string[] = raw.area === 'story' ? STORY_KINDS : BELIEF_KINDS;
  if (raw.area !== 'story' && raw.area !== 'beliefs') {
    return { ok: false, error: { field: 'area', message: 'unknown area' } };
  }
  if (!kinds.includes(raw.kind))
    return { ok: false, error: { field: 'kind', message: 'unknown kind' } };
  const title = cleanText(raw.title, LIMITS.title);
  if (title.length < 2) return { ok: false, error: { field: 'title', message: 'too short' } };
  const detail = cleanText(raw.detail, LIMITS.detail) || undefined;
  const confidence = Math.min(
    1,
    Math.max(0, Number.isFinite(raw.confidence) ? raw.confidence : 0.5)
  );
  if (raw.area === 'beliefs') {
    return { ok: true, value: { ...raw, kind: raw.kind as BeliefKind, title, detail, confidence } };
  }
  if (raw.date !== undefined && !isValidStoryDate(raw.date)) {
    return { ok: false, error: { field: 'date', message: 'invalid date' } };
  }
  const people = (raw.people ?? []).map((p) => cleanText(p, LIMITS.name)).filter(Boolean);
  const themes = (raw.themes ?? []).map((t) => cleanText(t, LIMITS.theme)).filter(Boolean);
  return {
    ok: true,
    value: {
      ...raw,
      title,
      detail,
      confidence,
      period: cleanText(raw.period, LIMITS.period) || undefined,
      place: cleanText(raw.place, LIMITS.name) || undefined,
      people: people.length ? [...new Set(people)] : undefined,
      themes: themes.length ? [...new Set(themes)] : undefined,
    },
  };
}

export type MergeDecision = 'create' | 'provenance' | 'replace' | 'reinforce';

/**
 * - nothing stored → create
 * - stored item the user edited (or added) → only add provenance
 * - stated input over an inferred item → replace the wording
 * - otherwise → reinforce (provenance, mentions, fill gaps)
 */
export function decideMerge(existing: MemoryItem | undefined, input: ItemInput): MergeDecision {
  if (!existing) return 'create';
  if (input.source === 'user') return 'replace';
  if (existing.userEdited || existing.source === 'user') return 'provenance';
  if (input.source === 'stated' && existing.source === 'inferred') return 'replace';
  return 'reinforce';
}
