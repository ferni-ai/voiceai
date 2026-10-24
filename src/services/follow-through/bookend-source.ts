/**
 * Dates that matter as a follow-up source for Bookends (ENGAGEMENT-SPEC §2.3,
 * PR B1): a one-time medical visit or event the caller gave a time for
 * ("biopsy Tuesday at 3pm") becomes a follow-up that knows when the thing
 * happens (eventAt, to the minute), what to ask after it, and how heavy it is.
 *
 * Only what a bookend can be built around comes through: once, medical or
 * event, a time of day, a day nobody needs to confirm, and still ahead. A
 * birthday recurs and an "on the 14th" has no time, so neither is a source.
 *
 * dueAt stays null. When to ask is the bookend plan's (B2) and the after-ask's
 * (B6): a dated follow-up would be texted by follow-up-texts.ts with reminder
 * words ("You asked me to remind you: biopsy") the moment it fell due.
 *
 * Pure: the reader in stores/follow-through-sources.ts hands in the facts, the
 * zone, the clock and the heavy-topic test.
 *
 * @module services/follow-through/bookend-source
 */

import { zonedWallTimeToUtc } from '../../utils/time-zone.js';
import type { Salience } from './follow-up.js';
import type { SourceItem } from './ports.js';

/** The fields of a stored date fact (world-model/dates/store.ts DateFact) this reads. */
export interface BookendDateFact {
  readonly id: string;
  readonly subject: string;
  readonly value: string;
  readonly validTo: string | null;
  readonly origin?: string;
  readonly kind?: string;
  readonly recurrence?: string;
  readonly eventDate?: string;
  readonly at?: string;
  readonly needsConfirmation?: boolean;
}

export interface BookendSourceOptions {
  /** The caller's IANA zone: the time they said is a time where they are. */
  readonly zone: string;
  readonly now: Date;
  /** True when the words are heavy (health, grief, money, legal): !isLightTopic. */
  readonly heavy: (text: string) => boolean;
}

const BOOKEND_KINDS: ReadonlySet<string> = new Set(['medical', 'event']);
/** How much a friend would remember to ask: a medical visit more than an event. */
const WEIGHT: Record<string, number> = { medical: 0.9, event: 0.7 };

/** The instant `day` at `at` happens in `zone`, or null when either is malformed. */
function eventInstant(day: string, at: string, zone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(at);
  if (!d || !t) return null;
  const [year, month, dayOfMonth, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  // Out of range ("24:60", "2026-13-40") would roll over to another instant.
  const real = new Date(Date.UTC(year, month - 1, dayOfMonth)).toISOString().slice(0, 10) === day;
  if (!real || hour > 23 || minute > 59) return null;
  return zonedWallTimeToUtc({ year, month, day: dayOfMonth, hour, minute }, zone);
}

/** When the fact's bookend happens, passed or not; null when it can't have one. */
function bookendInstant(f: BookendDateFact, zone: string): Date | null {
  if (f.validTo !== null || f.origin !== 'dates' || f.recurrence !== 'once') return null;
  if (!BOOKEND_KINDS.has(f.kind ?? '') || f.needsConfirmation || !f.eventDate || !f.at) return null;
  return eventInstant(f.eventDate, f.at, zone);
}

function itemOf(f: BookendDateFact, eventAt: Date | null, opts: BookendSourceOptions): SourceItem {
  const kind = f.kind ?? '';
  const text = f.subject === 'self' ? f.value : `${f.subject}'s ${f.value}`;
  const heavy = opts.heavy(text);
  const salience: Salience = {
    weight: WEIGHT[kind] ?? WEIGHT.event,
    heavy,
    // Health is sensitive even when the words read light ("checkup").
    sensitive: heavy || kind === 'medical',
    by: 'rule',
    v: 1,
  };
  return {
    kind: 'date' as const,
    text,
    dueAt: null,
    repeat: null,
    source: { store: 'world_facts', ref: f.id },
    eventAt: eventAt?.toISOString() ?? null,
    eventPrecision: eventAt ? ('time' as const) : ('none' as const),
    askType: 'how-did-it-go' as const,
    salience,
  };
}

/** One follow-up source item per date fact a bookend can be built around. */
export function bookendSourceItems(
  facts: readonly BookendDateFact[],
  opts: BookendSourceOptions
): SourceItem[] {
  return facts.flatMap((f) => {
    const eventAt = bookendInstant(f, opts.zone);
    if (!eventAt || eventAt.getTime() <= opts.now.getTime()) return [];
    return [itemOf(f, eventAt, opts)];
  });
}

/**
 * What each bookend already made from a fact (`made`: fact ids) should say now, so a
 * time said differently on a later call moves it: the fact's time now, or eventAt null
 * when it no longer has one to trust (dropped, or to be confirmed). A fact that is
 * closed, forgotten or gone gives `gone`, but only when `facts` is all of them.
 */
export function bookendUpdates(
  facts: readonly BookendDateFact[],
  made: readonly string[],
  opts: BookendSourceOptions & { readonly complete: boolean }
): SourceItem[] {
  return made.flatMap((ref) => {
    const f = facts.find((x) => x.id === ref);
    if (f) return [itemOf(f, bookendInstant(f, opts.zone), opts)];
    if (!opts.complete) return [];
    const source = { store: 'world_facts', ref };
    return [{ kind: 'date' as const, text: '', dueAt: null, repeat: null, source, gone: true as const }]; // prettier-ignore
  });
}
