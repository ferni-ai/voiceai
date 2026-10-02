/**
 * Pure rules for work & places memory: identity, validation, precedence.
 *
 * Precedence: the user's own edits (page/tool, `userEdited`) always win;
 * after that the user's own words (`stated`) beat paraphrases and facts
 * (`inferred`). A lower-precedence write may fill gaps and add provenance but
 * never overwrites what a higher-precedence source said.
 *
 * @module services/work-and-places/rules
 */

import { createHash } from 'crypto';
import {
  areaOfKind,
  ID_PREFIX,
  LIFE_STATUSES,
  type LifeArea,
  type LifeInput,
  type LifeItem,
  type LifeKind,
  type LifeSource,
  type LifeStatus,
  type PlaceCategory,
  type WorkEventType,
} from './types.js';

const SOURCE_RANK: Readonly<Record<LifeSource, number>> = { inferred: 0, stated: 1, user: 2 };

export const LIMITS = { title: 120, name: 80, notes: 300, people: 6, roles: 10 } as const;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

/** Statuses each kind can be in; the first is the default. */
export const KIND_STATUSES: Readonly<Record<LifeKind, readonly LifeStatus[]>> = {
  job: ['current', 'past'],
  project: ['current', 'past'],
  win: ['past'],
  stress: ['current', 'past'],
  goal: ['planned', 'done'],
  event: ['planned', 'done'],
  application: ['planned', 'done', 'past'],
  home: ['current', 'past'],
  trip: ['planned', 'done'],
  favorite: ['current', 'past'],
  meaningful: ['past', 'current'],
  bucket_list: ['planned', 'done'],
};

const EVENT_TYPES: readonly WorkEventType[] = [
  'interview',
  'review',
  'presentation',
  'deadline',
  'other',
];
const PLACE_CATEGORIES: readonly PlaceCategory[] = [
  'city',
  'neighbourhood',
  'country',
  'restaurant',
  'cafe',
  'bar',
  'park',
  'beach',
  'other',
];

/** Lowercase, strip accents/punctuation/articles, collapse spaces. */
export function normalizeSubject(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an|my|our)\s+/, '')
    .replace(/\s+(inc|llc|ltd|corp|co|company)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One line, no markup, bounded. User text ends up in prompts and HTML. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>`{}[\]#*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function isValidLifeDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function lifeItemIdFor(area: LifeArea, key: string): string {
  const hash = createHash('sha256').update(`${area}|${key}`).digest('hex');
  return `${ID_PREFIX[area]}${hash.slice(0, 24)}`;
}

export const ITEM_ID_PATTERN = /^(work|place)_[a-f0-9]{24}$/;

/** The identity key for an input. Trips are per place and year. */
export function lifeKeyFor(input: Pick<LifeInput, 'kind' | 'subject' | 'startDate'>): string {
  const subject = normalizeSubject(input.subject);
  if (input.kind === 'trip') {
    const year = isValidLifeDate(input.startDate)
      ? input.startDate.slice(0, 4)
      : String(new Date().getUTCFullYear());
    return `trip:${subject}:${year}`;
  }
  return `${input.kind}:${subject}`;
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: ValidationError };

function bad(field: string, message: string): Checked<never> {
  return { ok: false, error: { field, message } };
}

/** Validate and clean an input. Pure. */
export function validateLifeInput(raw: LifeInput): Checked<LifeInput> {
  const area = areaOfKind(raw.kind);
  if (!area || area !== raw.area) return bad('kind', 'unknown kind for this area');
  const subject = cleanText(raw.subject, LIMITS.name);
  if (subject.length < 2 || !normalizeSubject(subject)) return bad('subject', 'too short');
  const statuses = KIND_STATUSES[raw.kind];
  if (raw.status !== undefined && !statuses.includes(raw.status)) {
    return bad('status', `must be one of ${statuses.join(', ')}`);
  }
  for (const field of ['startDate', 'endDate'] as const) {
    if (raw[field] !== undefined && !isValidLifeDate(raw[field])) {
      return bad(field, 'must be YYYY-MM or YYYY-MM-DD');
    }
  }
  if (raw.eventType !== undefined && !EVENT_TYPES.includes(raw.eventType)) {
    return bad('eventType', 'unknown');
  }
  if (raw.category !== undefined && !PLACE_CATEGORIES.includes(raw.category)) {
    return bad('category', 'unknown');
  }
  const opt = (value: string | undefined, max: number): string | undefined => {
    const v = cleanText(value, max);
    return v || undefined;
  };
  const people = (raw.withPeople ?? [])
    .map((p) => cleanText(p, LIMITS.name))
    .filter(Boolean)
    .slice(0, LIMITS.people);
  const value: LifeInput = {
    ...raw,
    subject,
    title: opt(raw.title, LIMITS.title),
    employer: opt(raw.employer, LIMITS.name),
    role: opt(raw.role, LIMITS.name),
    team: opt(raw.team, LIMITS.name),
    place: opt(raw.place, LIMITS.name),
    meaning: opt(raw.meaning, LIMITS.title),
    notes: opt(raw.notes, LIMITS.notes),
    withPeople: people.length ? people : undefined,
    confidence: Math.min(1, Math.max(0, Number.isFinite(raw.confidence) ? raw.confidence : 0.5)),
  };
  return { ok: true, value };
}

/** Default display title when the input has none. */
export function defaultTitle(input: LifeInput): string {
  switch (input.kind) {
    case 'job':
      if (input.role && input.employer) return `${input.role} at ${input.employer}`;
      return input.employer ?? input.role ?? input.subject;
    case 'trip':
      return `Trip to ${input.place ?? input.subject}`;
    case 'home':
    case 'favorite':
    case 'bucket_list':
      return input.place ?? input.subject;
    case 'meaningful':
      return input.meaning ? `${input.place ?? input.subject} (${input.meaning})` : input.subject;
    default:
      return input.subject;
  }
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  return normalizeSubject(a ?? '') === normalizeSubject(b ?? '');
}

function unionList(a: readonly string[], add: string | undefined): string[] {
  return add && !a.includes(add) ? [...a, add] : [...a];
}

function drop<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export type MergeDecision =
  | { kind: 'create'; next: LifeItem }
  | { kind: 'replace' | 'reinforce' | 'provenance'; next: LifeItem };

/**
 * Merge an input into what is stored. Pure.
 * `provenance` = the existing item is user-edited and an automated source only adds evidence.
 */
export function decideMerge(
  existing: LifeItem | undefined,
  input: LifeInput,
  id: string,
  key: string,
  nowIso: string
): MergeDecision {
  const sourceConversationIds = unionList(
    existing?.sourceConversationIds ?? [],
    input.conversationId
  );
  const sourceFactIds = unionList(existing?.sourceFactIds ?? [], input.factId);
  const isUser = input.source === 'user';

  if (!existing) {
    const status = input.status ?? KIND_STATUSES[input.kind][0];
    return {
      kind: 'create',
      next: drop({
        id,
        area: input.area,
        kind: input.kind,
        key,
        title: input.title ?? defaultTitle(input),
        status,
        employer: input.employer,
        role: input.role,
        team: input.team,
        eventType: input.eventType,
        place: input.place,
        category: input.category,
        meaning: input.meaning,
        withPeople: input.withPeople,
        entityId: input.entityId,
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes,
        source: input.source,
        confidence: isUser ? 1 : input.confidence,
        userEdited: isUser,
        sourceConversationIds,
        sourceFactIds,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastMentionedAt: nowIso,
        ...(isUser ? { editedAt: nowIso } : {}),
      } as LifeItem),
    };
  }

  if (existing.userEdited && !isUser) {
    return {
      kind: 'provenance',
      next: { ...existing, sourceConversationIds, sourceFactIds, lastMentionedAt: nowIso },
    };
  }

  const wins = SOURCE_RANK[input.source] >= SOURCE_RANK[existing.source];
  const pick = <T>(next: T | undefined, prev: T | undefined): T | undefined =>
    next !== undefined && (wins || prev === undefined) ? next : prev;

  let previousRoles = existing.previousRoles ? [...existing.previousRoles] : undefined;
  if (wins && input.role && existing.role && !sameText(input.role, existing.role)) {
    previousRoles = unionList(previousRoles ?? [], existing.role).slice(-LIMITS.roles);
  }
  const role = pick(input.role, existing.role);
  const employer = pick(input.employer, existing.employer);
  const changedFields =
    (wins && input.status !== undefined && input.status !== existing.status) ||
    (role !== existing.role && !sameText(role, existing.role)) ||
    (employer !== existing.employer && !sameText(employer, existing.employer)) ||
    (wins && input.startDate !== undefined && input.startDate !== existing.startDate);

  const mergedInput: LifeInput = {
    ...input,
    role,
    employer,
    place: pick(input.place, existing.place),
  };
  const keepTitle = existing.userEdited || (!wins && existing.title);
  const next: LifeItem = drop({
    ...existing,
    title: keepTitle
      ? existing.title
      : (input.title ?? (input.kind === 'job' ? defaultTitle(mergedInput) : existing.title)),
    status: pick(input.status, existing.status) ?? existing.status,
    employer,
    role,
    previousRoles,
    team: pick(input.team, existing.team),
    eventType: pick(input.eventType, existing.eventType),
    place: mergedInput.place,
    category: pick(input.category, existing.category),
    meaning: pick(input.meaning, existing.meaning),
    withPeople: input.withPeople
      ? [...new Set([...(existing.withPeople ?? []), ...input.withPeople])].slice(0, LIMITS.people)
      : existing.withPeople,
    entityId: existing.entityId ?? input.entityId,
    startDate: pick(input.startDate, existing.startDate),
    endDate: pick(input.endDate, existing.endDate),
    notes: pick(input.notes, existing.notes),
    source: wins ? input.source : existing.source,
    confidence: isUser
      ? 1
      : Math.min(
          0.99,
          Math.max(existing.confidence, input.confidence) + (changedFields ? 0 : 0.05)
        ),
    userEdited: existing.userEdited || isUser,
    sourceConversationIds,
    sourceFactIds,
    updatedAt: nowIso,
    lastMentionedAt: nowIso,
    ...(isUser ? { editedAt: nowIso } : {}),
  } as LifeItem);
  return { kind: changedFields || isUser ? 'replace' : 'reinforce', next };
}

/** `YYYY-MM-DD` of an ISO instant. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Status as of today: a planned trip or interview whose day has passed is done.
 * Month-precision dates count as passed once the month is over.
 */
export function effectiveStatus(item: LifeItem, today: string): LifeStatus {
  if (item.status !== 'planned' || (item.kind !== 'trip' && item.kind !== 'event')) {
    return item.status;
  }
  const last = item.endDate ?? item.startDate;
  if (!last) return item.status;
  if (last.length === 7) return last < today.slice(0, 7) ? 'done' : item.status;
  return last < today ? 'done' : item.status;
}

export function isStatus(value: unknown): value is LifeStatus {
  return typeof value === 'string' && (LIFE_STATUSES as readonly string[]).includes(value);
}
