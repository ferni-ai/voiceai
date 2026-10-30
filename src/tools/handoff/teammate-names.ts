/**
 * Teammate names as speech-to-text hears them.
 *
 * The code that notices a caller asking for a teammate matched the exact first
 * name only. On dev 2026-10-11 the owner said "Can I talk to Nayan?", STT wrote
 * "Can I talk to Naya?", and nothing matched: the team line didn't name Nayan,
 * askForTeammate("Naya") would have answered "there's no teammate called Naya",
 * and the director decided Naya was a friend whose name Ferni got wrong.
 *
 * Only spellings STT produces for these names, and none that is a common
 * English word or another assistant ("Alexa"), so a caller's own friend is
 * rarely mistaken for a teammate. "Naya" is one letter from Maya too; it goes
 * to Nayan, whose final "n" is what STT drops.
 *
 * @module tools/handoff/teammate-names
 */

import { TEAM_MEMBERS, type TeamMemberId } from '../../services/team-unlocks.js';
import type { Env } from '../../config/env-flag.js';
import { aliasesInTransfer } from './transfer-aliases.js';

/** STT spellings of each teammate's first name (lowercase), the name itself aside. */
export const HEARD_AS: Readonly<Record<string, TeamMemberId>> = {
  naya: 'nayan-patel',
  nyan: 'nayan-patel',
  nian: 'nayan-patel',
  nayon: 'nayan-patel',
  niyan: 'nayan-patel',
  nayun: 'nayan-patel',
  nyon: 'nayan-patel',
  mya: 'maya-santos',
  maia: 'maya-santos',
  maiya: 'maya-santos',
  jordon: 'jordan-taylor',
  jorden: 'jordan-taylor',
  pete: 'peter-john',
};

const firstNameOf = (id: TeamMemberId): string =>
  TEAM_MEMBERS.find((m) => m.memberId === id)?.displayName ?? id;

/** The teammate a single spoken word is, by name or STT spelling; null for anything else. */
export function teammateHeardAs(word: string): TeamMemberId | null {
  const w = word.trim().toLowerCase();
  const byName = TEAM_MEMBERS.find((m) => m.displayName.toLowerCase() === w);
  if (byName) return byName.memberId;
  return Object.hasOwn(HEARD_AS, w) ? HEARD_AS[w] : null;
}

/** Each STT spelling in the caller's words, with the teammate it is. Whole words only. */
export function misheardTeammates(text: string): Array<{ heard: string; id: TeamMemberId }> {
  const seen = new Map<string, TeamMemberId>();
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (Object.hasOwn(HEARD_AS, word)) seen.set(word, HEARD_AS[word]);
  }
  return [...seen].map(([heard, id]) => ({ heard, id }));
}

const capitalized = (heard: string): string => heard[0].toUpperCase() + heard.slice(1);

/** How a turn may read transfer-only aliases; false on a call with crisis handling. */
export interface AliasNoteContext {
  env?: Env;
  /** The agent's line before the caller's words (911 or 988 there: no alias). */
  agentSaid?: string;
  /** Teammates locked for this caller: never a "may be" (teamStatusNote declines them). */
  locked?: readonly string[];
}

/**
 * One line for a turn whose words hold an STT spelling of a teammate's name,
 * so the model and the transfer it picks know who was asked for; '' otherwise.
 * A word that is only a teammate as the target of a transfer ("pass me to 9",
 * transfer-aliases.ts, TRANSFER_NAME_ALIASES) gets a "may be": the caller
 * could mean someone else. Never with crisis handling (`aliases` false).
 */
export function heardTeammateNote(
  callerWords: string,
  aliases: AliasNoteContext | false = false
): string {
  const sure = misheardTeammates(callerWords).map(({ heard, id }) => {
    const name = firstNameOf(id);
    return `"${capitalized(heard)}" is speech-to-text for ${name}, your teammate: they mean ${name}.`;
  });
  const aliased =
    aliases !== false ? aliasesInTransfer(callerWords, aliases.env, aliases.agentSaid) : [];
  const locked = aliases !== false ? (aliases.locked ?? []) : [];
  const maybe = aliased
    .filter(({ id }) => !locked.includes(id))
    .map(({ heard, id }) => {
      const name = firstNameOf(id);
      return `"${capitalized(heard)}" may be speech-to-text for ${name}, your teammate: if they are asking to be passed to a teammate, they mean ${name}.`;
    });
  return [...sure, ...maybe].join(' ');
}
