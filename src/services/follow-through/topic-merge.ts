/**
 * One thread, one follow-up (follow-up brain design §2.2): "call mom" from
 * commitments and "mom call" from a summary join one row instead of becoming
 * two asks. A topic key is the sorted content words; two keys are one thread
 * at word Jaccard ≥ 0.6. Only a live row from the last 21 days takes a merge.
 * Pure.
 *
 * @module services/follow-through/topic-merge
 */

import { isClosed, type FollowUp } from './follow-up.js';
import type { NewFollowUp } from './ports.js';

export const MERGE_WINDOW_DAYS = 21;
export const SAME_TOPIC_JACCARD = 0.6;
const DAY_MS = 86_400_000;

const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but to of for in on at by with from about into over after before ' +
    'my your his her their our its me him them us i you he she we they it is was be ' +
    'been are were do did does how what when this that these those up out so just'
  ).split(' ')
);

/** The topic key of free text: its content words, lower-case, unique, sorted. */
export function topicKeyOf(text: string): string {
  const words = text.toLowerCase().match(/[a-z][a-z']+/g) ?? [];
  const content = words.map((w) => w.replace(/'s$/, '')).filter((w) => !STOPWORDS.has(w));
  return [...new Set(content)].sort().join(' ');
}

/** True when two topic keys share enough words to be one thread. */
export function sameTopic(a: string, b: string): boolean {
  const x = new Set(a.split(' ').filter(Boolean));
  const y = new Set(b.split(' ').filter(Boolean));
  if (x.size === 0 || y.size === 0) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared) >= SAME_TOPIC_JACCARD;
}

const sourcesOf = (f: FollowUp): ReadonlyArray<FollowUp['source']> => f.sources ?? [f.source];
const sameSource = (a: FollowUp['source'], b: FollowUp['source']): boolean =>
  a.store === b.store && a.ref === b.ref;

export type MergeTarget =
  /** A follow-up this source already joined: return it as it is. */
  | { readonly kind: 'known'; readonly row: FollowUp }
  /** A live follow-up on the same topic: join it. */
  | { readonly kind: 'merge'; readonly row: FollowUp };

/** Where `incoming` belongs among `rows` (one person's recent follow-ups), or null for a new one. */
export function mergeTarget(
  rows: readonly FollowUp[],
  incoming: NewFollowUp,
  now: Date
): MergeTarget | null {
  const known = rows.find((r) => sourcesOf(r).some((s) => sameSource(s, incoming.source)));
  if (known) return { kind: 'known', row: known };
  if (!incoming.topicKey) return null;
  const topic = incoming.topicKey;
  const since = now.getTime() - MERGE_WINDOW_DAYS * DAY_MS;
  const row = rows.find(
    (r) =>
      !isClosed(r) &&
      r.topicKey !== undefined &&
      Date.parse(r.createdAt) >= since &&
      sameTopic(r.topicKey, topic)
  );
  return row ? { kind: 'merge', row } : null;
}

/** `row` with `incoming`'s source added, keeping the higher salience. */
export function mergeInto(row: FollowUp, incoming: NewFollowUp, now: Date): FollowUp {
  const keepSalience =
    incoming.salience && (!row.salience || incoming.salience.weight > row.salience.weight)
      ? incoming.salience
      : row.salience;
  return {
    ...row,
    sources: [...sourcesOf(row), incoming.source],
    ...(keepSalience ? { salience: keepSalience } : {}),
    updatedAt: now.toISOString(),
  };
}
