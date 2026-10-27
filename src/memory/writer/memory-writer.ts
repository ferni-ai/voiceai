/**
 * The memory writer: the only writer of the facts store (memory call sheet plan,
 * section 2). It reconciles a proposed fact against the stored ones in one
 * transaction, by code (exact subject and attribute; values trimmed, case-folded,
 * phones as E.164):
 *
 *   ADD     nothing current says this.
 *   UPDATE  a single-valued attribute has a different current value: the old fact
 *           gets validTo, retiredAt and supersededBy, and is kept. Multi-valued
 *           attributes (pets, goals) add instead.
 *   NOOP    already known: only lastConfirmedAt moves.
 *
 * Idempotent per (source, sourceKey): the id derives from the pair. No-op while
 * MEMORY_FACTS is off; member facts only; logs ids and ops, never a value.
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
  | {
      readonly ok: true;
      readonly op: 'add' | 'update' | 'noop';
      readonly fact: Fact;
      readonly duplicate: boolean;
    }
  | { readonly ok: false; readonly reason: Refusal };

const stored = ({ id: _id, ...rest }: Fact): Omit<Fact, 'id'> => rest;
const ms = (iso: string): number => Date.parse(iso);
const laterOf = (a: string, b: string | null): string => (b !== null && ms(b) > ms(a) ? b : a);

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
  const ref = factDoc(db, uid, id);
  const own = await tx.get(ref);
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
    tx.set(factDoc(db, uid, same.id), stored(fact));
    return { ok: true, op: 'noop', fact, duplicate: false };
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
  for (const old of replaced) {
    const validTo = laterOf(validFrom ?? now, old.validFrom);
    tx.set(factDoc(db, uid, old.id), stored({ ...old, validTo, retiredAt: now, supersededBy: id }));
  }
  tx.set(ref, stored(fact));
  return { ok: true, op: replaced.length > 0 ? 'update' : 'add', fact, duplicate: false };
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
    !((p.confidence ?? 0) >= 0 && (p.confidence ?? 0) <= 1) ||
    !isFactId(p.subjectId) ||
    !isFactId(p.sourceKey) ||
    !(p.sourceEpisodeId == null || isFactId(p.sourceEpisodeId))
  ) {
    return { ok: false, reason: 'invalid' };
  }
  const result = await db.runTransaction((tx) => reconcile(db, tx, uid, p, value));
  log.info({ uid, source: p.source, outcome: result.ok ? result.op : result.reason }, 'Proposed');
  return result;
}
