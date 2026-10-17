/**
 * "I'll remember: …" in the app, the moment rememberAboutUser has stored a fact.
 *
 * The app's Moments pill had nothing telling it when Ferni kept something, so
 * a caller never saw it happen. After a successful store the tool calls
 * announceRemembered, which sends one `ferni_moment` data message
 * (`{ kind: 'remembered', summary }`) to the caller's room; the app shows it
 * (apps/web/src/app/moment-messages.ts). Nothing is sent when:
 * - the flag is off (REMEMBER_MOMENT=on turns it on), or there is no call;
 * - the fact is emotional or financial: a pill on screen is seen by whoever
 *   is near the phone, so those stay unspoken;
 * - the fact holds an email, a link or a long number;
 * - the fact is about a topic the caller asked Ferni to forget, or the
 *   forgotten topics can't be read (fail closed).
 *
 * The summary is the stored fact (the model's short paraphrase, never the
 * transcript), trimmed to a pill's length.
 *
 * The forget check and the room are the session's, so the session layer hands
 * them in (agents/realtime/remember-moment-ports.ts); until it has, nothing is sent.
 *
 * @module tools/domains/memory/remember-moment
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

export const MOMENT_MESSAGE_TYPE = 'ferni_moment';
/** Longest summary shown, in characters. */
export const MAX_SUMMARY_CHARS = 60;

/** Categories of rememberAboutUser that may show on screen. */
const ON_SCREEN = new Set(['personal', 'goal', 'preference']);
/** An email, a link, or a run of seven or more digits (phone, card, account); a year is fine. */
const UNSAFE = /\S+@\S+\.\S+|https?:\/\/|www\.|(?:\d[\s().-]*){7,}/i;
const EDGE = /^[\s"'“”‘’]+|[\s"'“”‘’.!,;:]+$/g;

export function rememberMomentEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REMEMBER_MOMENT?.trim().toLowerCase() === 'on';
}

/** The pill's text for a stored fact, or null when it shouldn't be shown. */
export function momentSummary(fact: string): string | null {
  const text = fact.replace(/\s+/g, ' ').replace(EDGE, '');
  if (!text || UNSAFE.test(text)) return null;
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  const cut = text.slice(0, MAX_SUMMARY_CHARS - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > MAX_SUMMARY_CHARS / 2 ? cut.slice(0, atWord) : cut).replace(EDGE, '')}…`;
}

export interface RememberedFact {
  userId: string;
  sessionId: string | undefined;
  fact: string;
  category: string;
}

/** What the session hands in. */
export interface MomentPorts {
  /** Is `text` about a topic the caller asked to forget? null when that can't be known. */
  isForgotten: (userId: string, text: string) => Promise<boolean | null>;
  /** Publish to the call's room; false when nothing was delivered. */
  send: (sessionId: string, type: string, payload: Record<string, unknown>) => Promise<boolean>;
}

let ports: MomentPorts | null = null;

/** Called by the session layer once a room can be reached; null unplugs (tests). */
export function setRememberMomentPorts(next: MomentPorts | null): void {
  ports = next;
}

/**
 * Tell the app a fact was stored. Call only after the store succeeded.
 * Never throws; resolves true only when a moment was sent.
 */
export async function announceRemembered(
  fact: RememberedFact,
  env: Record<string, string | undefined> = process.env,
  via: MomentPorts | null = ports
): Promise<boolean> {
  if (!via || !rememberMomentEnabled(env) || !fact.sessionId) return false;
  if (!ON_SCREEN.has(fact.category)) return false;
  const summary = momentSummary(fact.fact);
  if (!summary) return false;
  try {
    // Only a definite "not forgotten" lets the moment through.
    if ((await via.isForgotten(fact.userId, fact.fact)) !== false) return false;
    return await via.send(fact.sessionId, MOMENT_MESSAGE_TYPE, { kind: 'remembered', summary });
  } catch (error) {
    log.warn({ error: String(error) }, 'Remember moment not sent');
    return false;
  }
}
