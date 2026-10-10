/**
 * Common ground: what Ferni and a caller both know they both know.
 *
 * The life ledger (life-ledger.ts) keeps what Ferni said about his own life,
 * and theory of mind (#684) keeps what the caller has told Ferni. Neither
 * keeps the rest of what is now shared between the two of them:
 * - what Ferni has already told this caller beyond his life story: his
 *   opinions and his advice. A friend who gave you advice last week says
 *   "like I said, the two-minute thing", not the same advice as if new.
 * - shorthand the two of them made: a phrase both used for something ("the
 *   spreadsheet goblin" for their boss), and what it means, so Ferni can use
 *   it and understands it when they do. Inside jokes are kept by #592; this
 *   is the shorthand that isn't a joke.
 *
 * Written after the call (common-ground-after-call.ts), read into the first
 * recall note of the next one. COMMON_GROUND=on turns it on.
 *
 * @module agents/personas/common-ground
 */

import { groundedFacts } from './life-ledger.js';

export function commonGroundEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMMON_GROUND === 'on';
}

export type ToldKind = 'opinion' | 'advice';

export interface ToldItem {
  kind: ToldKind;
  /** Third person, short: "Ferni thinks a walk beats a nap after lunch". */
  text: string;
  /** ISO times of the first and latest call it was said on. */
  firstAt: string;
  lastAt: string;
}

export interface SharedReference {
  /** The words both of them used, as said: "the spreadsheet goblin". */
  phrase: string;
  /** What it refers to: "their boss, who lives in spreadsheets". */
  meaning: string;
  firstAt: string;
  lastAt: string;
}

export interface CommonGround {
  told: ToldItem[];
  references: SharedReference[];
}

export const EMPTY_GROUND: CommonGround = { told: [], references: [] };

export interface CallTurn {
  role: string;
  content: string;
}

/** What one call's reading proposes, before the guards. */
export interface GroundReading {
  told: Array<{ kind: string; text: string }>;
  references: Array<{ phrase: string; meaning: string }>;
}

const MAX_TOLD = 30;
const MAX_REFERENCES = 15;
const MAX_MEANING_WORDS = 15;

const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** True when the phrase appears in the text as whole words. */
function said(text: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length > 0 && ` ${norm(text)} `.includes(` ${p} `);
}

/**
 * Keep only what the call shows. Told items must be grounded in Ferni's own
 * lines (most of their words came from him), the same rule as the ledger. A
 * reference counts only when BOTH of them said the phrase: one person's
 * coinage isn't shared yet.
 */
export function guardReading(reading: GroundReading, turns: readonly CallTurn[]): GroundReading {
  const ferni = turns.filter((t) => t.role === 'assistant').map((t) => t.content);
  const caller = turns.filter((t) => t.role === 'user').map((t) => t.content);
  const toldTexts = new Set(groundedFacts(reading.told.map((t) => t.text), ferni));
  const told = reading.told.filter(
    (t) => (t.kind === 'opinion' || t.kind === 'advice') && toldTexts.has(t.text.trim())
  );
  const references = reading.references.filter((r) => {
    const words = r.phrase.trim().split(/\s+/).length;
    return (
      words >= 2 &&
      words <= 6 &&
      r.meaning.trim().split(/\s+/).length <= MAX_MEANING_WORDS &&
      ferni.some((l) => said(l, r.phrase)) &&
      caller.some((l) => said(l, r.phrase))
    );
  });
  return { told, references };
}

/** Fold one call's guarded reading in: the same item again only moves its date. */
export function mergeGround(ground: CommonGround, reading: GroundReading, at: string): CommonGround {
  const told = ground.told.map((t) => ({ ...t }));
  for (const t of reading.told) {
    const same = told.find((x) => norm(x.text) === norm(t.text));
    if (same) same.lastAt = at;
    else told.push({ kind: t.kind as ToldKind, text: t.text.trim(), firstAt: at, lastAt: at });
  }
  const references = ground.references.map((r) => ({ ...r }));
  for (const r of reading.references) {
    const same = references.find((x) => norm(x.phrase) === norm(r.phrase));
    if (same) {
      same.lastAt = at;
      same.meaning = r.meaning.trim();
    } else {
      references.push({ phrase: r.phrase.trim(), meaning: r.meaning.trim(), firstAt: at, lastAt: at });
    }
  }
  const newest = <T extends { lastAt: string }>(xs: T[], max: number) =>
    xs.sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, max);
  return { told: newest(told, MAX_TOLD), references: newest(references, MAX_REFERENCES) };
}

/** About 150 tokens: the note rides on the first turn of every call. */
export const GROUND_NOTE_MAX_CHARS = 600;

/**
 * The note for the first turn of a call, or null. Shorthand comes first (it's
 * what makes a friend sound like a friend), then what he's already told them,
 * newest first, as many lines as fit.
 */
export function formatCommonGround(
  ground: CommonGround,
  userName?: string,
  maxChars = GROUND_NOTE_MAX_CHARS
): string | null {
  const who = userName || 'them';
  const refs = ground.references.map((r) => `- "${r.phrase}" = ${r.meaning}`);
  const told = ground.told.map((t) => `- ${t.kind}: ${t.text}`);
  if (refs.length + told.length === 0) return null;
  const head = `[COMMON GROUND WITH ${who.toUpperCase()}]`;
  const tail =
    'Use the shorthand when it fits; you know what they mean by it. They heard what you told them: refer back ("like I said..."), never tell it as new.';
  let used = head.length + tail.length + 2;
  const lines: string[] = [];
  for (const [title, items] of [
    ['Shorthand you share:', refs],
    ["What you've already told them:", told],
  ] as const) {
    const fit: string[] = [];
    for (const line of items) {
      const cost = line.length + 1 + (fit.length === 0 ? title.length + 1 : 0);
      if (used + cost > maxChars) break;
      used += cost;
      fit.push(line);
    }
    if (fit.length > 0) lines.push(title, ...fit);
  }
  return lines.length > 0 ? [head, ...lines, tail].join('\n') : null;
}
