/**
 * The activity ledger's strict parser: a stored document as a record, or null for
 * any shape this build didn't write (an unknown field or version, free text where
 * a closed enum belongs, words over the limit). The store quarantines those.
 *
 * @module services/activity/activity-parse
 */

import {
  ACTIVITY_KINDS,
  ACTIVITY_REASONS,
  ACTIVITY_STATES,
  LEDGER_VERSION,
  LIMITS,
  LINK_KEYS,
  OUTCOME_STATUSES,
  TOLD_CHANNELS,
  type Activity,
  type Subject,
} from './activity.js';

export type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T =>
  typeof x === 'string' && (list as readonly string[]).includes(x);
const text = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const ID = /^[\w:.@+-]{1,200}$/;
const isId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
const isTime = (x: unknown): x is string =>
  typeof x === 'string' && !Number.isNaN(Date.parse(x)) && x.includes('T');
/** An optional field: absent, or valid. */
const maybe = (o: Obj, k: string, ok: (x: unknown) => boolean): boolean =>
  o[k] === undefined || ok(o[k]);
const listOf = (x: unknown, max: number, ok: (v: unknown) => boolean): boolean =>
  Array.isArray(x) && x.length <= max && x.every(ok);
/** Only the listed keys, none other: an unknown field is an unknown shape. */
const only = (o: Obj, keys: readonly string[]): boolean =>
  Object.keys(o).every((k) => keys.includes(k));

const subjectOk = (x: unknown): boolean =>
  isObj(x) &&
  only(x, ['contactId', 'name', 'relationship']) &&
  text(x.name, LIMITS.name) &&
  maybe(x, 'contactId', isId) &&
  maybe(x, 'relationship', (r) => text(r, LIMITS.name));
const askedOk = (x: unknown): boolean =>
  isObj(x) &&
  only(x, ['at', 'sessionId', 'words']) &&
  isTime(x.at) &&
  isId(x.sessionId) &&
  maybe(x, 'words', (w) => text(w, LIMITS.words));
const outcomeOk = (x: unknown): boolean =>
  isObj(x) &&
  only(x, ['status', 'summary', 'theySaid', 'actionItems']) &&
  oneOf(OUTCOME_STATUSES, x.status) &&
  maybe(x, 'summary', (s) => text(s, LIMITS.summary)) &&
  maybe(x, 'theySaid', (s) => text(s, LIMITS.theySaid)) &&
  listOf(x.actionItems, LIMITS.actionItems, (a) => text(a, LIMITS.actionItem));
const toldOk = (x: unknown): boolean =>
  isObj(x) &&
  only(x, ['at', 'sessionId', 'channel']) &&
  isTime(x.at) &&
  isId(x.sessionId) &&
  oneOf(TOLD_CHANNELS, x.channel);
const linksOk = (x: unknown): boolean =>
  isObj(x) && only(x, LINK_KEYS) && Object.values(x).every(isId);

const norm = (name: string): string =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, LIMITS.name);
/** The key a reader looks a person up by: their contact id, else their name. */
export function subjectKey(s: { contactId?: string; name?: string }): string | undefined {
  if (s.contactId) return `contact:${s.contactId}`;
  const n = norm(s.name ?? '');
  return n ? `name:${n}` : undefined;
}
export const subjectKeys = (s: Subject): string[] =>
  [s.contactId ? `contact:${s.contactId}` : '', subjectKey({ name: s.name }) ?? ''].filter(Boolean);

export const FIELDS = (
  'v kind subject subjectKeys asked state reason scheduledFor outcome told ' +
  'followUps links source revision appliedKeys createdAt updatedAt'
).split(' ');

const contentOk = (data: Obj): boolean =>
  oneOf(ACTIVITY_KINDS, data.kind) &&
  oneOf(ACTIVITY_STATES, data.state) &&
  subjectOk(data.subject) &&
  JSON.stringify(data.subjectKeys) === JSON.stringify(subjectKeys(data.subject as Subject)) &&
  askedOk(data.asked) &&
  maybe(data, 'reason', (r) => oneOf(ACTIVITY_REASONS, r)) &&
  maybe(data, 'scheduledFor', isTime) &&
  maybe(data, 'outcome', outcomeOk) &&
  listOf(data.told, LIMITS.told, toldOk) &&
  listOf(data.followUps, LIMITS.followUps, isId) &&
  linksOk(data.links);

const bookkeepingOk = (data: Obj): boolean =>
  isId(data.source) &&
  Number.isInteger(data.revision) &&
  (data.revision as number) >= 1 &&
  listOf(data.appliedKeys, LIMITS.keys, isId) &&
  isTime(data.createdAt) &&
  isTime(data.updatedAt);

type Stored = Omit<Activity, 'id'>;
const isStored = (data: Obj): data is Obj & Stored => contentOk(data) && bookkeepingOk(data);

/** A stored document as an activity record, or null for any shape this build didn't write. */
export function toActivity(id: string, data: unknown): Activity | null {
  if (!isId(id) || !isObj(data) || !only(data, FIELDS) || data.v !== LEDGER_VERSION) return null;
  return isStored(data) ? { ...data, id } : null;
}
