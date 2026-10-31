/**
 * The activity ledger's change step: the record after a create or update, and the
 * one event it appends, or why the change is refused. Pure: the store reads the
 * current record, checks the revision and writes what this returns.
 *
 * @module services/activity/activity-change
 */

import {
  canMove,
  LEDGER_VERSION,
  LIMITS,
  type Activity,
  type ActivityChange,
  type ActivityEvent,
  type Outcome,
} from './activity.js';
import { FIELDS, subjectKeys, toActivity, type Obj } from './activity-parse.js';

export type Refusal = 'invalid' | 'exists' | 'not_found' | 'illegal_transition';
export interface Applied {
  readonly next: Activity;
  readonly event: ActivityEvent;
}

const clip = (s: string | undefined, max: number): string | undefined =>
  s === undefined ? undefined : s.trim().slice(0, max) || undefined;
const defined = <T extends Obj>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const clipOutcome = (o: Outcome): Outcome =>
  defined({
    ...o,
    summary: clip(o.summary, LIMITS.summary),
    theySaid: clip(o.theySaid, LIMITS.theySaid),
    actionItems: (o.actionItems ?? []).map((a) => a.trim().slice(0, LIMITS.actionItem)),
  });
const keysAfter = (keys: readonly string[], key?: string): string[] =>
  key ? [...keys, key].slice(-LIMITS.keys) : [...keys];
const BOOKKEEPING = ['revision', 'updatedAt', 'appliedKeys', 'source', 'subjectKeys'];
const changed = (a: object, b: object): string[] => {
  const [was, now] = [new Map(Object.entries(a)), new Map(Object.entries(b))];
  return FIELDS.filter(
    (f) => !BOOKKEEPING.includes(f) && JSON.stringify(was.get(f)) !== JSON.stringify(now.get(f))
  );
};

function created(
  current: Activity | null,
  change: Extract<ActivityChange, { op: 'create' }>,
  at: string
): Obj | Refusal {
  if (current) return 'exists';
  const r = change.record;
  return defined({
    v: LEDGER_VERSION,
    ...{ kind: r.kind, subject: defined({ ...r.subject }), state: r.state ?? 'asked' },
    subjectKeys: subjectKeys(r.subject),
    asked: defined({ ...r.asked, words: clip(r.asked.words, LIMITS.words) }),
    ...{ reason: r.reason, scheduledFor: r.scheduledFor },
    ...{ told: [], followUps: [], links: defined({ ...r.links }), source: change.source },
    revision: 1,
    ...{ appliedKeys: keysAfter([], change.key), createdAt: at, updatedAt: at },
  });
}

function updated(
  current: Activity | null,
  change: Extract<ActivityChange, { op: 'update' }>,
  at: string
): Obj | Refusal {
  if (!current) return 'not_found';
  const p = change.patch;
  if (p.state !== undefined && !canMove(current.state, p.state)) return 'illegal_transition';
  // A new state drops the old reason: "scheduled because of call hours" isn't why it's done
  const moved = p.state !== undefined && p.state !== current.state;
  const { id: _id, reason: kept, ...base } = current;
  const subject = p.subject ? defined({ ...p.subject }) : current.subject;
  return defined({
    ...base,
    reason: p.reason ?? (moved ? undefined : kept),
    ...defined({ state: p.state, scheduledFor: p.scheduledFor }),
    ...{ subject, subjectKeys: subjectKeys(subject) },
    ...(p.outcome ? { outcome: clipOutcome(p.outcome) } : {}),
    links: defined({ ...current.links, ...p.links }),
    told: [...current.told, ...(p.told ?? [])].slice(-LIMITS.told),
    followUps: [...new Set([...current.followUps, ...(p.followUps ?? [])])],
    ...{ source: change.source, revision: current.revision + 1, updatedAt: at },
    appliedKeys: keysAfter(current.appliedKeys, change.key),
  });
}

/**
 * The record after `change`, and its event, or why it is refused. Pure: the store
 * reads `current`, checks the revision and writes the result.
 */
export function applyChange(
  current: Activity | null,
  change: ActivityChange,
  id: string,
  at: string
): Applied | Refusal {
  const next = change.op === 'create' ? created(current, change, at) : updated(current, change, at);
  if (typeof next === 'string') return next;
  const parsed = toActivity(id, next);
  if (!parsed) return 'invalid';
  const reason = change.op === 'create' ? change.record.reason : change.patch.reason;
  const event = defined({
    ...{
      activityId: id,
      seq: parsed.revision,
      at,
      op: change.op,
      from: current?.state ?? null,
      to: parsed.state,
    },
    ...{ fields: changed(current ?? {}, next), source: change.source, reason, key: change.key },
  }) as ActivityEvent;
  return { next: parsed, event };
}
