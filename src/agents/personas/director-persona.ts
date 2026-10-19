/**
 * Who the director is directing. After a handoff inside one session
 * (MULTI_AGENT_SINGLE_SESSION), the director still believed Ferni was talking:
 * it labelled every assistant line "Ferni", and on prod 2026-10-13 it saw the
 * caller say "Hey Jordan", wrote "Clarify that you are still Ferni, not
 * Jordan." and Jordan told the caller "Hey, I'm actually still Ferni."
 *
 * With DIRECTOR_PERSONA_AWARE=on the director is told which persona is on the
 * call now, each assistant line carries the name of the persona who said it,
 * and a note telling the speaker to claim who they are is dropped.
 *
 * @module agents/personas/director-persona
 */

import { flagOn } from '../../config/env-flag.js';
import { FINANCIAL_LEGENDS } from '../../personas/persona-ids.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';

export function directorPersonaAware(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('DIRECTOR_PERSONA_AWARE', env);
}

/**
 * What the director's system prompt adds about who is speaking now. `framed`
 * (DIRECTOR_SEES_SCENE=on): the instructions above are already written for
 * `name` (director-cast.ts), so nothing is carried over from Ferni's.
 */
export function speakerNote(name: string, framed = false): string {
  const never = `Never tell ${name === 'Ferni' ? 'him' : name} to say who they are, that they are someone else, or to correct who the caller thinks they are talking to.`;
  if (name === 'Ferni') return `Each line of the call is labelled with who said it. ${never}`;
  if (framed) {
    return `${name} is on the call now; earlier lines may be a teammate's. Each line of the call is labelled with who said it. A caller who talks to ${name} by name is right, not confused. ${never}`;
  }
  return [
    `Ferni handed this call to his teammate ${name}, who is on the call now. Your notes are for ${name}'s next reply, and what is said above about Ferni's habits applies to ${name}.`,
    `Each line of the call is labelled with who said it. A caller who talks to ${name} by name is right, not confused.`,
    never,
  ].join(' ');
}

const CORE_TEAM = [
  'ferni',
  'maya-santos',
  'alex-chen',
  'peter-john',
  'jordan-taylor',
  'nayan-patel',
] as const;

/**
 * Who the speaker's teammates are, so the director reads a request for one as
 * a transfer, not a slip. Dev call 2026-10-11: "Can I talk to Naya?"
 * (speech-to-text for Nayan) drew "They asked for Naya, not Nayan. He got
 * their friend's name wrong."
 */
export function teamNote(name: string): string {
  const legends = FINANCIAL_LEGENDS.map(getPersonaDisplayName);
  const team = (legends.includes(name) ? legends : CORE_TEAM.map(getPersonaDisplayName)).filter(
    (n) => n !== name
  );
  const list = team.length > 1 ? `${team.slice(0, -1).join(', ')} and ${team.at(-1)}` : team[0];
  return `${name}'s teammates are ${list}: colleagues on the team, not friends of the caller. A caller who asks for one of them, even by a name the transcript got slightly wrong, wants to be transferred; never treat it as a mistake.`;
}

/** A note that tells the speaker who to say they are ("Clarify that you are still Ferni, not Jordan."). */
const CLAIMS_IDENTITY =
  /\b(you are|you['’]re) (still|actually|really)\b|\b(clarify|explain|remind (them|him|her)) (that you|who)\b|\b(introduce|identify) yourself\b/i;

export function claimsIdentity(note: string): boolean {
  return CLAIMS_IDENTITY.test(note);
}

interface ItemAdded {
  item?: { id?: string; type?: string; role?: string };
}

/**
 * Remembers which persona said each assistant line, by chat item id, as the
 * lines are added to the session's chat. `personaId` reads the persona on the
 * call now (userData.personaId, which a swap updates).
 */
export class SpeakerLog {
  private readonly byId = new Map<string, string>();

  constructor(private readonly personaId: () => string | undefined) {}

  /** The display name of the persona on the call now. */
  readonly now = (): string => getPersonaDisplayName(this.personaId() || 'ferni');

  /** Handler for the session's conversation_item_added event. */
  readonly onItemAdded = (event: unknown): void => {
    const item = (event as ItemAdded)?.item;
    if (!item?.id || (item.type && item.type !== 'message') || item.role !== 'assistant') return;
    this.byId.set(item.id, this.now());
  };

  /** Who said a chat item, when it was added while this log listened. */
  readonly by = (item: { id?: string }): string | undefined =>
    item.id ? this.byId.get(item.id) : undefined;
}
