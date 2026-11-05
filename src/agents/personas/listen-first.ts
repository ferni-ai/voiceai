/**
 * Listen first: when the caller is low on energy, Ferni stops filling the call.
 *
 * Prod call 2026-10-11, 3:47 am for the caller: tired, answering in two or
 * three words ("that's true", "really?"). The turn shape read every one of
 * those as something shared and drew opinions, thinking aloud and stories of
 * his own, so Ferni told six bits about the mail on his table, then the
 * coffee, the kettle and the stove, while the director asked him about ten
 * times to drop the mail and let the caller lead. A friend on the phone at
 * that hour says less: a few words, now and then an easy question about
 * them, or just stays on the line.
 *
 * LISTEN_FIRST=on turns it on (off by default).
 *
 * @module agents/personas/listen-first
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { callerHour, isValidTimeZone } from '../shared/time-context.js';

export function listenFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LISTEN_FIRST === 'on';
}

/** Agreement or a polite reaction that adds nothing: "That's true as well.", "It's interesting." */
const AGREEMENT_ONLY =
  /^\W*(oh,?\s+|well,?\s+|yeah,?\s+|yep,?\s+)?((that|it)('s| is| was)?\s+(pretty |really |very |so )?(true|right|cute|interesting|funny|nice|cool|fair|good)|that it (is|does)|i (guess|suppose|know)|right|really|sure|mm+|hm+|okay|ok)(\s+(as well|too|then))?\W*$/i;

const LOW_INFO_WORDS = 5;

/** A turn that gives Ferni little to go on: five words or fewer, or agreement only. */
export function lowInformation(turn: string): boolean {
  const words = turn.trim().split(/\s+/).filter(Boolean).length;
  return words <= LOW_INFO_WORDS || AGREEMENT_ONLY.test(turn);
}

/** At least three of the caller's last four turns were short or agreement only. */
export function lowEnergyCaller(callerTurns: readonly string[]): boolean {
  const recent = callerTurns.slice(-4);
  return recent.length >= 3 && recent.filter(lowInformation).length >= 3;
}

/**
 * The caller's time zone as settled for this call: the device's (the app sends
 * it). The profile is never read here: on a phone call the account's zone may
 * belong to someone other than the caller (phone-parity.ts).
 */
export function callerTimeZoneOf(userData: unknown): string | undefined {
  const zone = (userData as { callerTimezone?: string } | undefined)?.callerTimezone;
  return isValidTimeZone(zone) ? zone : undefined;
}

/** 11 pm to 5 am where the caller is; unknown zone is not late night. */
export function lateNightFor(now: Date, callerTimeZone?: string): boolean {
  const hour = callerHour(now, callerTimeZone);
  return hour !== null && (hour >= 23 || hour < 5);
}

/**
 * A director note that pushes Ferni to talk about himself ("Break the pattern
 * by sharing a memory", "share a Wyoming winter memory"): the prod call's
 * stove and frosted-window stories came straight after two of them.
 */
const PUSHES_SHARING =
  /\b(share|sharing|tell (him|her|them)|telling (him|her|them))\b[^.]*\b(memory|story|stories|slice|bit|something|detail|your own|about (your|yourself))\b/i;

export function withoutSharingNotes(notes: readonly string[]): string[] {
  return notes.filter((n) => !PUSHES_SHARING.test(n));
}

/** Ferni has already offered to let them sleep or wind down. */
const OFFERED_SLEEP =
  /\b(try (to|and) (get some )?sleep|get some (sleep|rest)|go back to sleep|call it a night|head (to|off to) bed)\b/i;

export interface ListeningCues {
  /** Ferni's previous reply asked a question: this one doesn't (one at most every other turn). */
  askedLastTime: boolean;
  lateNight: boolean;
  /** No line may bar a question on this turn (exits-held.ts). */
  exitsHeld?: boolean;
  /** Ferni's replies so far on the call, to offer sleep only once. */
  ferniLines: readonly string[];
  /** The caller asked about Ferni himself. */
  aboutFerni: boolean;
}

const LISTEN =
  "They're low on energy right now and answering in a few words. Listen more than you talk: a few words or one short sentence. " +
  "No stories, opinions or news of your own, nothing from your own day, and don't fill the quiet; it's fine to just be on the line with them.";
const ABOUT_YOU_BRIEFLY =
  'They asked about you: answer honestly in a few words, no story, and leave the room to them.';
const ASK_ALLOWED =
  'You may ask one easy question about them if you really want to know, not how they feel; or just keep them company.';
const NO_QUESTION = 'No question this time: a short, warm reaction to what they said is enough.';
const LATE =
  "It's the middle of the night for them: keep it soft and slow. Being company is enough.";
const OFFER_SLEEP =
  'If it fits, you can gently ask whether they want to try to get some sleep, or just keep them company.';

interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The caller's turns (their messages between Ferni's replies, joined) and Ferni's replies, in order. */
export function turnsOf(items: readonly ItemView[]): { caller: string[]; ferni: string[] } {
  const caller: string[] = [];
  const ferni: string[] = [];
  let open = false; // the caller's turn is still going (no reply since their last message)
  for (const item of items) {
    if (item.type !== 'message') continue;
    // A per-turn reminder rides after a blank line; spoken words never hold one.
    const text = (item.textContent ?? '').split('\n')[0].trim();
    if (!text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'assistant') {
      ferni.push(text);
      open = false;
    } else if (item.role === 'user') {
      if (open) caller[caller.length - 1] += ` ${text}`;
      else caller.push(text);
      open = true;
    }
  }
  return { caller, ferni };
}

/** The cues for a listening reply, or null when the caller isn't low on energy. */
export function listeningCuesFor(
  items: readonly ItemView[],
  callerTimeZone: string | undefined,
  now: Date = new Date()
): Omit<ListeningCues, 'aboutFerni'> | null {
  const { caller, ferni } = turnsOf(items);
  if (!lowEnergyCaller(caller)) return null;
  return {
    askedLastTime: (ferni[ferni.length - 1] ?? '').includes('?'),
    lateNight: lateNightFor(now, callerTimeZone),
    ferniLines: ferni,
  };
}

/** The turn reminder's lines for a reply in listening mode. */
export function listeningLines(cues: ListeningCues): string[] {
  const lines = [LISTEN];
  if (cues.aboutFerni) lines.push(ABOUT_YOU_BRIEFLY);
  if (cues.lateNight) {
    lines.push(LATE);
    if (!cues.ferniLines.some((l) => OFFERED_SLEEP.test(l))) lines.push(OFFER_SLEEP);
  }
  if (!cues.askedLastTime) lines.push(ASK_ALLOWED);
  else if (!cues.exitsHeld) lines.push(NO_QUESTION);
  return lines;
}
