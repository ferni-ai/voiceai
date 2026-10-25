/**
 * The "I'll remember" card at the end of a call: the few things Ferni kept from
 * THIS call, as the caller can see and change them.
 *
 * Built on the facts recall reads (memory-control.ts listRemembered), so every
 * item's id works with PATCH/DELETE /api/memories/remembered/:id ("Not quite" and
 * "Forget") and a forgotten fact is gone from the card and from the next call.
 *
 * Pure: the route supplies the caller's remembered facts, the call's start and
 * the topic filter.
 *
 * - learned at or after the call started (a fact seen again refreshes its date, so
 *   "learned" means "touched by this call");
 * - not an earlier fact (replaced by a newer one), and not one the caller wrote in
 *   the app (fromYou): the card is about the call;
 * - light topics only, because the card sits on a phone screen others may see;
 * - the same thing said twice shows once; newest first; at most MAX_ITEMS. With
 *   nothing that qualifies the list is empty and the app shows nothing.
 *
 * @module memory/recall/call-remembered
 */
import type { RememberedFact } from './memory-control.js';

export const MAX_ITEMS = 3;
/** A call cannot have started longer ago than this; older `since` is clamped. */
export const MAX_CALL_AGE_MS = 6 * 3_600_000;
/** Clock slack between the phone and the server. */
export const CLOCK_SKEW_MS = 5 * 60_000;

export interface CallRememberedItem {
  id: string;
  /** Who or what it is about; "you" for the caller. */
  subject: string;
  /** What is remembered, e.g. "dog name: Biscuit". */
  detail: string;
  learnedAt: string;
}

/** The app's `since`: epoch milliseconds, or an ISO time. Undefined when it isn't a time. */
export function parseSince(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  // Epoch milliseconds (13 digits, so seconds are refused, not read as 1970) or a full ISO time
  // (Date.parse alone reads "12" as a date).
  const iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
  const ms = /^\d{13}$/.test(raw) ? Number(raw) : iso.test(raw) ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

export function rememberedFromCall(
  facts: readonly RememberedFact[],
  since: number,
  now: Date,
  isLight: (text: string) => boolean
): CallRememberedItem[] {
  const from = Math.max(since, now.getTime() - MAX_CALL_AGE_MS);
  const until = now.getTime() + CLOCK_SKEW_MS;
  const seen = new Set<string>();
  const items: Array<CallRememberedItem & { at: number }> = [];
  for (const f of facts) {
    const at = f.learnedAt ? Date.parse(f.learnedAt) : NaN;
    if (!f.learnedAt || !(at >= from && at <= until)) continue;
    if (f.earlier || f.fromYou || !isLight(`${f.subject} ${f.detail}`)) continue;
    items.push({ id: f.id, subject: f.subject, detail: f.detail, learnedAt: f.learnedAt, at });
  }
  // Newest first, so the copy of a repeated fact that shows is the newest one.
  return items
    .sort((a, b) => b.at - a.at)
    .filter((item) => {
      const key = `${item.subject}|${item.detail}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map(({ at: _at, ...item }) => item);
}
