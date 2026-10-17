/**
 * When a persona's own life comes into a call, and which part of it
 * (PERSONA_BEATS=on). The persona bundles hold a life script (Ferni: Wyoming,
 * a decade in Japan, his wife, his friends, his mentor's death, depression).
 * This decides how it's played: the script, not new chapters; light beats on a
 * first call; a heavy chapter only when the caller brings something close to
 * it and the two of them have history.
 *
 * Measured 2026-10-12 (canon judge over 25 simulated first calls on dev's
 * prompt path): 13/25 calls had Ferni state a life fact his bible doesn't have
 * or contradicts, mostly a made-up experience to match the caller's ("back
 * when I was pulling long shifts", "my first car broke down", "my sister and I
 * butted heads"); 5 of 6 heavy beats came on a first call, right after the
 * caller shared something hard.
 *
 * How often he talks about himself at all is FERNI_STATE's self-share budget
 * (ferni-state.ts, ferni-self-share.ts); this only shapes what he draws on.
 *
 * @module agents/personas/personal-beats
 */

import { flagOn } from '../../config/env-flag.js';

/** Prior calls before a heavy chapter may come up (this is at least the fourth call). */
export const TRUSTED_AFTER_CALLS = 3;

/**
 * The caller is on ground close to a heavy chapter: a death or grief,
 * depression, losing a job, a hard parent, a relationship ending.
 */
const HEAVY_TOPIC =
  /\b(?:died|dies|dying(?! to)|passed away|passed on|funeral|grie(?:f|ving|ve)|miss (?:him|her|them) so|lost my (?:mom|mother|dad|father|wife|husband|son|daughter|brother|sister|friend|best friend|grandma|grandpa|job)|depress(?:ed|ion)|can'?t get out of bed|dark place|therap(?:y|ist)|fired(?! up)|laid off|let go from|my (?:dad|father)\b(?! (?:said|says|called|texted))|divorc(?:e|ed|ing)|broke up|breakup|split up|separated)\b/i;

export function nearHeavyChapter(said: string): boolean {
  return HEAVY_TOPIC.test(said);
}

/** Every turn: the script, not a new one. */
export const CANON_LINE =
  "Anything you say about your own life comes from your life as written above (small things from today are fine). Don't invent a job, a relative, a place you lived or an experience to match theirs; if nothing in your life is like it, react to theirs instead.";

export const FIRST_CALL_LINE =
  'This is your first call with them. If something of yours comes up, keep it to one small, light thing from your days, not a story, and nothing heavy from your past. If they ask you straight out about something hard, one plain sentence is enough.';

export const LIGHT_LINE =
  "They're on hard ground. Keep this reply on them: nothing heavy from your own past, and if you share at all, keep it light.";

export const HEAVY_OK_LINE =
  'What they told you is close to something hard in your own past. Only if it truly fits: one plain sentence of it, then straight back to them. Never the whole story, and never more than they shared.';

export interface BeatInputs {
  /** The caller's words this reply answers. */
  said: string;
  /** Calls with this caller before this one, when known. */
  priorCalls?: number;
  /** Crisis guidance rides this reply: no beat lines at all. */
  careful?: boolean;
}

/** The beat line for this reply ('' when the flag is off or crisis guidance rides it). */
export function beatNote(
  i: BeatInputs,
  env: Record<string, string | undefined> = process.env
): string {
  if (!flagOn('PERSONA_BEATS', env) || i.careful) return '';
  const near = nearHeavyChapter(i.said);
  const lines = [CANON_LINE];
  if (i.priorCalls === 0) lines.push(FIRST_CALL_LINE);
  else if (near && (i.priorCalls ?? 0) >= TRUSTED_AFTER_CALLS) lines.push(HEAVY_OK_LINE);
  else if (near) lines.push(LIGHT_LINE);
  return lines.join(' ');
}

interface UserDataView {
  isReturningUser?: boolean;
  services?: { userProfile?: { totalConversations?: number } };
}

/** Prior calls from the session's user data: the profile count, or 0 for a new caller. */
export function priorCallsOf(userData: unknown): number | undefined {
  const u = userData as UserDataView | undefined;
  const total = u?.services?.userProfile?.totalConversations;
  if (typeof total === 'number') return total;
  return u?.isReturningUser === false ? 0 : undefined;
}
