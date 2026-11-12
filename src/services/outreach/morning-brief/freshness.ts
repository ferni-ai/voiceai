/**
 * The freshness gate: at send time, a todo leaves Alex's morning brief when the
 * person has already dealt with it. Before this the brief kept texting todos
 * people had already given updates on: it read the raw stores and nothing else.
 *
 * An item is dropped when:
 * - (a) its source is no longer open, is gone, or changed since it was read
 *   (source-closed, source-changed);
 * - (b) its follow-up is closed, or was raised or answered on any channel in
 *   the last 48 h, the follow-up ask spacing ASK_SPACING_MS (ledger-closed,
 *   ledger-recent). Tasks are not imported into follow-ups, so (b) never
 *   applies to them;
 * - (c) the person talked about it since it was last listed, whatever they
 *   said (mentioned). That drops one listing, never the item: the mention is
 *   spent once the brief goes, so "still haven't done it" lists it again the
 *   morning after.
 *
 * Drop-only: it never adds an item. A safety item (isSafetyItem, by type) is
 * never dropped. A read that fails or is missing means that rule doesn't
 * apply, so the item goes as it would have: unknown freshness never starves
 * the brief. Logs counts only, never an item's words.
 *
 * @module services/outreach/morning-brief/freshness
 */

import { ASK_SPACING_MS, isClosed, type FollowUp } from '../../follow-through/index.js';
import { isSafetyItem } from '../../safety/index.js';
import type { ItemMention } from '../../stores/item-mentions.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'MorningBriefFreshness' });

/** A todo's store and its id there, as a follow-up names its source. */
type SourceRef = FollowUp['source'];

/** Where one brief item came from: its store, its id there, its version when read and its type. */
export interface BriefRef extends SourceRef {
  readonly store: 'reminders' | 'tasks' | 'commitments';
  /** A reminder's due time, a task's updatedAt: changes when the item is edited. */
  readonly version?: string;
  /** Each type field the store set on it (kind, type, category); any safety one: never dropped. */
  readonly kinds?: readonly string[];
}

const BRIEF_LISTS = ['reminders', 'tasks', 'commitments'] as const;
type List = (typeof BRIEF_LISTS)[number];

/** Each list's refs, in the same order as its texts (index i is the text at i). */
export type DayRefs = Record<List, ReadonlyArray<BriefRef | undefined>>;

export type DropReason =
  'source-closed' | 'source-changed' | 'ledger-closed' | 'ledger-recent' | 'mentioned';

export interface FreshnessReads {
  /** Each listed item still open: its version ('' if none) by keyOf; null if a store is unread. */
  current: (
    userId: string,
    refs: readonly BriefRef[]
  ) => Promise<ReadonlyMap<string, string> | null>;
  /** Every follow-up of theirs changed up to `now`, closed ones included; null when unreadable. */
  ledger: (userId: string, now: Date) => Promise<readonly FollowUp[] | null>;
  /** Their mentions since `since`; null when unreadable. */
  mentions: (userId: string, since: Date) => Promise<readonly ItemMention[] | null>;
  /** Spends the mentions behind items the brief left out. */
  consume: (userId: string, sources: readonly SourceRef[]) => Promise<void>;
}

export const keyOf = (s: SourceRef): string => `${s.store}:${s.ref}`;

interface Facts {
  current: ReadonlyMap<string, string> | null;
  ledger: readonly FollowUp[] | null;
  mentions: ReadonlyMap<string, ItemMention> | null;
}

const sameSource = (f: FollowUp, r: SourceRef): boolean =>
  [f.source, ...(f.sources ?? [])].some((s) => s.store === r.store && s.ref === r.ref);

/** When it was last raised or answered, in ms, or 0. */
function lastTouched(f: FollowUp): number {
  const times = [...f.surfaced.map((s) => s.at), ...(f.asks ?? []).map((a) => a.answeredAt)];
  return Math.max(0, ...times.map((t) => (t ? Date.parse(t) : 0)).filter(Number.isFinite));
}

function staleBy(r: BriefRef, facts: Facts, now: Date): DropReason | null {
  if (r.kinds?.some((k) => isSafetyItem(k))) return null;
  const key = keyOf(r);
  if (facts.current) {
    const version = facts.current.get(key);
    if (version === undefined) return 'source-closed';
    if (version !== (r.version ?? '')) return 'source-changed';
  }
  const row = facts.ledger?.find((f) => sameSource(f, r));
  if (row && isClosed(row)) return 'ledger-closed';
  if (row && now.getTime() - lastTouched(row) < ASK_SPACING_MS) return 'ledger-recent';
  const mention = facts.mentions?.get(key);
  if (mention && (mention.version ?? '') === (r.version ?? '')) return 'mentioned';
  return null;
}

/** Null on failure, logged by which read (no item data): that rule just doesn't apply. */
async function orUnknown<T>(what: string, read: () => Promise<T | null>): Promise<T | null> {
  return read().catch((error: unknown) => {
    log.warn({ what, error: String(error) }, 'MORNING_BRIEF_FRESHNESS_UNKNOWN');
    return null;
  });
}

export interface FreshDay<T> {
  readonly day: T;
  readonly dropped: Partial<Record<DropReason, number>>;
  /** Items left out for a mention: consume these once the brief has gone. */
  readonly spent: readonly SourceRef[];
}

/** `day` without the items the person already dealt with. */
export async function freshDay<T extends { refs?: DayRefs } & Record<List, readonly string[]>>(
  userId: string,
  day: T,
  reads: FreshnessReads,
  now: Date
): Promise<FreshDay<T>> {
  const refs = day.refs;
  if (!refs) return { day, dropped: {}, spent: [] };
  const listed = BRIEF_LISTS.flatMap((list) => refs[list].filter((r): r is BriefRef => !!r));
  if (listed.length === 0) return { day, dropped: {}, spent: [] };
  const since = new Date(now.getTime() - ASK_SPACING_MS);
  const [current, ledger, mentions] = await Promise.all([
    orUnknown('current', () => reads.current(userId, listed)),
    orUnknown('ledger', () => reads.ledger(userId, now)),
    orUnknown('mentions', () => reads.mentions(userId, since)),
  ]);
  const facts: Facts = {
    current,
    ledger,
    mentions: mentions && new Map(mentions.map((m) => [keyOf(m), m])),
  };
  const dropped: Partial<Record<DropReason, number>> = {};
  const spent: SourceRef[] = [];
  const keep = (list: List) =>
    day[list].flatMap((text, i) => {
      const ref = refs[list][i];
      const why = ref ? staleBy(ref, facts, now) : null;
      if (!why) return [{ text, ref }];
      dropped[why] = (dropped[why] ?? 0) + 1;
      if (why === 'mentioned' && ref) spent.push({ store: ref.store, ref: ref.ref });
      return [];
    });
  const out = { ...day, refs: { ...refs } };
  for (const list of BRIEF_LISTS) {
    const kept = keep(list);
    Object.assign(out, { [list]: kept.map((k) => k.text) });
    out.refs[list] = kept.map((k) => k.ref);
  }
  return { day: out, dropped, spent };
}
