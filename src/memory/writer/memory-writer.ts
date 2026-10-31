/**
 * The memory writer: the only writer of the facts store. It reconciles a proposed fact
 * against the stored ones in one transaction, by code (exact subject and attribute;
 * values trimmed, case-folded, phones as E.164):
 *   ADD     nothing current says this.
 *   UPDATE  a single-valued attribute has a new value: the old fact gets validTo,
 *           retiredAt and supersededBy and is kept. Multi-valued ones (pets) add.
 *   NOOP    already known: only lastConfirmedAt moves.
 *   history a single-valued fact that arrives late (its validFrom is older than the
 *           current fact's) is stored already ended, at the next known validFrom; the
 *           current fact is left as it is.
 * A fact about a topic the person asked Ferni to forget is refused ('forgotten'), and
 * nothing is written while those topics can't be read. Ferni's own life is never a
 * person's fact: persona_canon is refused ('persona'), and so is a subject that is Ferni or
 * a teammate (isPersonaSubject) unless a relationship to the person is stated, by the
 * proposal or a current relation fact: "my friend Maya" is theirs, a bare "Maya" is not.
 * Idempotent per (source, sourceKey). Member facts only, nothing while MEMORY_FACTS is
 * off, ids and ops in logs, never a value.
 *
 * @module memory/writer/memory-writer
 */
import { createHash } from 'crypto';
import type { Firestore, Transaction } from '@google-cloud/firestore';
import { memoryFactsEnabled } from '../../config/memory-facts-flag.js';
import type { Env } from '../../config/env-flag.js';
import {
  FACT_VERSION,
  isFactId,
  isSingleValued,
  normalizeValue,
  toFact,
  valueKey,
  type Fact,
  type FactAttribute,
  type FactProvenance,
  type FactSource,
} from '../facts/fact.js';
import { isPersonaSubject } from '../entity-hygiene.js';
import { recordPersonaFactRefused } from '../operations/memory-extraction-telemetry.js';
// prettier-ignore
import { factDoc, factsQuery, getCurrentFacts, isCurrent, memberFacts, parseFacts } from '../facts/facts-store.js';
import { factText, isForgotten } from '../domain/forgotten.js';
import { firestoreForgottenStore } from '../adapters/firestore/forgotten-store.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'memory-writer' });
export interface FactProposal {
  readonly subjectId: string;
  readonly attribute: FactAttribute;
  readonly value: string;
  readonly source: FactSource;
  /** Who it comes from; persona_canon is always refused. */
  readonly provenance: FactProvenance;
  /** The subject's relationship to the person, when the source stated one ("friend"). */
  readonly relationship?: string | null;
  /** Unique per proposed fact within the source, e.g. `${sessionId}:${n}`. */
  readonly sourceKey: string;
  readonly validFrom?: string | null;
  readonly confidence?: number;
  readonly sensitive?: boolean;
  readonly sourceEpisodeId?: string | null;
  readonly at?: Date;
}

type Refusal = 'disabled' | 'not_member' | 'invalid' | 'unreadable' | 'forgotten' | 'persona';
export type ProposeResult =
  | { ok: true; op: 'add' | 'update' | 'noop' | 'history'; fact: Fact; duplicate: boolean }
  | { ok: false; reason: Refusal };

const stored = ({ id: _id, ...rest }: Fact): Omit<Fact, 'id'> => rest;
const ms = (iso: string): number => Date.parse(iso);
const laterOf = (a: string, b: string | null): string => (b !== null && ms(b) > ms(a) ? b : a);
/** Writes only if every fact parses as stored (toFact), so a bad field never leaves half an UPDATE. */
function commit(
  db: Firestore,
  tx: Transaction,
  uid: string,
  facts: readonly Fact[],
  done: ProposeResult
): ProposeResult {
  if (facts.some((f) => toFact(f.id, stored(f)) === null)) return { ok: false, reason: 'invalid' };
  for (const f of facts) tx.set(factDoc(db, uid, f.id), stored(f));
  return done;
}
/** "person:aunt-mary" → "aunt mary", so forgetting a person refuses facts about them. */
const subjectName = (subjectId: string): string =>
  subjectId.replace(/^\w+:/, '').replace(/[-_]/g, ' ');
const startsAfter = (f: Fact, iso: string): boolean =>
  f.validFrom !== null && ms(f.validFrom) > ms(iso);
/**
 * A late arrival: a current fact already says a newer validFrom. The new fact is stored
 * as history, ended at the next validFrom on file (current or retired, not forgotten);
 * a retired fact whose window held its validFrom now ends there. Null when not late.
 */
function lateInsert(
  facts: readonly Fact[],
  current: readonly Fact[],
  fact: Fact,
  validFrom: string,
  now: string
): Fact[] | null {
  if (!current.some((f) => startsAfter(f, validFrom))) return null;
  const known = facts.filter((f) => f.forgottenAt === null);
  const next = known
    .filter((f) => startsAfter(f, validFrom))
    .sort((a, b) => ms(a.validFrom ?? '') - ms(b.validFrom ?? ''))[0];
  const history = { ...fact, validTo: next.validFrom, retiredAt: now, supersededBy: next.id };
  const trimmed = known
    .filter((f) => !isCurrent(f) && f.validTo !== null && ms(f.validTo) > ms(validFrom))
    .filter((f) => f.validFrom === null || ms(f.validFrom) < ms(validFrom))
    .map((f) => ({ ...f, validTo: validFrom, supersededBy: fact.id }));
  return [history, ...trimmed];
}
async function reconcile(
  db: Firestore,
  tx: Transaction,
  uid: string,
  p: FactProposal,
  value: string
): Promise<ProposeResult> {
  const id = createHash('sha256')
    .update(`${p.source}\u0000${p.sourceKey}`)
    .digest('hex')
    .slice(0, 20);
  const own = await tx.get(factDoc(db, uid, id));
  const peers = await tx.get(factsQuery(db, uid, p.subjectId, p.attribute));
  if (own.exists) {
    const fact = parseFacts(uid, [own])[0];
    return fact
      ? { ok: true, op: 'noop', fact, duplicate: true }
      : { ok: false, reason: 'unreadable' };
  }
  const facts = parseFacts(uid, peers.docs);
  const key = valueKey(value);
  const now = (p.at ?? new Date()).toISOString();
  const current = facts.filter(isCurrent);
  const same = current.find((f) => valueKey(f.value) === key);
  if (same) {
    const fact = { ...same, lastConfirmedAt: laterOf(now, same.lastConfirmedAt) };
    return commit(db, tx, uid, [fact], { ok: true, op: 'noop', fact, duplicate: false });
  }
  const validFrom = p.validFrom ?? null;
  const provenance = p.provenance === 'user_said' ? 'user_said' : 'inferred';
  // prettier-ignore
  const fact: Fact = {
    v: FACT_VERSION, id, subjectId: p.subjectId, attribute: p.attribute, value, validFrom,
    validTo: null, learnedAt: now, retiredAt: null, supersededBy: null,
    sourceEpisodeId: p.sourceEpisodeId ?? null, source: p.source, provenance,
    confidence: p.confidence ?? 0.8,
    sensitive: p.sensitive ?? false, forgottenAt: null, lastConfirmedAt: now,
  };
  if (isSingleValued(p.attribute) && validFrom !== null) {
    const late = lateInsert(facts, current, fact, validFrom, now);
    const history = { ok: true, op: 'history', duplicate: false } as const;
    if (late) return commit(db, tx, uid, late, { ...history, fact: late[0] });
  }
  const replaced = isSingleValued(p.attribute) ? current : [];
  const retired = replaced.map((old) => ({
    ...old,
    validTo: laterOf(validFrom ?? now, old.validFrom),
    retiredAt: now,
    supersededBy: id,
  }));
  const op = replaced.length > 0 ? 'update' : 'add';
  return commit(db, tx, uid, [...retired, fact], { ok: true, op, fact, duplicate: false });
}

/** Ferni or a teammate with no relationship to the person stated, here or on file. */
async function personaSubject(db: Firestore, uid: string, p: FactProposal, value: string) {
  const name = subjectName(p.subjectId);
  const stated = p.relationship ?? (p.attribute === 'relation' ? value : null);
  if (!isPersonaSubject(name, stated)) return false;
  if (stated) return true; // a stated relation that is Ferni's role ("assistant")
  const [onFile] = await getCurrentFacts(db, uid, p.subjectId, 'relation', { MEMORY_FACTS: 'on' });
  return isPersonaSubject(name, onFile?.value);
}

/** ADD, UPDATE or NOOP, whichever the stored facts call for. */
export async function proposeFact(
  db: Firestore,
  uid: string,
  p: FactProposal,
  env: Env = process.env
): Promise<ProposeResult> {
  if (!memoryFactsEnabled(env)) return { ok: false, reason: 'disabled' };
  if (!memberFacts(uid)) return { ok: false, reason: 'not_member' };
  const value = normalizeValue(p.attribute, p.value);
  if (
    !value ||
    !isFactId(p.sourceKey) ||
    !(p.at === undefined || (p.at instanceof Date && !Number.isNaN(p.at.getTime())))
  ) {
    return { ok: false, reason: 'invalid' };
  }
  if (p.provenance === 'persona_canon' || (await personaSubject(db, uid, p, value))) {
    recordPersonaFactRefused(p.source);
    log.info({ uid, source: p.source, outcome: 'persona' }, 'Proposed');
    return { ok: false, reason: 'persona' };
  }
  // Fail closed: unreadable forgotten topics write nothing, as the readers return nothing.
  const { topics } = await firestoreForgottenStore(db).readForgotten(uid);
  if (!topics) return { ok: false, reason: 'unreadable' };
  if (
    isForgotten(
      factText({ entityName: subjectName(p.subjectId), attribute: p.attribute, value }),
      topics
    )
  ) {
    log.info({ uid, source: p.source, outcome: 'forgotten' }, 'Proposed');
    return { ok: false, reason: 'forgotten' };
  }
  const result = await db.runTransaction((tx) => reconcile(db, tx, uid, p, value));
  log.info({ uid, source: p.source, outcome: result.ok ? result.op : result.reason }, 'Proposed');
  return result;
}
