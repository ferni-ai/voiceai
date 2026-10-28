/**
 * The memory writer: the only writer of the facts store. It reconciles a proposed fact
 * against the stored ones in one transaction, by code (exact subject and attribute;
 * values trimmed, case-folded, phones as E.164):
 *   ADD     nothing current says this.
 *   UPDATE  a single-valued attribute has a new value: the old fact gets validTo,
 *           retiredAt and supersededBy and is kept. Multi-valued ones (pets) add.
 *   NOOP    already known: only lastConfirmedAt moves.
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
  type FactSource,
} from '../facts/fact.js';
import { factDoc, factsQuery, isCurrent, memberFacts, parseFacts } from '../facts/facts-store.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'memory-writer' });
export interface FactProposal {
  readonly subjectId: string;
  readonly attribute: FactAttribute;
  readonly value: string;
  readonly source: FactSource;
  /** Unique per proposed fact within the source, e.g. `${sessionId}:${n}`. */
  readonly sourceKey: string;
  readonly validFrom?: string | null;
  readonly confidence?: number;
  readonly sensitive?: boolean;
  readonly sourceEpisodeId?: string | null;
  readonly at?: Date;
}

type Refusal = 'disabled' | 'not_member' | 'invalid' | 'unreadable';
export type ProposeResult =
  | { ok: true; op: 'add' | 'update' | 'noop'; fact: Fact; duplicate: boolean }
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
  // prettier-ignore
  const fact: Fact = {
    v: FACT_VERSION, id, subjectId: p.subjectId, attribute: p.attribute, value, validFrom,
    validTo: null, learnedAt: now, retiredAt: null, supersededBy: null,
    sourceEpisodeId: p.sourceEpisodeId ?? null, source: p.source, confidence: p.confidence ?? 0.8,
    sensitive: p.sensitive ?? false, forgottenAt: null, lastConfirmedAt: now,
  };
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
  const result = await db.runTransaction((tx) => reconcile(db, tx, uid, p, value));
  log.info({ uid, source: p.source, outcome: result.ok ? result.op : result.reason }, 'Proposed');
  return result;
}
