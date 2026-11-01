/**
 * FACTS_DUAL_WRITE: the dynamic_facts extractor (deep extraction) and the world_facts
 * ingest also propose each fact they just wrote to the memory writer, so the facts store
 * fills beside the legacy stores. Only what the legacy write stored is proposed; the
 * writer's value guard, forgotten-topic check and member guard still decide.
 *
 * Each extractor item maps to one op, explicitly:
 *   update  a single-valued attribute (city, employer, role, relation, birthday): the
 *           writer supersedes the current value, keeping it labelled (or NOOPs it).
 *   add     a multi-valued one (pet, health_note, preference, goal, other).
 *   noop    not a fact about a person here, with the reason: contact data (phone, email,
 *           address), a dated event or open item (the ledger's), Ferni's own promise, a
 *           fact already closed, retracted or forgotten, or no usable subject.
 * Provenance: a world fact the caller said is user_said; everything an extractor read off
 * the call is inferred. A fact about Ferni or a teammate is refused by the writer.
 *
 * Owner-first: on per person (their cohort value, else the env), and MEMORY_FACTS must be
 * on for them too. Never throws: a failure is logged with ids and counts, never a value,
 * and the legacy write it follows has already landed.
 *
 * @module memory/writer/facts-dual-write
 */
import type { Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import type { FlagName } from '../../config/flag-manifest.js';
import { personFlagOn } from '../../config/person-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isSingleValued, type FactAttribute } from '../facts/fact.js';
import { proposeFact, type FactProposal, type ProposeResult } from './memory-writer.js';

const log = createLogger({ module: 'facts-dual-write' });

export type Extractor = 'dynamic_facts' | 'world_facts';
export type MappedFact =
  { op: 'add' | 'update'; proposal: FactProposal } | { op: 'noop'; reason: string };

/** One call's extraction rarely holds more; each proposal is a transaction. */
const MAX_PER_RUN = 40;
const SAFE = /[^\w:.@+-]/g;
const key = (s: string): string => s.replace(SAFE, '_').slice(0, 200);
const ascii = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
const SELF = new Set(['user', 'self', 'me', 'caller', 'i']);
const nameKey = (name: string): string => name.trim().toLowerCase();
/** 'self', or `${kind}:${ascii name}`; null when nothing usable is left. */
function subjectOf(name: string, kind: string): string | null {
  if (SELF.has(nameKey(name))) return 'self';
  const slug = ascii(name);
  return slug ? `${kind}:${slug}` : null;
}
const noop = (reason: string): MappedFact => ({ op: 'noop', reason });
const isoOrUndefined = (x: unknown): Date | undefined => {
  const d = typeof x === 'string' ? new Date(x) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};
const opFor = (attribute: FactAttribute): 'add' | 'update' =>
  isSingleValued(attribute) ? 'update' : 'add';
const confidence = (x: unknown): number | undefined =>
  typeof x === 'number' && x >= 0 && x <= 1 ? x : undefined;

// prettier-ignore
const DYNAMIC_KEYS: ReadonlyArray<[RegExp, FactAttribute | 'contact' | 'now']> = [
  [/^(phone|phone_number|mobile|cell|email|email_address|address|home_address)$/, 'contact'],
  [/^(birthday|birth_date|birthdate|date_of_birth|dob)$/, 'birthday'],
  [/^(city|home|location|lives_in|hometown|home_town|residence|current_city)$/, 'city'],
  [/^current_location$/, 'now'], // where they are right now: never their city (right-moment §5.3)
  [/^(employer|company|works_at|workplace)$/, 'employer'],
  [/^(job|role|occupation|profession|job_title|title|position)$/, 'role'],
  [/^(relation|relationship|relationship_to_user)$/, 'relation'],
  [/^(pet|pets|pet_name)$/, 'pet'],
  [/^(health|medical|condition|diagnosis|illness|injury|health_condition)$/, 'health_note'],
  [/^(goal|goals|aspiration)$/, 'goal'],
];

/** A dynamic_facts document (id `factId`) as written by deep extraction, as one facts-store op. */
export function mapDynamicFact(
  doc: Record<string, unknown>,
  sessionId: string,
  factId: string,
  relationship?: string
): MappedFact {
  const { entityName, factType, value } = doc;
  const rawKey = typeof doc.key === 'string' ? doc.key : '';
  if (typeof entityName !== 'string' || typeof value !== 'string' || !rawKey) return noop('shape');
  if (factType === 'event') return noop('event');
  const subjectId = subjectOf(entityName, 'entity');
  if (!subjectId) return noop('subject');
  const slot = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  let attribute: FactAttribute | 'contact' | 'now' =
    DYNAMIC_KEYS.find(([re]) => re.test(slot))?.[1] ??
    (factType === 'preference' ? 'preference' : 'other');
  if (attribute === 'contact' || attribute === 'now') return noop(attribute);
  if (attribute === 'relation' && subjectId === 'self') attribute = 'other';
  return {
    op: opFor(attribute),
    proposal: {
      subjectId,
      attribute,
      value: attribute === 'other' ? `${rawKey.replace(/_/g, ' ')}: ${value}` : value,
      source: 'dynamic_facts',
      provenance: 'inferred',
      relationship: relationship ?? null,
      sourceKey: key(`${sessionId}:${factId}`),
      sourceEpisodeId: key(sessionId) || null,
      confidence: confidence(doc.confidence),
      sensitive: attribute === 'health_note',
      at: isoOrUndefined(doc.extractedAt),
    },
  };
}

/** Each dynamic_facts document written (with its id), with the relationship the call stated. */
export function mapDynamicFacts(
  written: ReadonlyArray<[Record<string, unknown>, string]>,
  sessionId: string,
  relationships: ReadonlyArray<{ source: string; target: string; type: string }>
): MappedFact[] {
  const stated = new Map<string, string>();
  for (const r of relationships) {
    const [source, target] = [String(r.source ?? ''), String(r.target ?? '')]; // model output
    if (SELF.has(nameKey(source))) stated.set(nameKey(target), r.type);
    else if (SELF.has(nameKey(target))) stated.set(nameKey(source), r.type);
  }
  return written.map(([doc, id]) =>
    mapDynamicFact(doc, sessionId, id, stated.get(nameKey(String(doc.entityName ?? ''))))
  );
}

/** The fields of a world_facts TemporalFact this reads (intelligence/world-model/temporal). */
export interface WorldFactShape {
  id: string;
  subject: string;
  subjectKind: string;
  relation?: string;
  attribute: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  observedAt: string;
  confidence: number;
  source: { sessionId: string };
  by?: 'caller' | 'ferni';
  forgottenAt?: string;
  wrong?: boolean;
}
// prettier-ignore
const WORLD_ATTRIBUTES: Readonly<Record<string, FactAttribute>> = {
  location: 'city', job: 'employer', role: 'role', health: 'health_note', goal: 'goal',
  status: 'other', relationship: 'other', school: 'other',
};

/** A world_facts fact as written by the ingest, as facts-store ops (its relation is one too). */
export function mapWorldFact(f: WorldFactShape): MappedFact[] {
  if (f.validTo !== null || f.forgottenAt || f.wrong) return [noop('closed')];
  if (f.by === 'ferni') return [noop('ferni')];
  const subjectId = subjectOf(f.subject, f.subjectKind);
  if (!subjectId) return [noop('subject')];
  const attribute = WORLD_ATTRIBUTES[f.attribute];
  const base = {
    subjectId,
    source: 'world_facts' as const,
    provenance: f.by === 'caller' ? ('user_said' as const) : ('inferred' as const),
    relationship: f.relation ?? null,
    sourceEpisodeId: key(f.source.sessionId) || null,
    confidence: confidence(f.confidence),
    at: isoOrUndefined(f.observedAt),
  };
  const out: MappedFact[] = [];
  if (!attribute) out.push(noop('event'));
  else {
    // prettier-ignore
    out.push({ op: opFor(attribute), proposal: {
      ...base, attribute, sourceKey: key(f.id), validFrom: f.validFrom,
      value: attribute === 'other' ? `${f.attribute}: ${f.value}` : f.value,
      sensitive: attribute === 'health_note',
    } });
  }
  if (f.relation && subjectId !== 'self') {
    // prettier-ignore
    out.push({ op: 'update', proposal: {
      ...base, attribute: 'relation', value: f.relation, sourceKey: key(`${f.id}:relation`),
    } });
  }
  return out;
}

export interface DualWriteDeps {
  /** The caller's database; only asked for once both flags are on. */
  getDb: () => Firestore | null;
  /** The caller's env as their call had it (envForCaller); without it, personFlagOn. */
  env?: Env;
  propose?: typeof proposeFact;
}
const OUTCOMES = 'add update noop history refused skipped failed'.split(' ');
type Counts = Record<string, number>;

/** Proposes the mapped facts when FACTS_DUAL_WRITE and MEMORY_FACTS are on for this person. */
export async function dualWriteFacts(
  userId: string,
  extractor: Extractor,
  /** Run inside the guard: a malformed extractor item can't fail the caller's legacy write. */
  map: () => readonly MappedFact[],
  deps: DualWriteDeps
): Promise<Counts | null> {
  try {
    const on = (flag: FlagName): Promise<boolean> =>
      deps.env ? Promise.resolve(flagOn(flag, deps.env)) : personFlagOn(userId, flag);
    const mapped = map();
    if (!userId || mapped.length === 0 || !(await on('FACTS_DUAL_WRITE'))) return null;
    if (!(await on('MEMORY_FACTS'))) {
      log.info({ userId, extractor, mapped: mapped.length }, 'FACTS_DUAL_WRITE_MEMORY_FACTS_OFF');
      return null;
    }
    const db = deps.getDb();
    if (!db) return null;
    const propose = deps.propose ?? proposeFact;
    const counts: Counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
    for (const m of mapped.slice(0, MAX_PER_RUN)) {
      // One rejected fact never stops the rest.
      const r: ProposeResult | null | 'skipped' =
        m.op === 'noop'
          ? 'skipped'
          : await propose(db, userId, m.proposal, { MEMORY_FACTS: 'on' }).catch(() => null);
      counts[r === 'skipped' ? r : !r ? 'failed' : r.ok ? r.op : 'refused']++;
    }
    log.info({ userId, extractor, ...counts }, 'FACTS_DUAL_WRITE');
    return counts;
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    log.warn({ userId, extractor, error: name }, 'FACTS_DUAL_WRITE failed');
    return null;
  }
}
