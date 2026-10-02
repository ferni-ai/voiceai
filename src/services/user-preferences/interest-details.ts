/**
 * Pure helpers for interest/media `details`: sanitising untrusted input and merging.
 * Kept free of other profile imports so rules.ts can use it without cycles.
 *
 * @module services/user-preferences/interest-details
 */

import {
  INTEREST_KINDS,
  INTEREST_LEVELS,
  ALLERGY_SEVERITIES,
  MEDIA_ORIGINS,
  MEDIA_STATUSES,
  type InterestDetails,
  type InterestKind,
  type InterestLevel,
  type InterestPerson,
} from './types.js';

export const MAX_SPECIFICS = 8;
export const MAX_PEOPLE = 8;
const MAX_TEXT = 120;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t && t.length <= MAX_TEXT ? t : null;
}

/** Sanitise untrusted details (API body, LLM args). Unknown fields are dropped. */
export function sanitizeDetails(raw: unknown): InterestDetails | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: { -readonly [K in keyof InterestDetails]: InterestDetails[K] } = {};
  if (r.kind !== undefined) {
    if (!(INTEREST_KINDS as readonly unknown[]).includes(r.kind)) return null;
    out.kind = r.kind as InterestKind;
  }
  if (r.level !== undefined) {
    if (!(INTEREST_LEVELS as readonly unknown[]).includes(r.level)) return null;
    out.level = r.level as InterestLevel;
  }
  if (r.specifics !== undefined) {
    if (!Array.isArray(r.specifics)) return null;
    out.specifics = r.specifics
      .map(text)
      .filter((s): s is string => s !== null)
      .slice(0, MAX_SPECIFICS);
  }
  if (r.status !== undefined) {
    if (!(MEDIA_STATUSES as readonly unknown[]).includes(r.status)) return null;
    out.status = r.status as InterestDetails['status'];
  }
  if (r.origin !== undefined) {
    if (!(MEDIA_ORIGINS as readonly unknown[]).includes(r.origin)) return null;
    out.origin = r.origin as InterestDetails['origin'];
  }
  if (r.severity !== undefined) {
    if (!(ALLERGY_SEVERITIES as readonly unknown[]).includes(r.severity)) return null;
    out.severity = r.severity as InterestDetails['severity'];
  }
  for (const field of ['progress', 'opinion', 'outcome'] as const) {
    if (r[field] === undefined) continue;
    const t = text(r[field]);
    if (t === null) return null;
    out[field] = t;
  }
  for (const field of ['contexts', 'memories'] as const) {
    if (r[field] === undefined) continue;
    const list = r[field];
    if (!Array.isArray(list)) return null;
    out[field] = list
      .map(text)
      .filter((s): s is string => s !== null)
      .slice(0, MAX_SPECIFICS);
  }
  if (r.relatedPeople !== undefined) {
    if (!Array.isArray(r.relatedPeople)) return null;
    const people: InterestPerson[] = [];
    for (const p of r.relatedPeople) {
      const obj = typeof p === 'string' ? { name: p } : (p as Record<string, unknown>);
      const name = text(obj?.name);
      if (!name) continue;
      const personId = text(obj.personId);
      people.push({ name, ...(personId ? { personId } : {}) });
    }
    out.relatedPeople = people.slice(0, MAX_PEOPLE);
  }
  return out;
}

function levelRank(level?: InterestLevel): number {
  return level ? INTEREST_LEVELS.indexOf(level) : -1;
}

function unionSpecifics(a: readonly string[] = [], b: readonly string[] = []): string[] {
  const out = [...a];
  for (const s of b) if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  return out.slice(-MAX_SPECIFICS);
}

function unionPeople(
  a: readonly InterestPerson[] = [],
  b: readonly InterestPerson[] = []
): InterestPerson[] {
  const out = [...a];
  for (const p of b) {
    const i = out.findIndex(
      (x) =>
        (p.personId && x.personId === p.personId) || x.name.toLowerCase() === p.name.toLowerCase()
    );
    if (i === -1) out.push(p);
    else if (p.personId && !out[i].personId) out[i] = { ...out[i], personId: p.personId };
  }
  return out.slice(0, MAX_PEOPLE);
}

/**
 * Merge details.
 *  - 'user': fields the user sent replace what was there (lists included).
 *  - 'auto': additive — keep kind, raise level, union specifics/people.
 *  - 'touch': only lastMentionedAt (automation agreeing with a user-edited interest).
 */
export function mergeDetails(
  existing: InterestDetails | undefined,
  incoming: InterestDetails | undefined,
  mode: 'user' | 'auto' | 'touch',
  nowIso: string
): InterestDetails {
  const ex = existing ?? {};
  const inc = incoming ?? {};
  if (mode === 'touch') return { ...ex, lastMentionedAt: nowIso };
  if (mode === 'user') return { ...ex, ...inc, lastMentionedAt: ex.lastMentionedAt ?? nowIso };
  const level = levelRank(inc.level) > levelRank(ex.level) ? inc.level : ex.level;
  const specifics = unionSpecifics(ex.specifics, inc.specifics);
  const people = unionPeople(ex.relatedPeople, inc.relatedPeople);
  const contexts = unionSpecifics(ex.contexts, inc.contexts);
  const memories = unionSpecifics(ex.memories, inc.memories);
  // Newer mentions update status/progress/opinion ("I finished it").
  const status = inc.status ?? ex.status;
  const progress = inc.progress ?? ex.progress;
  const opinion = inc.opinion ?? ex.opinion;
  const outcome = inc.outcome ?? ex.outcome;
  // Severity only ever goes up from automated mentions (safety first).
  const sev = ALLERGY_SEVERITIES as readonly string[];
  const severity =
    inc.severity && sev.indexOf(inc.severity) > sev.indexOf(ex.severity ?? '')
      ? inc.severity
      : ex.severity;
  // A conversation mention outranks listening history as the origin.
  const origin =
    ex.origin === 'listening_history' && inc.origin ? inc.origin : (ex.origin ?? inc.origin);
  return {
    ...((ex.kind ?? inc.kind) ? { kind: ex.kind ?? inc.kind } : {}),
    ...(level ? { level } : {}),
    ...(specifics.length ? { specifics } : {}),
    ...(people.length ? { relatedPeople: people } : {}),
    ...(status ? { status } : {}),
    ...(progress ? { progress } : {}),
    ...(opinion ? { opinion } : {}),
    ...(outcome ? { outcome } : {}),
    ...(severity ? { severity } : {}),
    ...(contexts.length ? { contexts } : {}),
    ...(memories.length ? { memories } : {}),
    ...(origin ? { origin } : {}),
    lastMentionedAt: nowIso,
  };
}
