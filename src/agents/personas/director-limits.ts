/**
 * Limits the next replies must keep, not hints they may weigh.
 *
 * Prod call 2026-10-11: the director wrote "drop the mail topic", "stop
 * talking about your mail", "drop the habit of filling every silence with a
 * new detail about your kitchen routine" about ten times, and the mail came
 * back six times. The notes did reach the requests (written about a second
 * after each reply ended, before the caller's next turn), but as hints the
 * character sheet says to use only when they fit, and each lasted one reply.
 * Two things change with LISTEN_FIRST=on:
 *
 * - A note that says to drop, stop or avoid something becomes a limit that
 *   holds for the next LIMIT_REPLIES replies, said plainly as a rule. It also
 *   covers the replies between a reply ending and the director's next note.
 * - Anything of his own Ferni has raised in two or more replies, which the
 *   caller never said (the mail, the table, the coffee), is off limits for the
 *   rest of the call unless the caller brings it up. Kept in code from the
 *   call's lines, ready at once.
 *
 * @module agents/personas/director-limits
 */

import type { Line } from './director-notes.js';

/** The LISTEN_FIRST flag (off by default); listen-first.ts reads the same one. */
export function directorLimitsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.LISTEN_FIRST === 'on';
}

/** How many replies a "drop it" note holds for. */
export const LIMIT_REPLIES = 4;
const MAX_LIMITS = 4;
const MAX_TOPICS = 5;

/**
 * "Drop the mail topic now; ...", "Stop talking about your mail and focus on
 * him", "Avoid pointing out his fatigue again", "Don't push him to explain".
 * The clause runs to the end of the sentence, a semicolon or comma, or an
 * "and"/"or" that starts what to do instead.
 */
const LIMIT =
  /\b(drop|stop|avoid|quit|no more|don'?t|do not|never)\s+(.+?)(?=[.;,!?]|\s+(?:and|but|instead|so)\s|$)/gi;
/** Trailing words that carry no limit ("drop the mail topic now"). */
const TRAILING = /\s+(?:now|already|for now|for a bit|right now)$/i;

/** The limits a set of director notes sets, as short instructions ("drop the mail topic"). */
export function limitsFromNotes(notes: readonly string[]): string[] {
  const out: string[] = [];
  for (const note of notes) {
    for (const m of note.matchAll(LIMIT)) {
      const clause = m[2].replace(TRAILING, '').trim();
      // A fragment too short to say what to leave alone.
      if (clause.split(/\s+/).length < 2) continue;
      const limit = `${m[1].toLowerCase()} ${clause}`;
      if (!out.includes(limit)) out.push(limit);
    }
  }
  return out;
}

/** Words that say nothing about a topic of Ferni's own. */
const NOT_TOPICS = new Set(
  (
    'about above after again against almost alone along already also although always another anyone anything anyway around away ' +
    'back because been before being below best better between both bring came come comes coming could couldn didn doesn doing done ' +
    'down during each either else enough even ever every everything exactly feel feels felt first found from gets getting give given ' +
    'goes going gone gonna good great guess hard have having here herself himself honestly hope however into just keep kind know knew ' +
    'last least less like likely little long look looks lose lost made make makes making many maybe mean means might mind more most much ' +
    'must myself near need never next nice nothing okay once only other others over pretty probably quite rather real really right ' +
    'said same seem seems should since some someone something sometimes somewhere soon sort still such sure take than thank thanks ' +
    'that their them then there these they thing things think thinking this those though thought through time times today together ' +
    'tomorrow tonight totally true turn under until upon very want wanted wants well went were what whatever when where whether which ' +
    'while whole will wish with without wonder would yeah year years your yours yourself actually basically completely definitely funny ' +
    'literally mostly seriously simply sorry truly usually wait alright night morning week minute minutes second seconds hour hours ' +
    'talk talking tell told say saying says call calling still here there sound sounds yes late early'
  ).split(' ')
);

function topicWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return new Set(words.filter((w) => w.length >= 4 && !w.includes("'") && !NOT_TOPICS.has(w)));
}

/** Plural and singular both count as the caller bringing it up. */
const stem = (w: string): string => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);

/**
 * Words Ferni used in two or more of his replies that the caller never said,
 * most-repeated first: what he keeps bringing back on his own.
 */
export function repeatedOwnTopics(lines: readonly Line[], userName?: string): string[] {
  // Their own name isn't something Ferni brought up.
  const callerSaid = new Set(
    lines
      .filter((l) => l.speaker === 'user')
      .map((l) => l.text)
      .concat(userName ?? '')
      .flatMap((t) => [...topicWords(t)].map(stem))
  );
  const replies = new Map<string, number>();
  for (const line of lines) {
    if (line.speaker !== 'ferni') continue;
    for (const w of topicWords(line.text))
      if (!callerSaid.has(stem(w))) replies.set(w, (replies.get(w) ?? 0) + 1);
  }
  return [...replies]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOPICS)
    .map(([w]) => w);
}

/** Limits set by director notes, each kept for LIMIT_REPLIES replies after the one it followed. */
export class ReplyLimits {
  private limits: Array<{ text: string; setAt: number }> = [];

  /** Notes written after reply number `reply`. */
  add(notes: readonly string[], reply: number): void {
    for (const text of limitsFromNotes(notes)) {
      this.limits = this.limits.filter((l) => l.text !== text);
      this.limits.push({ text, setAt: reply });
    }
  }

  /** The limits in force for the reply after reply number `reply`, newest last. */
  active(reply: number): string[] {
    this.limits = this.limits.filter((l) => reply - l.setAt < LIMIT_REPLIES);
    return this.limits.slice(-MAX_LIMITS).map((l) => l.text);
  }
}

/** The limits as the line the next request carries, or ''. */
export function formatLimits(limits: readonly string[], topics: readonly string[]): string {
  const parts: string[] = [];
  if (limits.length) parts.push(`${limits.join('; ')}.`);
  if (topics.length)
    parts.push(
      `You've brought up ${topics.join(', ')} more than once and they haven't: leave them for the rest of the call unless they bring them up.`
    );
  return parts.length ? `[Rules for this reply, not suggestions: ${parts.join(' ')}]` : '';
}
